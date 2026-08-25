import type { D1Like, D1PreparedStatementLike } from '../../src/messaging/db.js';

/** Programmable fake for D1Like: queue up canned `.all()` responses in call order (like the
 * fakeClient() pattern used throughout this repo for Anthropic calls), and record every
 * prepare/bind so tests can assert the right SQL ran with the right params. `.run()` calls are
 * just recorded, not queued — nothing in db.ts reads a `.run()` result. */
export class FakeD1 implements D1Like {
  calls: { sql: string; params: unknown[] }[] = [];
  private allQueue: { results: unknown[] }[];
  private runQueue: { success: boolean; meta?: { changes?: number } }[];

  constructor(allQueue: { results: unknown[] }[] = [], runQueue: { success: boolean; meta?: { changes?: number } }[] = []) {
    this.allQueue = [...allQueue];
    this.runQueue = [...runQueue];
  }

  prepare(sql: string): D1PreparedStatementLike {
    const self = this;
    let params: unknown[] = [];
    const stmt: D1PreparedStatementLike = {
      bind(...values: unknown[]) {
        params = values;
        return stmt;
      },
      async all<T>() {
        self.calls.push({ sql, params });
        const next = self.allQueue.shift();
        return (next ?? { results: [] }) as { results: T[] };
      },
      async run() {
        self.calls.push({ sql, params });
        // Defaults to one row changed - matches D1's real .run() shape (meta.changes), same as
        // every UPDATE/INSERT in this file actually affecting a row unless a test says otherwise.
        return self.runQueue.shift() ?? { success: true, meta: { changes: 1 } };
      },
    };
    return stmt;
  }
}
