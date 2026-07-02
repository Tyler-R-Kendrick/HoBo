import type { IMemoryDb } from "pg-mem";

export function execMemQuery(memDb: IMemoryDb, sql: string, params: Record<string, unknown>) {
  return memDb.public.query(sql, params);
}

export function execMemNone(memDb: IMemoryDb, sql: string, params: Record<string, unknown> = {}) {
  return memDb.public.none(sql, params);
}
