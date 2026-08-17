/**
 * Ingestion: a Drizzle schema module in, the canonical HoBo schema IR out.
 *
 * This is the parse boundary of the package. It takes an untrusted bag of
 * module exports and returns a derived type — `SchemaIr` as parsed by
 * `@hobo/core` — plus the impedance findings that say what could not be
 * carried across. HoBo owns the IR; Drizzle is an authoring surface, not the
 * source of truth (ADR-0160).
 *
 * Determinism is a hard requirement: the same module ingested twice must be
 * deep-equal including ordering, because the plan digest downstream is a hash
 * over this output. Every collection is therefore sorted by name, and export
 * keys are walked in sorted order so that "first one wins" tie-breaks do not
 * depend on module authoring order.
 */

import {
	parseSchemaIr,
	SCHEMA_IR_CONTRACT,
	type SchemaColumn,
	type SchemaIndex,
	type SchemaIr,
	type SchemaTable,
} from "@hobo/core";
import { DrizzleAdapterError } from "./errors.js";
import { type DrizzleImpedanceFinding, sortImpedance } from "./impedance.js";
import { compareText } from "./order.js";
import {
	asRecord,
	type DrizzleColumnLike,
	type DrizzleIndexLike,
	extraConfigBuilder,
	extraConfigColumns,
	hasInlineForeignKeys,
	isDrizzleColumn,
	isDrizzleTable,
	isDrizzleView,
	isNonPostgresColumn,
	readColumnSqlType,
	readIndexBuilder,
	tableColumns,
	tableName,
	tableSchema,
	type UnknownRecord,
} from "./shape.js";

export interface DrizzleIngestOptions {
	readonly dialect?: "postgres";
}

export interface DrizzleIngestResult {
	readonly schema: SchemaIr;
	readonly impedance: readonly DrizzleImpedanceFinding[];
}

/**
 * Structural ingestion of a Drizzle schema module's exported table objects.
 * Unrecognized constructs are collected as impedance findings, never silently
 * dropped and never thrown over.
 */
export function ingestDrizzleSchema(
	moduleExports: Readonly<Record<string, unknown>>,
	options?: DrizzleIngestOptions,
): DrizzleIngestResult {
	if (typeof moduleExports !== "object" || moduleExports === null) {
		throw new DrizzleAdapterError(
			"DRIZZLE_INGEST_INPUT_INVALID",
			"ingestDrizzleSchema expects a module namespace object of exports.",
			'Pass the result of `import * as schema from "./schema.js"` (or an equivalent record of exports).',
		);
	}
	const dialect = options?.dialect ?? "postgres";
	if (dialect !== "postgres") {
		throw new DrizzleAdapterError(
			"DRIZZLE_DIALECT_UNSUPPORTED",
			`Dialect "${String(dialect)}" is not supported by this adapter.`,
			'Ingest a postgres Drizzle schema, or omit `dialect` to accept the "postgres" default.',
		);
	}

	const findings: DrizzleImpedanceFinding[] = [];
	const tablesByName = new Map<string, SchemaTable>();
	const exportKeyByTableName = new Map<string, string>();

	for (const exportKey of Object.keys(moduleExports).sort()) {
		const value = moduleExports[exportKey];
		if (isDrizzleView(value)) {
			findings.push({
				code: "DRIZZLE_VIEW_UNREAD",
				detail: `Export "${exportKey}" is a Drizzle view; the canonical schema IR models tables only.`,
			});
			continue;
		}
		if (!isDrizzleTable(value)) {
			findings.push({
				code: "DRIZZLE_EXPORT_UNRECOGNIZED",
				detail: `Export "${exportKey}" (${describe(value)}) is not a Drizzle table and was not ingested.`,
			});
			continue;
		}
		const table = readTable(exportKey, value, findings);
		if (table === undefined) continue;
		const previousKey = exportKeyByTableName.get(table.name);
		if (previousKey !== undefined) {
			findings.push({
				code: "DRIZZLE_TABLE_NAME_DUPLICATE",
				detail: `Exports "${previousKey}" and "${exportKey}" both declare table "${table.name}"; the first by export name was kept.`,
			});
			continue;
		}
		exportKeyByTableName.set(table.name, exportKey);
		tablesByName.set(table.name, table);
	}

	const tables = [...tablesByName.values()].sort((left, right) =>
		compareText(left.name, right.name),
	);
	const schema = parseSchemaIr({
		contract: SCHEMA_IR_CONTRACT,
		dialect: "postgres",
		tables,
	});

	return Object.freeze({
		schema,
		impedance: sortImpedance(findings),
	});
}

function readTable(
	exportKey: string,
	table: object,
	findings: DrizzleImpedanceFinding[],
): SchemaTable | undefined {
	const name = tableName(table);
	const schema = tableSchema(table);
	if (schema !== undefined) {
		findings.push({
			code: "DRIZZLE_TABLE_SCHEMA_UNREPRESENTABLE",
			detail: `Table "${name}" is bound to postgres schema "${schema}"; the canonical IR has no schema qualifier and treats it as unqualified.`,
		});
	}
	if (hasInlineForeignKeys(table)) {
		findings.push({
			code: "DRIZZLE_FOREIGN_KEY_UNREAD",
			detail: `Table "${name}" declares inline foreign keys; the canonical IR has no foreign-key concept, so referential constraints are not diffed.`,
		});
	}

	const columns = readColumns(name, tableColumns(table), findings);
	if (columns.length === 0) {
		findings.push({
			code: "DRIZZLE_TABLE_COLUMNS_EMPTY",
			detail: `Export "${exportKey}" is table-shaped but yielded no readable columns, so no table was emitted for "${name}".`,
		});
		return undefined;
	}

	return Object.freeze({
		name,
		columns: Object.freeze(columns),
		indexes: Object.freeze(readIndexes(name, table, findings)),
	});
}

function readColumns(
	table: string,
	columnMap: UnknownRecord,
	findings: DrizzleImpedanceFinding[],
): SchemaColumn[] {
	const columns: SchemaColumn[] = [];
	for (const propertyName of Object.keys(columnMap).sort()) {
		const value = columnMap[propertyName];
		if (!isDrizzleColumn(value)) {
			findings.push({
				code: "DRIZZLE_COLUMN_UNRECOGNIZED",
				detail: `Property "${propertyName}" of table "${table}" (${describe(value)}) is not a readable column descriptor.`,
			});
			continue;
		}
		if (isNonPostgresColumn(value)) {
			findings.push({
				code: "DRIZZLE_NON_POSTGRES_TABLE",
				detail: `Column "${value.name}" of table "${table}" has dialect-specific type "${String(value.columnType)}"; this adapter ingests postgres only.`,
			});
			continue;
		}
		const type = readColumnSqlType(value);
		if (type === undefined) {
			findings.push({
				code: "DRIZZLE_COLUMN_TYPE_UNREADABLE",
				detail: `Column "${value.name}" of table "${table}" exposed no readable SQL type.`,
			});
			continue;
		}
		columns.push(readColumn(table, value, type, findings));
	}
	return columns.sort((left, right) => compareText(left.name, right.name));
}

function readColumn(
	table: string,
	column: DrizzleColumnLike,
	type: string,
	findings: DrizzleImpedanceFinding[],
): SchemaColumn {
	const primaryKey = column.primary === true;
	const defaultExpression = readDefault(table, column, findings);
	return Object.freeze({
		name: column.name,
		type,
		// A primary key is not nullable even when the descriptor omits notNull.
		nullable: column.notNull !== true && !primaryKey,
		primaryKey,
		unique: column.isUnique === true,
		...(defaultExpression !== undefined ? { defaultExpression } : {}),
	});
}

/**
 * Only literal defaults survive into the IR. A SQL expression object or a
 * runtime `defaultFn` is Drizzle-side behavior the IR cannot reproduce, so it
 * becomes a finding instead of a guessed expression string.
 */
function readDefault(
	table: string,
	column: DrizzleColumnLike,
	findings: DrizzleImpedanceFinding[],
): string | undefined {
	const hasDefault = column.hasDefault === true || column.default !== undefined;
	if (!hasDefault) return undefined;
	if (typeof column.defaultFn === "function") {
		findings.push({
			code: "DRIZZLE_DEFAULT_UNREPRESENTABLE",
			detail: `Column "${column.name}" of table "${table}" has a runtime default function; it is applied by Drizzle at insert time and is not part of the schema.`,
		});
		return undefined;
	}
	const value = column.default;
	if (typeof value === "string") return `'${value.replace(/'/gu, "''")}'`;
	if (typeof value === "number" || typeof value === "bigint") {
		return String(value);
	}
	if (typeof value === "boolean") return value ? "true" : "false";
	if (value === null) return "null";
	findings.push({
		code: "DRIZZLE_DEFAULT_UNREPRESENTABLE",
		detail: `Column "${column.name}" of table "${table}" has a non-literal default (${describe(value)}); it is not carried into the canonical IR.`,
	});
	return undefined;
}

/**
 * Indexes live in a table's extra-config callback rather than on the table
 * object, so reading them means invoking that callback with the table's
 * extra-config columns. The call is guarded: third-party code that throws, or
 * returns builders this adapter cannot read, produces a finding rather than a
 * crash or a silently index-free table.
 */
function readIndexes(
	table: string,
	tableValue: object,
	findings: DrizzleImpedanceFinding[],
): SchemaIndex[] {
	const builder = extraConfigBuilder(tableValue);
	if (builder === undefined) return [];

	let produced: unknown;
	try {
		produced = builder(extraConfigColumns(tableValue));
	} catch (cause) {
		findings.push({
			code: "DRIZZLE_EXTRA_CONFIG_UNREAD",
			detail: `Table "${table}" has an extra-config callback that threw when read (${describe(cause)}); indexes and constraints declared there were not ingested.`,
		});
		return [];
	}

	const entries = extraConfigEntries(produced);
	if (entries === undefined) {
		findings.push({
			code: "DRIZZLE_EXTRA_CONFIG_UNREAD",
			detail: `Table "${table}" has an extra-config callback returning ${describe(produced)}; only arrays and records of index builders are readable.`,
		});
		return [];
	}

	const indexes: SchemaIndex[] = [];
	for (const [entryKey, entryValue] of entries) {
		const read: DrizzleIndexLike | undefined = readIndexBuilder(entryValue);
		if (read === undefined) {
			findings.push({
				code: "DRIZZLE_EXTRA_CONFIG_UNREAD",
				detail: `Extra-config entry "${entryKey}" of table "${table}" (${describe(entryValue)}) is not a readable index builder; it was not ingested.`,
			});
			continue;
		}
		indexes.push(
			Object.freeze({
				name: read.name,
				columns: Object.freeze([...read.columns]),
				unique: read.unique,
			}),
		);
	}
	return indexes.sort((left, right) => compareText(left.name, right.name));
}

function extraConfigEntries(
	produced: unknown,
): readonly (readonly [string, unknown])[] | undefined {
	if (Array.isArray(produced)) {
		return produced.map(
			(entry, index) => [String(index), entry] as readonly [string, unknown],
		);
	}
	const record = asRecord(produced);
	if (record === undefined) return undefined;
	return Object.keys(record)
		.sort()
		.map((key) => [key, record[key]] as readonly [string, unknown]);
}

/** Short, deterministic description of an unknown value for finding details. */
function describe(value: unknown): string {
	if (value === null) return "null";
	if (Array.isArray(value)) return "array";
	if (value instanceof Error) return `${value.name}: ${value.message}`;
	const type = typeof value;
	if (type !== "object") return type;
	const named = constructorName(value as object);
	return named === undefined ? "object" : `object<${named}>`;
}

/** Class name of a non-plain object, so a finding can name what it met. */
function constructorName(value: object): string | undefined {
	const prototype: unknown = Object.getPrototypeOf(value);
	if (prototype === null || prototype === Object.prototype) return undefined;
	const factory = (prototype as { readonly constructor?: unknown }).constructor;
	if (typeof factory !== "function") return undefined;
	return factory.name.length > 0 ? factory.name : undefined;
}
