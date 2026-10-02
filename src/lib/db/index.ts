// SQLite connection (better-sqlite3) at DATABASE_PATH. Runs schema.sql once per process. WAL.
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { createRepos, type Repos } from "./repos";

export * from "./repos";

const g = globalThis as unknown as { __caseDb?: Database.Database; __caseRepos?: Repos };

function schemaSql(): string {
  const candidates = [path.join(process.cwd(), "src/lib/db/schema.sql"), path.join(__dirname, "schema.sql")];
  for (const p of candidates) if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
  throw new Error("schema.sql not found");
}

/** Open a database (":memory:" allowed) and apply the schema. */
export function openDb(file: string): Database.Database {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.exec(schemaSql());
  return db;
}

export function getDb(): Database.Database {
  if (!g.__caseDb) g.__caseDb = openDb(process.env.DATABASE_PATH || "./data/app.db");
  return g.__caseDb;
}

export function repos(): Repos {
  if (!g.__caseRepos) g.__caseRepos = createRepos(getDb());
  return g.__caseRepos;
}

/** Test hook: replace the process-wide connection (e.g. with an in-memory DB). */
export function setDbForTests(db: Database.Database | null): void {
  g.__caseDb = db ?? undefined;
  g.__caseRepos = db ? createRepos(db) : undefined;
}
