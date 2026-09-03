const { execSync } = require('child_process');

console.log('================================================================');
console.log('🧪 RUNNING COMPLETE TEST SUITE (ANGULAR + BACKEND INTEGRATION)');
console.log('================================================================\n');

// 1. Run Angular Frontend Tests via Angular Builder
console.log('[Test Suite] Step 1: Running Angular Component & Renderer Tests (ng test)...');
try {
  execSync('npx ng test --watch=false', { stdio: 'inherit', env: process.env });
} catch (err) {
  console.error('\n[Test Suite] ❌ Angular tests failed.');
  process.exit(err.status || 1);
}

// 2. Run Backend Unit & Integration Tests via Vitest (Node environment)
console.log('\n[Test Suite] Step 2: Running Backend Unit & Integration Tests (vitest)...');
try {
  execSync('npx vitest run tests', { stdio: 'inherit', env: process.env });
} catch (err) {
  console.error('\n[Test Suite] ❌ Backend integration tests failed.');
  process.exit(err.status || 1);
}

console.log('\n================================================================');
console.log('✅ ALL TEST SUITES PASSED SUCCESSFULLY!');
console.log('================================================================');
