/**
 * Hand-built stand-ins for the objects `drizzle-orm` publishes.
 *
 * The adapter recognizes Drizzle values structurally and takes no dependency on
 * `drizzle-orm`, so the tests build the same shape the ORM does: the
 * `Symbol.for("drizzle:*")` registry symbols plus the plain properties of a
 * column descriptor. Building the fixtures by hand is deliberate — it is the
 * only way to prove the recognizer matches the published shape rather than a
 * convenience shape invented for the tests, and it keeps the test suite free of
 * the ORM too.
 */

export const DRIZZLE_NAME = Symbol.for("drizzle:Name");
export const DRIZZLE_COLUMNS = Symbol.for("drizzle:Columns");
export const DRIZZLE_SCHEMA = Symbol.for("drizzle:Schema");
export const DRIZZLE_EXTRA_CONFIG_BUILDER = Symbol.for(
	"drizzle:ExtraConfigBuilder",
);
export const DRIZZLE_EXTRA_CONFIG_COLUMNS = Symbol.for(
	"drizzle:ExtraConfigColumns",
);
export const DRIZZLE_IS_VIEW = Symbol.for("drizzle:IsDrizzleView");
export const DRIZZLE_PG_INLINE_FOREIGN_KEYS = Symbol.for(
	"drizzle:PgInlineForeignKeys",
);

export interface ColumnOverrides {
	readonly columnType?: string;
	readonly dataType?: string;
	readonly sqlType?: string | (() => unknown);
	readonly notNull?: boolean;
	readonly primary?: boolean;
	readonly isUnique?: boolean;
	readonly hasDefault?: boolean;
	readonly default?: unknown;
	readonly defaultFn?: unknown;
}

export function column(
	name: string,
	overrides: ColumnOverrides = {},
): Record<string, unknown> {
	const sqlType = overrides.sqlType ?? "text";
	const built: Record<string, unknown> = {
		name,
		columnType: overrides.columnType ?? "PgText",
		dataType: overrides.dataType ?? "string",
		notNull: overrides.notNull ?? false,
		primary: overrides.primary ?? false,
		isUnique: overrides.isUnique ?? false,
		hasDefault: overrides.hasDefault ?? overrides.default !== undefined,
	};
	built.getSQLType =
		typeof sqlType === "function" ? sqlType : (): string => sqlType;
	if (overrides.default !== undefined) built.default = overrides.default;
	if (overrides.defaultFn !== undefined) built.defaultFn = overrides.defaultFn;
	return built;
}

/**
 * Column-shaped enough to be recognized (it has a name and a `getSQLType`) but
 * with no readable SQL type behind it — the shape a future Drizzle column class
 * this adapter does not understand would present.
 */
export function typelessColumn(name: string): Record<string, unknown> {
	return { name, getSQLType: (): undefined => undefined };
}

export interface TableOverrides {
	readonly schema?: string;
	readonly inlineForeignKeys?: readonly unknown[];
	readonly extraConfigBuilder?: (columns: Record<string, unknown>) => unknown;
	readonly extraConfigColumns?: Record<string, unknown>;
}

export function table(
	sqlName: string,
	columns: Record<string, unknown>,
	overrides: TableOverrides = {},
): object {
	const built: Record<string | symbol, unknown> = {
		[DRIZZLE_NAME]: sqlName,
		[DRIZZLE_COLUMNS]: columns,
	};
	if (overrides.schema !== undefined) built[DRIZZLE_SCHEMA] = overrides.schema;
	if (overrides.inlineForeignKeys !== undefined) {
		built[DRIZZLE_PG_INLINE_FOREIGN_KEYS] = overrides.inlineForeignKeys;
	}
	if (overrides.extraConfigBuilder !== undefined) {
		built[DRIZZLE_EXTRA_CONFIG_BUILDER] = overrides.extraConfigBuilder;
	}
	if (overrides.extraConfigColumns !== undefined) {
		built[DRIZZLE_EXTRA_CONFIG_COLUMNS] = overrides.extraConfigColumns;
	}
	// Column descriptors are also enumerable string properties on a real table.
	for (const [property, value] of Object.entries(columns)) {
		built[property] = value;
	}
	return built;
}

export function view(sqlName: string): object {
	return {
		[DRIZZLE_IS_VIEW]: true,
		[DRIZZLE_NAME]: sqlName,
		[DRIZZLE_COLUMNS]: {},
	};
}

/** Mimics a drizzle-kit index builder: state parked on a `config` property. */
export function indexBuilder(
	name: string,
	columns: readonly (string | Record<string, unknown>)[],
	unique = false,
): Record<string, unknown> {
	return { config: { name, columns: [...columns], unique } };
}

/** The representative schema module the ingestion tests read. */
export function representativeSchemaModule(): Record<string, unknown> {
	const usersColumns = {
		id: column("id", {
			columnType: "PgSerial",
			sqlType: "serial",
			primary: true,
			notNull: true,
		}),
		email: column("email", {
			sqlType: "varchar(320)",
			notNull: true,
			isUnique: true,
		}),
		displayName: column("display_name", { sqlType: "text" }),
		active: column("active", {
			columnType: "PgBoolean",
			sqlType: "boolean",
			notNull: true,
			default: true,
		}),
	};
	const postsColumns = {
		id: column("id", {
			columnType: "PgSerial",
			sqlType: "serial",
			primary: true,
			notNull: true,
		}),
		authorId: column("author_id", { sqlType: "integer", notNull: true }),
		title: column("title", {
			sqlType: "text",
			notNull: true,
			default: "untitled",
		}),
	};
	return {
		users: table("users", usersColumns, {
			extraConfigBuilder: () => [
				indexBuilder("users_email_idx", ["email"], true),
				indexBuilder("users_active_idx", [usersColumns.active]),
			],
		}),
		posts: table("posts", postsColumns, {
			inlineForeignKeys: [{ reference: "users.id" }],
		}),
	};
}
