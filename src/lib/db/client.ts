import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "./migrate";
import * as schema from "./schema";

export type DB = BetterSQLite3Database<typeof schema>;

export function openDatabase(file: string): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  migrate(sqlite);
  return drizzle(sqlite, { schema });
}

const globalForDb = globalThis as unknown as { __resellerDb?: DB };

/** Shared connection for the app. Path comes from DATABASE_PATH (default ./data/reseller.db). */
export function getDb(): DB {
  if (!globalForDb.__resellerDb) {
    const file = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "reseller.db");
    globalForDb.__resellerDb = openDatabase(file);
  }
  return globalForDb.__resellerDb;
}
