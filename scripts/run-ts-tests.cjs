/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');

  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;

  module._compile(output, filename);
};

const testFile = process.argv[2];

if (
  !testFile ||
  !/^scripts\/test-scan-(validation|adversarial)\.ts$/.test(
    testFile
  )
) {
  console.error('Invalid test file');
  process.exit(1);
}

require(path.resolve(testFile));
