/**
 * Ensures Node >= 18 before running Vite (Vite 6 is incompatible with Node 14, etc.).
 */
const path = require('path');
const { spawnSync } = require('child_process');

const major = parseInt(process.version.slice(1).split('.')[0], 10);
if (Number.isNaN(major) || major < 18) {
  console.error(
    '\n[pre-vetting-system] Node.js 18 or newer is required (this project uses Vite 6).',
  );
  console.error('Current version:', process.version);
  console.error(
    'Install Node 20 LTS from https://nodejs.org/ , reopen this terminal, then run: node -v\n',
  );
  process.exit(1);
}

const viteBin = path.join(__dirname, '..', 'node_modules', 'vite', 'bin', 'vite.js');
const viteArgs = process.argv.slice(2);
const fallback = ['--port=3000', '--host=0.0.0.0'];
const args = viteArgs.length ? viteArgs : fallback;

const result = spawnSync(process.execPath, [viteBin, ...args], {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status === null ? 1 : result.status);
