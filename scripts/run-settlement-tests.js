const { execSync } = require('child_process');

console.log('================================================================');
console.log('🧪 RUNNING STAGE 8 SETTLEMENTS & PAYMENTS TEST SUITE');
console.log('================================================================\n');

try {
  console.log('[Settlement Tests] Running Stage 8 backend vitest specs...');
  execSync('npx vitest run tests/unit/settlement-number.spec.ts tests/unit/payment-number.spec.ts tests/integration/migrations-stage8.spec.ts tests/integration/settlements.spec.ts tests/integration/payments.spec.ts', {
    stdio: 'inherit',
    env: process.env,
  });

  console.log('\n[Settlement Tests] Running Stage 8 Angular component specs...');
  execSync('npx ng test --watch=false --include="src/app/features/settlements/settlements.component.spec.ts"', {
    stdio: 'inherit',
    env: process.env,
  });

  console.log('\n================================================================');
  console.log('✅ STAGE 8 SETTLEMENT & PAYMENT TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================');
} catch (err) {
  console.error('\n❌ Stage 8 settlement tests failed:', err.message);
  process.exit(1);
}
