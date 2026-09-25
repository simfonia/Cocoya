const fs = require('fs');
const path = require('path');

const runnerPath = path.resolve(__dirname, '..', 'out', 'test', 'runTest.js');

if (!fs.existsSync(runnerPath)) {
    console.error('VS Code integration test harness is not installed yet.');
    console.error('Expected compiled runner: ' + runnerPath);
    console.error('Create src/test/runTest.ts and the test suite before running npm run test:integration.');
    process.exitCode = 1;
} else {
    require(runnerPath);
}
