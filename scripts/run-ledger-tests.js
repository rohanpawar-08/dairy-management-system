const { execSync } = require('child_process');

console.log('================================================================');
console.log('🧪 RUNNING STAGE 7 DEDICATED LEDGER & ADJUSTMENTS TEST SUITE');
console.log('================================================================\n');

// 1. Run Angular Stage 7 Frontend Tests
console.log('[Ledger Tests] Step 1: Running Angular Ledger Components & State Tests (ng test)...');
try {
  const angularSpecs = [
    'src/app/core/services/ledger-state.service.spec.ts',
    'src/app/features/ledger/ledger.component.spec.ts',
  ];
  const includeArgs = angularSpecs.map((s) => `--include="${s}"`).join(' ');
  execSync(`npx ng test --watch=false ${includeArgs}`, {
    stdio: 'inherit',
    env: process.env,
  });
} catch (err) {
  console.error('\n[Ledger Tests] ❌ Angular Ledger tests failed.');
  process.exit(1);
}

// 2. Run Backend Stage 7 Tests (Adjustment Numbering, Adjustments, Ledger, Migration 005)
console.log('\n[Ledger Tests] Step 2: Running Backend Stage 7 Integration & Unit Tests (vitest)...');
try {
  execSync(
    'npx vitest run tests/unit/adjustment-number.spec.ts tests/integration/migrations-stage7.spec.ts tests/integration/adjustments.spec.ts tests/integration/ledger.spec.ts',
    { stdio: 'inherit', env: process.env }
  );
} catch (err) {
  console.error('\n[Ledger Tests] ❌ Backend Ledger tests failed.');
  process.exit(1);
}

console.log('\n================================================================');
console.log('✅ ALL STAGE 7 LEDGER & ADJUSTMENT TESTS PASSED SUCCESSFULLY!');
console.log('================================================================');
