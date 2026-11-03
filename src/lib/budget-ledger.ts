import 'server-only';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const dir = join(process.cwd(), '.market-scout-state');
mkdirSync(dir, { recursive: true, mode: 0o700 });

const db = new DatabaseSync(join(dir, 'budget.sqlite'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    day TEXT NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

const DAILY_LIMIT = 50000;

export function reservePayment(amount: number): string {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 5000) {
    throw new Error('Payment exceeds per-request limit');
  }

  const day = new Date().toISOString().slice(0, 10);
  const id = randomUUID();

  db.exec('BEGIN IMMEDIATE');
  try {
    const row = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS spent
      FROM payments
      WHERE day = ? AND status IN ('reserved', 'confirmed', 'ambiguous')
    `).get(day) as { spent: number };

    if (row.spent + amount > DAILY_LIMIT) {
      throw new Error('Daily payment budget exceeded');
    }

    db.prepare(`
      INSERT INTO payments (id, day, amount, status, created_at)
      VALUES (?, ?, ?, 'reserved', ?)
    `).run(id, day, amount, new Date().toISOString());

    db.exec('COMMIT');
    return id;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function settlePayment(
  id: string,
  status: 'confirmed' | 'rejected' | 'ambiguous'
): void {
  db.prepare(`
    UPDATE payments SET status = ?
    WHERE id = ? AND status = 'reserved'
  `).run(status, id);
}
