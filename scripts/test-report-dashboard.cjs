/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const source = fs.readFileSync('src/app/competitor-dashboard.tsx', 'utf8');
const output = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
} }).outputText;
const loaded = { exports: {} };
new Function('require', 'module', 'exports', output)(name =>
  name === './intelligence-explorer'
    ? { __esModule: true, default: () => React.createElement('div', null, 'Explorer visible') }
    : require(name), loaded, loaded.exports);
const Dashboard = loaded.exports.default;
// Synthetic snapshots exercise presentation; they are not provider evidence.
const empty = { username: 'nike', name: 'Nike', biography: 'Sample bio', followers: 1000,
  following: 100, sampledPosts: 0, avgEngagement: 0, engagementRate: 0,
  videoPosts: 0, imagePosts: 0, posts: [], topPosts: [], generatedAt: '2026-11-07T12:39:39.884Z' };
const markup = report => renderToStaticMarkup(React.createElement(Dashboard, { report, historical: false }));
const withoutPosts = markup(empty);
assert.match(withoutPosts, /Post-level analytics unavailable for this snapshot/);
assert.equal((withoutPosts.match(/Unavailable/g) || []).length, 2);
assert.doesNotMatch(withoutPosts, /Top-performing posts|Content mix|Explorer visible|0\.00%/);
assert.match(withoutPosts, /2026-11-07T12:39:39\.884Z/);
assert.match(withoutPosts, /Sample bio/);
const post = { shortcode: 'synthetic', url: 'https://www.instagram.com/p/synthetic/', likes: 10, comments: 2 };
const withPosts = markup({ ...empty, sampledPosts: 1, posts: [post], topPosts: [post], avgEngagement: 12, engagementRate: 1.2, imagePosts: 1 });
assert.match(withPosts, /Top-performing posts/);
assert.match(withPosts, /Content mix/);
assert.match(withPosts, /Explorer visible/);
assert.match(withPosts, /1\.20%/);

const pageSource = fs.readFileSync('src/app/recover/page.tsx', 'utf8');
const pageOutput = ts.transpileModule(pageSource, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
} }).outputText;
const page = { exports: {} };
new Function('require', 'module', 'exports', pageOutput)(name => {
  if (name === 'react') return { ...React, useEffect: () => {}, useState: initial => [initial === null ? empty : initial, () => {}] };
  if (name === 'next/link') return { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) };
  if (name === '../competitor-dashboard') return loaded.exports;
  if (name === '@/lib/report') return { isCompetitorReport: () => true };
  if (name === '@/lib/payment-ui-state') return {};
  return require(name);
}, page, page.exports);
const recoveredPage = renderToStaticMarkup(page.exports.default());
assert.match(recoveredPage, /Report recovered successfully/);
assert.match(recoveredPage, /No additional payment/);
assert.match(recoveredPage, /Historical snapshot — not a new live scan/);
assert.match(recoveredPage, /2026-11-07T12:39:39\.884Z/);
assert.match(recoveredPage, /Post-level analytics unavailable for this snapshot/);
assert.doesNotMatch(recoveredPage, /<pre\b|0\.00%/);
console.log('PASS synthetic saved snapshots: recovery page, empty post data and populated dashboard');
