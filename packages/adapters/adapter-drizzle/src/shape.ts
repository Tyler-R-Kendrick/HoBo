/**
 * Structural recognition of Drizzle ORM values.
 *
 * This package deliberately does **not** depend on `drizzle-orm`. A HoBo
 * adapter that pulled the ORM into the dependency graph would make every
 * consumer of the schema-diff port carry an ORM they may not use, and would
 * pin the ORM's major version into HoBo's own release train. Instead the
 * adapter reads the shape Drizzle actually publishes on its objects: the
 * `Symbol.for("drizzle:*")` well-known symbols and the plain properties of a
 * column descriptor. Those symbols are the ORM's cross-instance contract —
 * they are registry symbols precisely so that separately-installed copies of
 * `drizzle-orm` interoperate — which makes them the honest thing to match on.
 *
 * Everything here is a predicate or a reader. Nothing throws: an unreadable
 * value is reported to the caller, which turns it into an impedance finding.
 */

/** Well-known Drizzle registry symbols (see `Table.Symbol` in `drizzle-orm`). */
export const DRIZZLE_NAME_SYMBOL = Symbol.for("drizzle:Name");
export const DRIZZLE_COLUMNS_SYMBOL = Symbol.for("drizzle:Columns");
export const DRIZZLE_EXTRA_CONFIG_COLUMNS_SYMBOL = Symbol.for(
	"drizzle:ExtraConfigColumns",
);
export const DRIZZLE_EXTRA_CONFIG_BUILDER_SYMBOL = Symbol.for(
	"drizzle:ExtraConfigBuilder",
);
export const DRIZZLE_SCHEMA_SYMBOL = Symbol.for("drizzle:Schema");
export const DRIZZLE_IS_VIEW_SYMBOL = Symbol.for("drizzle:IsDrizzleView");

/**
 * Inline foreign keys are stored under a dialect-prefixed symbol
 * (`drizzle:PgInlineForeignKeys`, `drizzle:MySqlInlineForeignKeys`, …), so the
 * reader matches by description suffix rather than by an exact symbol.
 */
const INLINE_FOREIGN_KEYS_SUFFIX = "InlineForeignKeys";

/** Column type prefixes that identify a non-postgres Drizzle dialect. */
const NON_POSTGRES_COLUMN_PREFIXES = Object.freeze([
	"MySql",
	"SQLite",
	"SingleStore",
] as const);

export type UnknownRecord = Readonly<Record<string, unknown>>;

/** Narrows to an indexable object without asserting anything about its keys. */
export function asRecord(value: unknown): UnknownRecord | undefined {
	return typeof value === "object" && value !== null
		? (value as UnknownRecord)
		: undefined;
}

function symbolValue(value: object, symbol: symbol): unknown {
	return (value as Record<symbol, unknown>)[symbol];
}

function ownSymbolsOf(value: object): readonly symbol[] {
	const seen: symbol[] = [];
	let cursor: object | null = value;
	while (cursor !== null && cursor !== Object.prototype) {
		seen.push(...Object.getOwnPropertySymbols(cursor));
		cursor = Object.getPrototypeOf(cursor) as object | null;
	}
	return seen;
}

/** A Drizzle table publishes both a SQL name and a column map under registry symbols. */
export function isDrizzleTable(value: unknown): value is object {
	if (typeof value !== "object" || value === null) return false;
	if (symbolValue(value, DRIZZLE_IS_VIEW_SYMBOL) === true) return false;
	return (
		typeof symbolValue(value, DRIZZLE_NAME_SYMBOL) === "string" &&
		asRecord(symbolValue(value, DRIZZLE_COLUMNS_SYMBOL)) !== undefined
	);
}

export function isDrizzleView(value: unknown): value is object {
	return (
		typeof value === "object" &&
		value !== null &&
		symbolValue(value, DRIZZLE_IS_VIEW_SYMBOL) === true
	);
}

export function tableName(table: object): string {
	const name = symbolValue(table, DRIZZLE_NAME_SYMBOL);
	return typeof name === "string" ? name : "";
}

/** The non-default postgres schema a table is bound to, when it declares one. */
export function tableSchema(table: object): string | undefined {
	const schema = symbolValue(table, DRIZZLE_SCHEMA_SYMBOL);
	return typeof schema === "string" && schema.length > 0 ? schema : undefined;
}

export function tableColumns(table: object): UnknownRecord {
	return asRecord(symbolValue(table, DRIZZLE_COLUMNS_SYMBOL)) ?? {};
}

export function extraConfigColumns(table: object): UnknownRecord {
	return (
		asRecord(symbolValue(table, DRIZZLE_EXTRA_CONFIG_COLUMNS_SYMBOL)) ??
		tableColumns(table)
	);
}

export function extraConfigBuilder(
	table: object,
): ((columns: UnknownRecord) => unknown) | undefined {
	const builder = symbolValue(table, DRIZZLE_EXTRA_CONFIG_BUILDER_SYMBOL);
	return typeof builder === "function"
		? (builder as (columns: UnknownRecord) => unknown)
		: undefined;
}

/** True when the table carries at least one inline foreign key under any dialect symbol. */
export function hasInlineForeignKeys(table: object): boolean {
	for (const symbol of ownSymbolsOf(table)) {
		if (symbol.description?.endsWith(INLINE_FOREIGN_KEYS_SUFFIX) !== true) {
			continue;
		}
		const value = symbolValue(table, symbol);
		if (Array.isArray(value) && value.length > 0) return true;
	}
	return false;
}

export interface DrizzleColumnLike {
	readonly name: string;
	readonly columnType?: string;
	readonly dataType?: string;
	readonly notNull?: boolean;
	readonly primary?: boolean;
	readonly isUnique?: boolean;
	readonly hasDefault?: boolean;
	readonly default?: unknown;
	readonly defaultFn?: unknown;
	readonly getSQLType?: () => unknown;
}

/** A column descriptor is anything with a SQL name plus one readable type source. */
export function isDrizzleColumn(value: unknown): value is DrizzleColumnLike {
	const record = asRecord(value);
	if (record === undefined) return false;
	if (typeof record.name !== "string" || record.name.length === 0) {
		return false;
	}
	return (
		typeof record.getSQLType === "function" ||
		typeof record.columnType === "string" ||
		typeof record.dataType === "string"
	);
}

/**
 * Reads the SQL type in the order Drizzle itself would: the rendered SQL type
 * first (it carries length/precision), then the class discriminator, then the
 * coarse JS data type. `getSQLType` is invoked defensively — it is third-party
 * code and a throw here must become a finding, not a crash.
 */
export function readColumnSqlType(
	column: DrizzleColumnLike,
): string | undefined {
	const rendered = renderedSqlType(column);
	if (rendered !== undefined) return rendered;
	if (typeof column.columnType === "string" && column.columnType.length > 0) {
		return normalizeColumnType(column.columnType);
	}
	if (typeof column.dataType === "string" && column.dataType.length > 0) {
		return column.dataType;
	}
	return undefined;
}

function renderedSqlType(column: DrizzleColumnLike): string | undefined {
	if (typeof column.getSQLType !== "function") return undefined;
	try {
		const rendered = column.getSQLType();
		return typeof rendered === "string" && rendered.length > 0
			? rendered
			: undefined;
	} catch {
		return undefined;
	}
}

/** `PgVarchar` → `varchar`; unknown classes degrade to their lowercased name. */
function normalizeColumnType(columnType: string): string {
	const withoutDialect = columnType.replace(
		/^(Pg|MySql|SQLite|SingleStore)/u,
		"",
	);
	const stem = withoutDialect.length > 0 ? withoutDialect : columnType;
	return stem.toLowerCase();
}

export function isNonPostgresColumn(column: DrizzleColumnLike): boolean {
	const columnType = column.columnType;
	if (typeof columnType !== "string") return false;
	return NON_POSTGRES_COLUMN_PREFIXES.some((prefix) =>
		columnType.startsWith(prefix),
	);
}

export interface DrizzleIndexLike {
	readonly name: string;
	readonly columns: readonly string[];
	readonly unique: boolean;
}

/**
 * Reads an entry returned by a table's extra-config callback. Drizzle index and
 * unique-constraint builders park their state on a `config` property carrying a
 * name, the columns, and (for indexes) a `unique` flag. Anything that does not
 * present all three is refused so the caller can record it as impedance.
 */
export function readIndexBuilder(value: unknown): DrizzleIndexLike | undefined {
	const builder = asRecord(value);
	const config = asRecord(builder?.config);
	if (config === undefined) return undefined;
	const name = config.name;
	const columns = config.columns;
	const unique = config.unique;
	if (typeof name !== "string" || name.length === 0) return undefined;
	if (!Array.isArray(columns) || columns.length === 0) return undefined;
	if (typeof unique !== "boolean") return undefined;
	const columnNames: string[] = [];
	for (const entry of columns) {
		const columnName =
			typeof entry === "string" ? entry : asRecord(entry)?.name;
		if (typeof columnName !== "string" || columnName.length === 0) {
			return undefined;
		}
		columnNames.push(columnName);
	}
	return Object.freeze({
		name,
		columns: Object.freeze(columnNames),
		unique,
	});
}
