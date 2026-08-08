// Deprecated: better-sqlite3 is no longer used by this project. The application now uses PostgreSQL (pg + drizzle-orm) and expects DATABASE_URL.
// If you still need SQLite support for local fallback, add a compatibility layer and reintroduce types as needed.

// Deprecated: better-sqlite3 is no longer used by this project. The application now uses PostgreSQL (pg + drizzle-orm) and expects DATABASE_URL.
// If you still need SQLite support for local fallback, add a compatibility layer and reintroduce types as needed.

declare module 'better-sqlite3' {
  // Minimal placeholder types to satisfy the TypeScript compiler in environments
  // where better-sqlite3 is not installed. This intentionally uses "any" to avoid
  // pinning the project to SQLite types because the runtime now uses Postgres.

  type RunResult = { changes: number; lastInsertRowid: number };

  interface Statement<T = any> {
    run(...params: unknown[]): RunResult;
    get(...params: unknown[]): T | undefined;
    all(...params: unknown[]): T[];
  }

  interface Database {
    prepare<T = any>(sql: string): Statement<T>;
    exec(sql: string): Database;
    pragma(name: string): Database;
    transaction<T extends (...args: unknown[]) => unknown>(fn: T): T;
    close(): void;
  }

  interface DatabaseConstructor {
    new (filename: string, options?: Record<string, unknown>): Database;
  }

  const Database: DatabaseConstructor;
  export default Database;
}
