const { execSync } = require('child_process');

console.log('================================================================');
console.log('🧪 RUNNING STAGE 6 DEDICATED MILK COLLECTION TEST SUITE');
console.log('================================================================\n');

// 1. Run Angular Stage 6 Frontend Tests
console.log('[Collection Tests] Step 1: Running Angular Collection Components, Dialogs & State Tests (ng test)...');
try {
  const angularSpecs = [
    'src/app/core/services/collection-state.service.spec.ts',
    'src/app/features/collection/collection.component.spec.ts',
    'src/app/features/collection/duplicate-confirm-dialog/duplicate-confirm-dialog.component.spec.ts',
    'src/app/features/collection/void-collection-dialog/void-collection-dialog.component.spec.ts',
    'src/app/features/collection/close-shift-dialog/close-shift-dialog.component.spec.ts',
    'src/app/features/collection/reopen-shift-dialog/reopen-shift-dialog.component.spec.ts',
  ];
  const includeArgs = angularSpecs.map((s) => `--include="${s}"`).join(' ');
  execSync(`npx ng test --watch=false ${includeArgs}`, {
    stdio: 'inherit',
    env: process.env,
  });
} catch (err) {
  console.error('\n[Collection Tests] ❌ Angular Collection tests failed.');
  process.exit(1);
}

// 2. Run Backend Stage 6 Tests (Receipt Numbering, Shift & Collection Services, Migration 004)
console.log('\n[Collection Tests] Step 2: Running Backend Stage 6 Integration & Unit Tests (vitest)...');
try {
  execSync(
    'npx vitest run tests/unit/receipt-number.spec.ts tests/integration/shifts.spec.ts tests/integration/collections.spec.ts tests/integration/migrations-stage6.spec.ts',
    { stdio: 'inherit', env: process.env }
  );
} catch (err) {
  console.error('\n[Collection Tests] ❌ Backend Collection tests failed.');
  process.exit(1);
}

console.log('\n================================================================');
console.log('✅ ALL STAGE 6 MILK COLLECTION TESTS PASSED SUCCESSFULLY!');
console.log('================================================================');
