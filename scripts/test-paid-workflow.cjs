/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

const id = '11111111-1111-4111-8111-111111111111';
const tx = '0x' + 'ab'.repeat(32);
const payer = '0x' + '12'.repeat(20);
const authorization = { payer, recipient: payer, token: payer, amountAtomic: '5000', nonce: tx, validAfter: '0', validBefore: '9999999999' };
const body = { username: 'nike', edge_followed_by: { count: 100 }, edge_follow: { count: 10 }, edge_owner_to_timeline_media: { count: 0, edges: [] } };
let staged, stored, failure, gatewayCalls, events;
let stageCalls;
let reserved;
let validWallet = true, consumeChallenge = true;
const modules = new Map();
const mocks = {
  'server-only': {},
  'node:crypto': require('node:crypto'),
  'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
  'viem': { getAddress: value => value, verifyMessage: async () => validWallet },
  '@supabase/supabase-js': { createClient: () => ({ rpc: async (name, args) => {
    events.push(name);
    if (name === 'marketscout_reserve_mainnet_report') {
      if (reserved) return { data: false };
      reserved = args;
      return { data: true };
    }
    if (name === 'marketscout_consume_processing_challenge') return { data: consumeChallenge && args.p_payer === payer && args.p_reservation_id === id && args.p_domain === 'offline.invalid' };
    if (name === 'marketscout_read_paid_report') return failure === 'readback' ? { error: true } : { data: stored };
    if (name === 'marketscout_store_paid_report') {
      events.push('report-store');
      if (failure === 'store') return { error: true };
      if (stored && JSON.stringify(stored) !== JSON.stringify(args.p_report)) return { data: false };
      stored = args.p_report;
      return { data: true };
    }
    if (name === 'marketscout_read_staged_response') {
      if (failure === 'staging-read') throw new Error('Staging offline');
      return { data: staged };
    }
    if (name === 'marketscout_stage_gateway_response') {
      stageCalls++;
      if (failure === 'stage') return { error: true };
      if (failure === 'stage-once' && stageCalls === 1) return { error: true };
      if (failure === 'stage-ack-lost' && stageCalls > 1) throw new Error('Database offline');
      if (args.p_body !== null && (args.p_body.output ?? args.p_body).username !== args.p_username) return { data: false };
      staged = { username: args.p_username, txHash: args.p_tx_hash, body: args.p_body, authorization: { ...authorization, amount: '5000' } };
      if (failure === 'stage-ack-lost') throw new Error('Commit acknowledgement lost');
      return { data: true };
    }
    throw new Error('Unexpected RPC ' + name);
  } }) },
  './public-payment-signature': { verifyPublicPaymentSignature: async () => authorization },
  // Exercise future execution logic while the real release gate stays closed.
  './public-payment-readiness': { assertControlledPaymentScope: () => {} },
  './payment-verified-settlement': { verifyAndSettlePayment: async () => {
    events.push('verify');
    if (['settlement', 'uncertain-unverified'].includes(failure)) throw new Error('offline settlement failure');
  } },
};
function load(file) {
  file = path.resolve(file);
  if (modules.has(file)) return modules.get(file).exports;
  const testModule = { exports: {} };
  modules.set(file, testModule);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const sandbox = { module: testModule, exports: testModule.exports, Buffer, Response, Headers, Request, URL,
    AbortSignal: { timeout: ms => {
      assert.ok(ms > 150000, 'paid relay must allow the documented upstream deadline');
      const controller = new AbortController();
      // Virtual 30-second response, without waiting or making a network call.
      if (failure === 'slow-success' && ms <= 30000) controller.abort();
      return controller.signal;
    } },
    console, process: { env: { SUPABASE_URL: 'https://offline.invalid', SUPABASE_SECRET_KEY: 'offline' } }, fetch: async () => { throw new Error('Network forbidden'); }, require: name => {
    if (mocks[name]) return mocks[name];
    if (name.startsWith('@/')) return load(path.resolve('src', name.slice(2) + '.ts'));
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name + '.ts'));
    throw new Error('Unmocked dependency: ' + name);
  } };
  sandbox.fetch = async (_url, options) => {
    assert.equal(options.method, 'POST');
    gatewayCalls++;
    assert.equal(options.signal.aborted, false);
    if (failure === 'timeout') throw new Error('offline timeout');
    const proof = Buffer.from(JSON.stringify({ success: true, network: 'eip155:42220', transaction: tx })).toString('base64');
    const headers = { 'PAYMENT-RESPONSE': failure === 'proof' ? 'bad' : proof };
    if (failure === 'body-conflict') return Response.json({ transaction: '0x' + 'cd'.repeat(32), output: body }, { headers });
    if (['missing-proof', 'uncertain', 'uncertain-unverified'].includes(failure)) {
      return Response.json({ transaction: tx, output: body }, { status: failure.startsWith('uncertain') ? 500 : 200 });
    }
    if (failure === 'invalid-json') return new Response('{', { headers });
    if (failure === 'wrong-username') return Response.json({ ...body, username: 'other' }, { headers });
    if (failure === 'invalid-profile') return Response.json({ username: 'nike' }, { headers });
    if (failure === 'http-error') return Response.json({ error: 'upstream failed' }, { status: 502, headers });
    if (failure === 'historical-fixture') return Response.json(JSON.parse(fs.readFileSync('data/instagram-snapshot.json', 'utf8')), { headers });
    return Response.json(body, { status: failure === 'http-error' ? 500 : 200, headers });
  };
  vm.runInNewContext(source, sandbox, { filename: file });
  return testModule.exports;
}
const { executePublicPayment } = load('src/lib/public-payment-orchestrator.ts');
const { resumePaidResponse } = load('src/lib/paid-response-store.ts');
const { parsePaymentResponse, readBoundedGatewayBody } = load('src/lib/payment-response-proof.ts');
function reset(mode) { staged = stored = reserved = undefined; failure = mode; gatewayCalls = 0; stageCalls = 0; events = []; }
(async () => {
  const uiState = load('src/lib/payment-ui-state.ts');
  assert.equal(uiState.paymentButtonLabel({ enabled: true, paying: true, locked: true, completed: false, stateChecked: true, step: 'signing' }), 'Waiting for wallet authorization…');
  assert.equal(uiState.paymentButtonLabel({ enabled: true, paying: false, locked: false, completed: false, stateChecked: true, step: 'signing' }), 'Wallet authorization not submitted — resume');
  assert.equal(uiState.canSafelyResumePayment('signing'), true);
  assert.equal(uiState.canSafelyResumePayment('authorization_ready_v2'), true);
  assert.equal(uiState.canSafelyResumePayment('authorization_created'), false, 'older signed state is ambiguous and must remain locked');
  assert.equal(uiState.canSafelyResumePayment('submitting'), false);
  assert.equal(uiState.paymentButtonLabel({ enabled: true, paying: false, locked: true, completed: false, stateChecked: false, step: null }), 'Checking saved payment state…');
  assert.equal(uiState.canOfferPaidReportRecovery('signing'), false);
  assert.equal(uiState.canOfferPaidReportRecovery('submitting'), true);
  assert.equal(uiState.paymentButtonLabel({ enabled: true, paying: false, locked: true, completed: false, stateChecked: true, step: 'submitting' }), 'Payment request processing — do not retry');
  assert.equal(uiState.paymentButtonLabel({ enabled: true, paying: false, locked: true, completed: false, stateChecked: true, step: 'authorization_created' }), 'Payment status uncertain — do not retry');
  console.log('PASS payment UI never labels pre-submission wallet authorization as submitted');
  const values = new Map();
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i] ?? null, getItem: key => values.get(key) ?? null };
  const legacy = JSON.stringify({ username: 'ilyayahya', status: 'authorization_created', createdAt: 1793935352081 });
  values.set('marketscout_pending_payment_v1', legacy);
  assert.equal(uiState.findPendingPayment(storage, 'nike', id), null, 'unrelated historical purchase must not block the controlled purchase');
  const scopedKey = uiState.pendingPaymentKey(id);
  values.set(scopedKey, JSON.stringify({ username: 'nike', reservationId: id, status: 'submitting' }));
  assert.equal(uiState.findPendingPayment(storage, 'nike', id).status, 'submitting');
  assert.equal(values.get('marketscout_pending_payment_v1'), legacy, 'historical evidence must remain untouched');
  values.delete(scopedKey);
  values.set('marketscout_pending_payment_v1', JSON.stringify({ username: 'nike', status: 'authorization_created' }));
  assert.equal(uiState.findPendingPayment(storage, 'nike', id).status, 'authorization_created', 'same username with unknown reservation stays locked');
  values.set('marketscout_pending_payment_v1', JSON.stringify({ username: 'other', reservationId: id, status: 'unresolved' }));
  assert.equal(uiState.findPendingPayment(storage, 'nike', id).status, 'unresolved', 'same reservation stays locked');
  values.set('marketscout_pending_payment_v1', JSON.stringify({ username: 'nike', reservationId: id, status: 'signing' }));
  values.set(scopedKey, JSON.stringify({ username: 'nike', reservationId: id, status: 'unresolved' }));
  assert.equal(uiState.findPendingPayment(storage, 'nike', id).status, 'unresolved', 'uncertain state takes priority over pre-signing state');
  console.log('PASS separate historical marker and matching payment locks');

  for (const mode of ['success', 'slow-success', 'proof', 'body-conflict', 'timeout', 'settlement', 'stage', 'store']) {
    reset(mode);
    const result = await executePublicPayment('never-a-real-signature', payer, 'nike', id);
    assert.equal(gatewayCalls, 1);
    assert.equal(result.status, ['success', 'slow-success'].includes(mode) ? 'settled' : mode === 'store' ? 'settled_report_unavailable' : 'unresolved');
    if (['success', 'slow-success', 'settlement', 'store'].includes(mode)) {
      assert.ok(staged);
      assert.ok(events.indexOf('marketscout_stage_gateway_response') < events.indexOf('verify'));
      failure = undefined;
      assert.equal((await resumePaidResponse(id)).status, 'settled');
      assert.equal(gatewayCalls, 1, 'recovery must not replay payment');
      assert.equal(stored.username, 'nike');
      assert.ok(Number.isFinite(Date.parse(stored.generatedAt)));
    } else assert.equal(stored, undefined);
    console.log('PASS payment workflow:', mode);
  }
  for (const mode of ['http-error', 'invalid-json', 'wrong-username', 'invalid-profile', 'readback', 'stage-once', 'stage-ack-lost', 'missing-proof', 'uncertain']) {
    reset(mode);
    const result = await executePublicPayment('never-a-real-signature', payer, 'nike', id);
    assert.equal(gatewayCalls, 1);
    assert.equal(result.status, ['stage-once', 'stage-ack-lost', 'missing-proof', 'uncertain'].includes(mode) ? 'settled' : 'settled_report_unavailable');
    assert.equal(staged.txHash, tx, 'known evidence must survive report failure');
    if (['http-error', 'invalid-json', 'wrong-username'].includes(mode)) assert.equal(staged.body, null);
    if (mode === 'stage-ack-lost') assert.equal(staged.body.username, 'nike', 'proof-only fallback must not overwrite an existing body');
    if (mode === 'readback') assert.ok(stored, 'a committed but unreadable report must not yield success');
    if (['readback', 'stage-once', 'stage-ack-lost'].includes(mode)) {
      failure = undefined;
      assert.equal((await resumePaidResponse(id)).status, 'settled');
    }
    assert.equal(gatewayCalls, 1, 'database retries must never replay payment');
    console.log('PASS payment/report regression:', mode);
  }
  reset();
  staged = { username: 'nike', txHash: tx, body, authorization: { amount: 'not-an-integer' } };
  assert.equal((await resumePaidResponse(id)).status, 'unresolved', 'corrupt evidence must fail closed');
  reset();
  await executePublicPayment('never-a-real-signature', payer, 'nike', id);
  assert.equal(reserved.p_id, id);
  assert.equal(reserved.p_payer, payer);
  assert.equal(reserved.p_nonce, tx);
  assert.equal(reserved.p_username, 'nike');
  await assert.rejects(executePublicPayment('never-a-real-signature', payer, 'nike', id), /reservation unavailable/);
  await assert.rejects(executePublicPayment('never-a-real-signature', payer, 'other', '22222222-2222-4222-8222-222222222222'), /reservation unavailable/);
  assert.equal(gatewayCalls, 1, 'duplicate reservation/nonce must be refused before paid forwarding');
  console.log('PASS actual reservation caller binding and replay refusal (database mocked)');
  const originalSnapshot = JSON.stringify(stored);
  failure = 'settlement';
  staged.body = { ...body, edge_followed_by: { count: 999 } };
  const savedAgain = await resumePaidResponse(id);
  assert.equal(savedAgain.status, 'settled');
  assert.equal(JSON.stringify(savedAgain.report), originalSnapshot, 'resume must return the exact saved snapshot and timestamp, not re-analyze data');
  assert.equal(gatewayCalls, 1);
  console.log('PASS immutable saved snapshot and generation timestamp on resume, even with verification unavailable');
  reset('uncertain-unverified');
  assert.equal((await executePublicPayment('never-a-real-signature', payer, 'nike', id)).status, 'unresolved');
  assert.ok(staged);
  assert.equal(stored, undefined, 'body transaction hints must never bypass the real verification dependency');
  reset();
  const concurrent = await Promise.allSettled([
    executePublicPayment('never-a-real-signature', payer, 'nike', id),
    executePublicPayment('never-a-real-signature', payer, 'nike', id),
  ]);
  assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(gatewayCalls, 1);
  console.log('PASS concurrent duplicate execution (database reservation uniqueness mocked)');
  const { validateScanReport } = load('src/lib/scan-report-validation.ts');
  assert.equal(validateScanReport(JSON.parse(fs.readFileSync('data/instagram-snapshot.json', 'utf8')), 'instagram').username, 'instagram');
  console.log('PASS repository historical Instagram response fixture (not a fresh provider response)');
  reset('historical-fixture');
  const historical = await executePublicPayment('never-a-real-signature', payer, 'instagram', id);
  assert.equal(historical.status, 'settled');
  assert.equal(historical.report.username, 'instagram');
  assert.equal(staged.body.output.username, 'instagram');
  assert.equal(stored.username, 'instagram');
  assert.equal(gatewayCalls, 1);
  console.log('PASS historical candidate through staging, generation and saved readback (transport/payment/DB mocked; provenance unattested)');
  const proof = values => Buffer.from(JSON.stringify({ success: true, network: 'eip155:42220', transaction: tx, ...values })).toString('base64');
  assert.equal(parsePaymentResponse(new Headers({ 'X-PAYMENT-RESPONSE': proof({ network: 'celo' }) })), tx);
  assert.equal(parsePaymentResponse(new Headers({ 'PAYMENT-RESPONSE': proof({}), 'X-PAYMENT-RESPONSE': proof({}) })), tx);
  for (const headers of [
    { 'PAYMENT-RESPONSE': proof({ success: false }) },
    { 'PAYMENT-RESPONSE': proof({ network: 'eip155:1' }) },
    { 'PAYMENT-RESPONSE': proof({}), 'X-PAYMENT-RESPONSE': proof({ transaction: '0x' + 'cd'.repeat(32) }) },
    { 'PAYMENT-RESPONSE': proof({}), 'X-PAYMENT-RESPONSE': 'bad' },
  ]) assert.throws(() => parsePaymentResponse(new Headers(headers)));
  await assert.rejects(readBoundedGatewayBody(new Response('x'.repeat(524289))));
  reset(); staged = { username: 'other', txHash: tx, body, authorization: { ...authorization, amount: '5000' } };
  assert.equal((await resumePaidResponse(id)).status, 'settled_report_unavailable');
  assert.equal(stored, undefined);
  console.log('PASS legacy, conflicts, malformed proof, body bound, username binding');
  const recovery = load('src/app/api/report-recovery/route.ts');
  reset();
  staged = { username: 'nike', txHash: tx, body, authorization: { ...authorization, amount: '5000' } };
  const payload = { action: 'redeem', reservationId: id, payer, nonce: 'ab'.repeat(32), signature: '0x' + '11'.repeat(65), issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString() };
  const request = () => new Request('https://offline.invalid/api/report-recovery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  validWallet = false;
  assert.equal((await recovery.POST(request())).status, 403);
  assert.equal(events.length, 0, 'bad wallet must not access response');
  validWallet = true; consumeChallenge = false;
  assert.equal((await recovery.POST(request())).status, 404);
  assert.ok(!events.includes('marketscout_read_staged_response'), 'replayed challenge must not process report');
  consumeChallenge = true;
  payload.payer = '0x' + '34'.repeat(20);
  assert.equal((await recovery.POST(request())).status, 404, 'another valid wallet cannot consume the owner challenge');
  payload.payer = payer;
  const recovered = await recovery.POST(request());
  assert.equal(recovered.status, 200);
  const recoveredSnapshot = await recovered.json();
  assert.equal(recoveredSnapshot.status, 'recovered');
  const recoveredJson = JSON.stringify(recoveredSnapshot.report);
  assert.equal(gatewayCalls, 0);
  failure = 'staging-read';
  events = [];
  const savedRecovery = await recovery.POST(request());
  assert.equal(savedRecovery.status, 200);
  assert.equal(JSON.stringify((await savedRecovery.json()).report), recoveredJson, 'recovery must preserve all fields and generation time exactly');
  assert.ok(!events.includes('marketscout_read_staged_response'), 'saved report recovery must not depend on staging');
  assert.ok(!events.includes('verify'), 'saved report recovery must not repeat onchain verification');
  reset('historical-fixture');
  staged = { username: 'instagram', txHash: tx, body: JSON.parse(fs.readFileSync('data/instagram-snapshot.json', 'utf8')), authorization: { ...authorization, amount: '5000' } };
  const historicalRecovery = await recovery.POST(request());
  assert.equal(historicalRecovery.status, 200);
  assert.equal((await historicalRecovery.json()).report.username, 'instagram');
  assert.equal(gatewayCalls, 0);
  console.log('PASS historical candidate authenticated processing/recovery (wallet/challenge/payment/DB mocked)');
  console.log('PASS authenticated recovery with new payments disabled; invalid wallet and challenge replay rejected');
})().catch(error => { console.error(error); process.exitCode = 1; });
