// Minimal async SQLite interface with two backends:
//  - native SQLite on iOS (@capacitor-community/sqlite), durable on disk
//  - sql.js (WASM) for the browser build and unit tests
// All access is serialized through one lock so an async transaction can't
// interleave with other statements.

export type SqlValue = string | number | null;

export interface SqlExecutor {
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<void>;
}

export interface SqlDb extends SqlExecutor {
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

export function toSqlParams(params: unknown[] = []): SqlValue[] {
  return params.map((p) => {
    if (p === undefined || p === null) return null;
    if (typeof p === "boolean") return p ? 1 : 0;
    if (typeof p === "number" || typeof p === "string") return p;
    if (p instanceof Date) return p.toISOString();
    return JSON.stringify(p);
  });
}

interface RawDriver {
  all(sql: string, params: SqlValue[]): Promise<Record<string, unknown>[]>;
  run(sql: string, params: SqlValue[]): Promise<void>;
  exec(sql: string): Promise<void>;
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  afterWrite?(): void;
}

class LockedDb implements SqlDb {
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private driver: RawDriver) {}

  private locked<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn, fn);
    this.tail = result.catch(() => undefined);
    return result;
  }

  private executor(): SqlExecutor {
    return {
      all: async <T>(sql: string, params?: unknown[]) =>
        (await this.driver.all(sql, toSqlParams(params))) as T[],
      run: (sql, params) => this.driver.run(sql, toSqlParams(params)),
    };
  }

  all<T>(sql: string, params?: unknown[]) {
    return this.locked(() => this.executor().all<T>(sql, params));
  }

  run(sql: string, params?: unknown[]) {
    return this.locked(async () => {
      await this.driver.run(sql, toSqlParams(params));
      this.driver.afterWrite?.();
    });
  }

  exec(sql: string) {
    return this.locked(async () => {
      await this.driver.exec(sql);
      this.driver.afterWrite?.();
    });
  }

  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>) {
    return this.locked(async () => {
      await this.driver.begin();
      try {
        const result = await fn(this.executor());
        await this.driver.commit();
        this.driver.afterWrite?.();
        return result;
      } catch (err) {
        await this.driver.rollback().catch(() => undefined);
        throw err;
      }
    });
  }
}

// sql.js: `persist` is called (debounced by the caller) after each write.
export function createSqlJsDb(
  database: import("sql.js").Database,
  persist?: () => void,
): SqlDb {
  return new LockedDb({
    async all(sql, params) {
      const stmt = database.prepare(sql);
      try {
        stmt.bind(params);
        const rows: Record<string, unknown>[] = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        return rows;
      } finally {
        stmt.free();
      }
    },
    async run(sql, params) {
      database.run(sql, params);
    },
    async exec(sql) {
      database.exec(sql);
    },
    async begin() {
      database.run("BEGIN");
    },
    async commit() {
      database.run("COMMIT");
    },
    async rollback() {
      database.run("ROLLBACK");
    },
    afterWrite: persist,
  });
}

export async function createNativeDb(name: string): Promise<SqlDb> {
  const { CapacitorSQLite, SQLiteConnection } = await import("@capacitor-community/sqlite");
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  await sqlite.checkConnectionsConsistency().catch(() => undefined);
  const exists = (await sqlite.isConnection(name, false)).result;
  const conn = exists
    ? await sqlite.retrieveConnection(name, false)
    : await sqlite.createConnection(name, false, "no-encryption", 1, false);
  await conn.open();
  // Each run() below passes transaction=false; we manage transactions ourselves.
  return new LockedDb({
    async all(sql, params) {
      return ((await conn.query(sql, params)).values ?? []) as Record<string, unknown>[];
    },
    async run(sql, params) {
      await conn.run(sql, params, false);
    },
    async exec(sql) {
      await conn.execute(sql, false);
    },
    async begin() {
      await conn.beginTransaction();
    },
    async commit() {
      await conn.commitTransaction();
    },
    async rollback() {
      await conn.rollbackTransaction();
    },
  });
}
