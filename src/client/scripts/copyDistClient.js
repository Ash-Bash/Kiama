#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function remove(p) {
  try { await fs.rm(p, { recursive: true, force: true }); } catch (e) {}
}

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else if (entry.isSymbolicLink()) {
      const link = await fs.readlink(srcPath);
      try { await fs.symlink(link, destPath); } catch (e) { await fs.copyFile(srcPath, destPath); }
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

(async () => {
  try {
    const repoDistClient = path.resolve(__dirname, '..', '..', '..', 'dist', 'client');
    const localDistClient = path.resolve(__dirname, '..', 'dist', 'client');

    if (!await exists(repoDistClient)) {
      console.error('Source build not found:', repoDistClient);
      process.exit(1);
    }

    await remove(localDistClient);
    await copyDir(repoDistClient, localDistClient);
    console.log('Copied', repoDistClient, '->', localDistClient);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
