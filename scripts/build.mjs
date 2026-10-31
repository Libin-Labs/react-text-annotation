import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const compiler = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));
rmSync('dist', { recursive: true, force: true });
for (const [module, outDir, resolution] of [
  ['ES2022', 'dist/esm', 'Bundler'],
  ['CommonJS', 'dist/cjs', 'Node'],
]) {
  const result = spawnSync(
    process.execPath,
    [compiler, '--module', module, '--moduleResolution', resolution, '--outDir', outDir],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
mkdirSync('dist/cjs', { recursive: true });
writeFileSync('dist/cjs/package.json', '{"type":"commonjs"}\n');
copyFileSync('style.css', 'dist/style.css');
