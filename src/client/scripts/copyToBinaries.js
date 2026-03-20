const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../../..'); // src/client/scripts -> repo root
const distRoot = path.join(root, 'dist');
const distClient = path.join(distRoot, 'client');
const binariesRoot = path.join(distRoot, 'binaries');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

(async () => {
  try {
    ensureDir(binariesRoot);

    // Themes
    copyRecursive(path.join(distClient, 'themes'), path.join(binariesRoot, 'themes'));

    // Plugins (built client plugins)
    copyRecursive(path.join(distClient, 'plugins'), path.join(binariesRoot, 'plugins'));

    // Icons (root dist/icons and repo assets)
    copyRecursive(path.join(distRoot, 'icons'), path.join(binariesRoot, 'icons'));
    copyRecursive(path.join(root, 'assets', 'icon'), path.join(binariesRoot, 'icons'));

    console.log('Copied themes/plugins/icons into', binariesRoot);
  } catch (err) {
    console.error('Failed to copy binaries assets:', err);
    process.exit(1);
  }
})();
