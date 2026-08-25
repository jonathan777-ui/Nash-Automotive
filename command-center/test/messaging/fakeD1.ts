import type { D1Like, D1PreparedStatementLike } from '../../src/messaging/db.js';

/** Programmable fake for D1Like: queue up canned `.all()` responses in call order (like the
 * fakeClient() pattern used throughout this repo for Anthropic calls), and record every
 * prepare/bind so tests can assert the right SQL ran with the right params. `.run()` calls are
 * just recorded, not queued — nothing in db.ts reads a `.run()` result. */
export class FakeD1 implements D1Like {
  calls: { sql: string; params: unknown[] }[] = [];
  private allQueue: { results: unknown[] }[];

  constructor(allQueue: { results: unknown[] }[] = []) {
    this.allQueue = [...allQueue];
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
        return { success: true };
      },
    };
    return stmt;
  }
}
