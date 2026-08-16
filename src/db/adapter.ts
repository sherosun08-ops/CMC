/**
 * Database adapter — the ONLY module that touches the database driver.
 * Deliberately thin and portable (ADR-002): everything above speaks in terms of
 * this interface + the filter AST, so a PostgreSQL adapter is a drop-in.
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type Row = Record<string, unknown>;

export interface Db {
  all(sql: string, params?: unknown[]): Row[];
  get(sql: string, params?: unknown[]): Row | undefined;
  run(sql: string, params?: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  exec(sql: string): void;
  /** Run fn atomically. Nested calls join the outer transaction (savepoints). */
  transaction<T>(fn: () => T): T;
  /**
   * Async variant for multi-operation units (e.g. bulk endpoints) whose steps
   * await hooks. Serialized by an internal mutex so concurrent async
   * transactions cannot interleave inside the open BEGIN (single-process).
   */
  transactionAsync<T>(fn: () => Promise<T>): Promise<T>;
  close(): void;
}

export function createDb(databaseUrl: string): Db {
  if (databaseUrl !== ':memory:') {
    fs.mkdirSync(path.dirname(databaseUrl), { recursive: true });
  }
  const sqlite = new Database(databaseUrl);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');

  let txDepth = 0;
  let asyncTxLock: Promise<void> = Promise.resolve();

  return {
    all: (sql, params = []) => sqlite.prepare(sql).all(...(params as [])) as Row[],
    get: (sql, params = []) => sqlite.prepare(sql).get(...(params as [])) as Row | undefined,
    run: (sql, params = []) => sqlite.prepare(sql).run(...(params as [])),
    exec: (sql) => void sqlite.exec(sql),
    transaction<T>(fn: () => T): T {
      if (txDepth > 0) {
        const sp = `sp_${txDepth}`;
        sqlite.exec(`SAVEPOINT ${sp}`);
        txDepth++;
        try {
          const result = fn();
          sqlite.exec(`RELEASE ${sp}`);
          return result;
        } catch (err) {
          sqlite.exec(`ROLLBACK TO ${sp}; RELEASE ${sp}`);
          throw err;
        } finally {
          txDepth--;
        }
      }
      sqlite.exec('BEGIN IMMEDIATE');
      txDepth = 1;
      try {
        const result = fn();
        sqlite.exec('COMMIT');
        return result;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      } finally {
        txDepth = 0;
      }
    },
    async transactionAsync<T>(fn: () => Promise<T>): Promise<T> {
      // serialize async transactions behind a mutex
      let release!: () => void;
      const prev = asyncTxLock;
      asyncTxLock = new Promise<void>((r) => {
        release = r;
      });
      await prev;
      try {
        if (txDepth > 0) {
          // already inside a transaction — join it via savepoint
          const sp = `asp_${txDepth}`;
          sqlite.exec(`SAVEPOINT ${sp}`);
          txDepth++;
          try {
            const result = await fn();
            sqlite.exec(`RELEASE ${sp}`);
            return result;
          } catch (err) {
            sqlite.exec(`ROLLBACK TO ${sp}; RELEASE ${sp}`);
            throw err;
          } finally {
            txDepth--;
          }
        }
        sqlite.exec('BEGIN IMMEDIATE');
        txDepth = 1;
        try {
          const result = await fn();
          sqlite.exec('COMMIT');
          return result;
        } catch (err) {
          sqlite.exec('ROLLBACK');
          throw err;
        } finally {
          txDepth = 0;
        }
      } finally {
        release();
      }
    },
    close: () => sqlite.close(),
  };
}

/** Quote an identifier. Callers must still validate identifiers against the registry. */
export function ident(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid identifier: ${name}`);
  }
  return `"${name}"`;
}
