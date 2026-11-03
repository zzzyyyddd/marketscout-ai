import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const dir = mkdtempSync(join(tmpdir(), 'marketscout-runtime-'));

try {
  const source = readFileSync('src/lib/budget-ledger.ts', 'utf8')
    .replace("import 'server-only';", '');

  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const modulePath = join(dir, 'budget-ledger.cjs');
  writeFileSync(modulePath, compiled);

  const previous = process.cwd();
  process.chdir(dir);

  try {
    const { reservePayment, settlePayment } = require(modulePath);

    let accepted = 0;
    let rejected = 0;
    const ids = [];

    for (let i = 0; i < 12; i++) {
      try {
        ids.push(reservePayment(5000));
        accepted++;
      } catch (error) {
        if (error.message === 'Daily payment budget exceeded') {
          rejected++;
        } else {
          throw error;
        }
      }
    }

    console.log(
      accepted === 10 && rejected === 2 ? 'PASS' : 'FAIL',
      'Daily limit:',
      accepted, 'accepted,', rejected, 'rejected'
    );

    let oversizedRejected = false;
    try {
      reservePayment(5001);
    } catch {
      oversizedRejected = true;
    }

    console.log(
      oversizedRejected ? 'PASS' : 'FAIL',
      'Per-request limit'
    );

    settlePayment(ids[0], 'ambiguous');

    const db = new DatabaseSync(
      join(dir, '.market-scout-state', 'budget.sqlite')
    );

    const row = db.prepare(
      "SELECT status FROM payments WHERE id = ?"
    ).get(ids[0]);

    const total = db.prepare(
      "SELECT SUM(amount) AS total FROM payments"
    ).get().total;

    db.close();

    console.log(
      row.status === 'ambiguous' ? 'PASS' : 'FAIL',
      'Ambiguous settlement'
    );

    console.log(
      total === 50000 ? 'PASS' : 'FAIL',
      'Budget retained after ambiguous payment'
    );

    if (
      accepted !== 10 ||
      rejected !== 2 ||
      !oversizedRejected ||
      row.status !== 'ambiguous' ||
      total !== 50000
    ) {
      process.exitCode = 1;
    }
  } finally {
    process.chdir(previous);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
