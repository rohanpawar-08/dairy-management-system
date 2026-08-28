const fs = require('fs');
const path = require('path');

function checkAndPrepareNative() {
  const bs3Dir = path.join(__dirname, '..', 'node_modules', 'better-sqlite3');
  if (!fs.existsSync(bs3Dir)) {
    console.warn('[rebuild-native] better-sqlite3 not found in node_modules.');
    return;
  }

  const prebuildNode = path.join(bs3Dir, 'prebuilds', 'win32-x64.node');
  const releaseDir = path.join(bs3Dir, 'build', 'Release');
  const releaseNode = path.join(releaseDir, 'better_sqlite3.node');

  if (fs.existsSync(prebuildNode)) {
    if (!fs.existsSync(releaseDir)) {
      fs.mkdirSync(releaseDir, { recursive: true });
    }
    if (!fs.existsSync(releaseNode)) {
      fs.copyFileSync(prebuildNode, releaseNode);
      console.log('[rebuild-native] Copied prebuild win32-x64.node to build/Release/better_sqlite3.node');
    }
  }

  try {
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    const row = db.prepare('SELECT sqlite_version() AS version, 1 AS ok').get();
    db.close();
    console.log(`[rebuild-native] Native SQLite verified: SQLite version ${row.version}`);
  } catch (err) {
    console.error('[rebuild-native] Failed to verify better-sqlite3:', err.message);
    process.exit(1);
  }
}

checkAndPrepareNative();
