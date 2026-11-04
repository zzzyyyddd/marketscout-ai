import { validateScanReport } from '../src/lib/scan-report-validation';

const base = () => ({
  output: {
    username: 'nike',
    full_name: 'Test Account',
    biography: 'Test',
    edge_followed_by: { count: 100 },
    edge_follow: { count: 20 },
    edge_owner_to_timeline_media: {
      count: 1,
      edges: [{
        node: {
          shortcode: 'ABC123',
          taken_at_timestamp: 1700000000,
          edge_media_preview_like: { count: 10 },
          edge_media_to_comment: { count: 2 },
          edge_media_to_caption: { edges: [] },
          is_video: false,
        },
      }],
    },
  },
});

const cases = [
  {
    name: 'Valid baseline',
    modify: (x: ReturnType<typeof base>) => x,
    accepted: true,
  },
  {
    name: 'Invalid response username',
    modify: (x: ReturnType<typeof base>) => {
      x.output.username = 'nike<script>';
      return x;
    },
    accepted: false,
  },
  {
    name: 'Negative followers',
    modify: (x: ReturnType<typeof base>) => {
      x.output.edge_followed_by.count = -1;
      return x;
    },
    accepted: false,
  },
  {
    name: 'Fractional followers',
    modify: (x: ReturnType<typeof base>) => {
      x.output.edge_followed_by.count = 1.5;
      return x;
    },
    accepted: false,
  },
  {
    name: 'Malformed post edge',
    modify: (x: ReturnType<typeof base>) => {
      (x.output.edge_owner_to_timeline_media.edges as unknown[])[0] = null;
      return x;
    },
    accepted: false,
  },
  {
    name: 'Negative likes',
    modify: (x: ReturnType<typeof base>) => {
      x.output.edge_owner_to_timeline_media.edges[0]
        .node.edge_media_preview_like.count = -5;
      return x;
    },
    accepted: false,
  },
  {
    name: 'Invalid timestamp',
    modify: (x: ReturnType<typeof base>) => {
      x.output.edge_owner_to_timeline_media.edges[0]
        .node.taken_at_timestamp = -100;
      return x;
    },
    accepted: false,
  },
];

let passed = 0;

for (const test of cases) {
  let accepted = false;
  let reason = '';

  try {
    validateScanReport(test.modify(base()), 'nike');
    accepted = true;
  } catch (error) {
    reason = error instanceof Error ? error.message : 'Unknown';
  }

  const ok = accepted === test.accepted;

  console.log(
    `${ok ? 'PASS' : 'FAIL'}: ${test.name}` +
    (reason ? ` (${reason})` : '')
  );

  if (ok) passed++;
}

console.log(`RESULT: ${passed}/${cases.length} PASS`);
process.exitCode = passed === cases.length ? 0 : 1;
