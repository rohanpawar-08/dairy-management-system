const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '..', 'electron', 'db', 'migrations');
const destDir = path.resolve(__dirname, '..', 'dist-electron', 'electron', 'db', 'migrations');

// 1. Validate that authoritative source directory exists
if (!fs.existsSync(srcDir)) {
  console.error('[Copy Migrations] Fatal error: Source migrations directory does not exist:', srcDir);
  process.exit(1);
}

// 2. Discover valid .sql migration files in source directory
const srcFiles = fs.readdirSync(srcDir).filter((file) => file.endsWith('.sql'));
if (srcFiles.length === 0) {
  console.error('[Copy Migrations] Fatal error: Source directory contains no .sql migration files:', srcDir);
  process.exit(1);
}

// 3. Stale resource prevention: Safely clean and recreate exact destination directory
if (fs.existsSync(destDir)) {
  fs.rmSync(destDir, { recursive: true, force: true });
}
fs.mkdirSync(destDir, { recursive: true });

// 4. Copy each authoritative migration file to destination
let copiedCount = 0;
for (const file of srcFiles) {
  const srcPath = path.join(srcDir, file);
  const destPath = path.join(destDir, file);
  fs.copyFileSync(srcPath, destPath);
  copiedCount++;
}

// 5. Deterministic verification assertion: Ensure destination contains exact match of source migrations
const destFiles = fs.readdirSync(destDir).filter((file) => file.endsWith('.sql'));
if (destFiles.length !== srcFiles.length || !srcFiles.every((f) => destFiles.includes(f))) {
  console.error(
    `[Copy Migrations] Assertion failed: Destination files [${destFiles.join(', ')}] ` +
    `do not match source files [${srcFiles.join(', ')}]`
  );
  process.exit(1);
}

console.log(`[Copy Migrations] Successfully synchronized ${copiedCount} migration file(s) to ${destDir}`);
