import assert from 'node:assert/strict';
import { validateScanReport } from '../src/lib/scan-report-validation';

const profile = (username: unknown) => ({
  output: {
    username,
    full_name: 'Test Account',
    biography: 'Test profile',
    edge_followed_by: { count: 100 },
    edge_follow: { count: 20 },
    edge_owner_to_timeline_media: {
      count: 0,
      edges: [],
    },
  },
});

const cases = [
  {
    name: 'Matching username',
    raw: profile('nike'),
    requested: 'nike',
    accepted: true,
  },
  {
    name: 'Case-insensitive username',
    raw: profile('Nike'),
    requested: '@nike',
    accepted: true,
  },
  {
    name: 'Different account',
    raw: profile('adidas'),
    requested: 'nike',
    accepted: false,
  },
  {
    name: 'Missing username',
    raw: profile(undefined),
    requested: 'nike',
    accepted: false,
  },
  {
    name: 'Null response',
    raw: null,
    requested: 'nike',
    accepted: false,
  },
  {
    name: 'Empty response object',
    raw: {},
    requested: 'nike',
    accepted: false,
  },
  {
    name: 'Invalid username type',
    raw: profile(123),
    requested: 'nike',
    accepted: false,
  },
  {
    name: 'Incomplete but matching profile',
    raw: { username: 'nike' },
    requested: 'nike',
    accepted: false,
  },
];

let passed = 0;

for (const test of cases) {
  let accepted = false;
  let reason = '';

  try {
    const report = validateScanReport(
      test.raw,
      test.requested
    );

    assert.equal(
      report.username.toLowerCase(),
      test.requested.replace(/^@/, '').toLowerCase()
    );

    accepted = true;
  } catch (error) {
    reason = error instanceof Error
      ? error.message
      : 'Unknown error';
  }

  const ok = accepted === test.accepted;

  console.log(
    `${ok ? 'PASS' : 'FAIL'}: ${test.name}` +
    (reason ? ` (${reason})` : '')
  );

  if (ok) passed++;
}

console.log(`RESULT: ${passed}/${cases.length} PASS`);

if (passed !== cases.length) {
  process.exitCode = 1;
}
