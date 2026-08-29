const { execSync } = require('child_process');

console.log('================================================================');
console.log('🧪 RUNNING STAGE 5 DEDICATED RATE PLANS TEST SUITE');
console.log('================================================================\n');

// 1. Run Angular Stage 5 Frontend Tests
console.log('[Rate Plan Tests] Step 1: Running Angular Rate Plan Components, Dialogs, Guard & State Tests (ng test)...');
try {
  const angularSpecs = [
    'src/app/core/guards/owner.guard.spec.ts',
    'src/app/core/services/rate-plan-state.service.spec.ts',
    'src/app/features/rate-plans/rate-plans.component.spec.ts',
    'src/app/features/rate-plans/rate-plan-form-dialog/rate-plan-form-dialog.component.spec.ts',
    'src/app/features/rate-plans/rate-plan-clone-dialog/rate-plan-clone-dialog.component.spec.ts',
    'src/app/features/rate-plans/rate-plan-approve-dialog/rate-plan-approve-dialog.component.spec.ts',
    'src/app/features/rate-plans/rate-plan-cancel-dialog/rate-plan-cancel-dialog.component.spec.ts',
    'src/app/features/dashboard/dashboard.component.spec.ts',
  ];
  const includeArgs = angularSpecs.map((s) => `--include="${s}"`).join(' ');
  execSync(`npx ng test --watch=false ${includeArgs}`, {
    stdio: 'inherit',
    env: process.env,
  });
} catch (err) {
  console.error('\n[Rate Plan Tests] ❌ Angular Rate Plan tests failed.');
  process.exit(1);
}

// 2. Run Backend Stage 5 Tests (Calculation Engine, Money/Formula Arithmetic, Rate Plan Integration, Migration 003)
console.log('\n[Rate Plan Tests] Step 2: Running Backend Stage 5 Calculation, Integration & Migration Tests (vitest)...');
try {
  execSync(
    'npx vitest run tests/unit/calculation-engine.spec.ts tests/integration/rate-plans.spec.ts tests/integration/migrations-stage5.spec.ts',
    { stdio: 'inherit', env: process.env }
  );
} catch (err) {
  console.error('\n[Rate Plan Tests] ❌ Backend Rate Plan tests failed.');
  process.exit(1);
}

console.log('\n================================================================');
console.log('✅ ALL STAGE 5 RATE PLANS TESTS PASSED SUCCESSFULLY!');
console.log('================================================================');
