// Deprecated: better-sqlite3 is no longer used by this project. The application now uses PostgreSQL (pg + drizzle-orm) and expects DATABASE_URL.
// If you still need SQLite support for local fallback, add a compatibility layer and reintroduce types as needed.

declare module 'better-sqlite3' {
  // Placeholder types removed. See project README for current database instructions.
  const _default: any;
  export default _default;
}

  export interface Statement<T = unknown> {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number };
    get(...params: unknown[]): T | undefined;
    all(...params: unknown[]): T[];
  }

  export interface Database {
    prepare<T = unknown>(sql: string): Statement<T>;
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
