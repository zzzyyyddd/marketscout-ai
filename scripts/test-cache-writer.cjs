/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

const source = fs.readFileSync(
  path.join(process.cwd(), 'src/lib/profile-cache-write.ts'),
  'utf8'
);

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;

let rpcCalls = 0;
let rpcResult = { data: true, error: null };

const validReport = {
  username: 'nike',
  followers: 100,
};

const mocks = {
  'server-only': {},
  '@supabase/supabase-js': {
    createClient: () => ({
      rpc: async (_name, args) => {
        rpcCalls++;
        assert.equal(
          _name,
          'marketscout_store_profile_cache'
        );
        assert.equal(args.p_username, 'nike');
        assert.equal(args.p_source, 'live');
        assert.equal(args.p_network, 'celo-sepolia');
        assert.equal(args.p_ttl_seconds, 86400);
        return rpcResult;
      },
    }),
  },
  './report': {
    isCompetitorReport: report =>
      report &&
      typeof report.username === 'string' &&
      typeof report.followers === 'number',
  },
  './payment-policy': {
    validateInstagramUsername: username => {
      if (
        typeof username !== 'string' ||
        !/^[a-z0-9._]{1,30}$/.test(username)
      ) {
        throw new Error('Invalid username');
      }
      return username;
    },
  },
};

const sandbox = {
  exports: {},
  require: name => {
    if (!(name in mocks)) {
      throw new Error(`Unexpected import: ${name}`);
    }
    return mocks[name];
  },
  process: {
    env: {
      SUPABASE_URL: 'https://mock.invalid',
      SUPABASE_SECRET_KEY: 'mock-only',
    },
  },
  AbortSignal,
  fetch: () => {
    throw new Error('Network access forbidden');
  },
  Date,
  Error,
};

vm.runInNewContext(compiled, sandbox, {
  filename: 'profile-cache-write.js',
});

const { writeCachedProfile } = sandbox.exports;

async function test(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
    return true;
  } catch (error) {
    console.log(`FAIL ${name}: ${error.message}`);
    return false;
  }
}

(async () => {
  const results = [];

  results.push(await test('T1 RPC success', async () => {
    rpcCalls = 0;
    rpcResult = { data: true, error: null };
    assert.equal(
      await writeCachedProfile('nike', validReport),
      true
    );
    assert.equal(rpcCalls, 1);
  }));

  results.push(await test('T2 username mismatch', async () => {
    rpcCalls = 0;
    await assert.rejects(
      writeCachedProfile('adidas', validReport)
    );
    assert.equal(rpcCalls, 0);
  }));

  results.push(await test('T3 invalid report', async () => {
    rpcCalls = 0;
    await assert.rejects(
      writeCachedProfile('nike', { username: 'nike' })
    );
    assert.equal(rpcCalls, 0);
  }));

  results.push(await test('T4 RPC error', async () => {
    rpcCalls = 0;
    rpcResult = {
      data: null,
      error: { message: 'Mock database failure' },
    };
    await assert.rejects(
      writeCachedProfile('nike', validReport),
      /Cache write failed/
    );
    assert.equal(rpcCalls, 1);
  }));

  results.push(await test('T5 RPC false', async () => {
    rpcCalls = 0;
    rpcResult = { data: false, error: null };
    assert.equal(
      await writeCachedProfile('nike', validReport),
      false
    );
    assert.equal(rpcCalls, 1);
  }));

  const passed = results.filter(Boolean).length;
  console.log(`\nRESULT: ${passed}/5 PASS`);

  if (passed !== 5) process.exitCode = 1;
})();
