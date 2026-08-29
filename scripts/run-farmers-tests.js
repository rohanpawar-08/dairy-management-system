const { execSync } = require('child_process');

console.log('================================================================');
console.log('🧪 RUNNING STAGE 4 DEDICATED FARMER TEST SUITE');
console.log('================================================================\n');

let angularPassed = false;
let backendPassed = false;

// 1. Run Angular Stage 4 Frontend Tests
console.log('[Farmer Tests] Step 1: Running Angular Farmer Component & State Tests (ng test)...');
try {
  execSync(
    'npx ng test --watch=false --include="src/app/core/services/farmer-state.service.spec.ts" --include="src/app/features/farmers/**/*.spec.ts"',
    { stdio: 'inherit', env: process.env }
  );
  angularPassed = true;
} catch (err) {
  console.error('\n[Farmer Tests] ❌ Angular Farmer tests failed.');
  process.exit(1);
}

// 2. Run Backend Stage 4 Tests (Money, Masking, Migration 002, Farmers Repo/Service/Security)
console.log('\n[Farmer Tests] Step 2: Running Backend Stage 4 Unit & Integration Tests (vitest)...');
try {
  execSync(
    'npx vitest run tests/unit/money.spec.ts tests/unit/masking.spec.ts tests/integration/migrations-stage4.spec.ts tests/integration/farmers.spec.ts',
    { stdio: 'inherit', env: process.env }
  );
  backendPassed = true;
} catch (err) {
  console.error('\n[Farmer Tests] ❌ Backend Farmer integration tests failed.');
  process.exit(1);
}

console.log('\n================================================================');
console.log('✅ ALL STAGE 4 FARMER TESTS PASSED SUCCESSFULLY!');
console.log('================================================================');
