import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

test(
  'tarball installs offline with ESM/CJS parity and strict browser-only NodeNext types',
  { timeout: 120000 },
  () => {
    const cwd = process.cwd();
    const consumer = resolve(cwd, '.consumer-check');
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
    const npm =
      process.env.npm_execpath ??
      resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
    const run = (args, where = cwd) => {
      const result = spawnSync(process.execPath, args, {
        cwd: where,
        encoding: 'utf8',
        timeout: 90000,
      });
      assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
      return result.stdout;
    };
    assert.deepEqual(Object.keys(manifest.peerDependencies), ['react']);
    assert.equal(Object.keys(manifest.dependencies ?? {}).length, 0);
    assert.equal(manifest.publishConfig.registry, 'https://registry.npmjs.org/');
    mkdirSync(consumer);
    try {
      const packed = JSON.parse(
        run([npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', consumer]),
      )[0];
      const files = packed.files.map((file) => file.path);
      assert.ok(
        files.every(
          (file) =>
            file.startsWith('dist/') || ['README.md', 'LICENSE', 'package.json'].includes(file),
        ),
      );
      for (const required of [
        'README.md',
        'LICENSE',
        'dist/style.css',
        'dist/esm/index.js',
        'dist/cjs/index.js',
        'dist/esm/index.d.ts',
        'dist/cjs/index.d.ts',
      ]) {
        assert.ok(files.includes(required), required);
      }
      writeFileSync(resolve(consumer, 'package.json'), '{"private":true,"type":"module"}');
      const version = (name) =>
        JSON.parse(readFileSync(resolve(cwd, 'node_modules', name, 'package.json'), 'utf8'))
          .version;
      run(
        [
          npm,
          'install',
          '--offline',
          '--ignore-scripts',
          '--no-audit',
          '--no-fund',
          '--no-package-lock',
          resolve(consumer, packed.filename),
          `react@${version('react')}`,
          `@types/react@${version('@types/react')}`,
        ],
        consumer,
      );
      const name = JSON.stringify(manifest.name);
      const exports = JSON.parse(
        run(
          [
            '--input-type=module',
            '--eval',
            `import * as esm from ${name}; import {createRequire} from "node:module"; import assert from "node:assert/strict"; const cjs=createRequire(import.meta.url)(${name}); assert.deepEqual(Object.keys(esm).sort(),Object.keys(cjs).sort()); console.log(JSON.stringify(Object.keys(esm)));`,
          ],
          consumer,
        ),
      );
      const readme = readFileSync('README.md', 'utf8');
      for (const key of exports) assert.ok(readme.includes(key), `README missing ${key}`);
      writeFileSync(
        resolve(consumer, 'check.mts'),
        `import * as api from ${name}; export const surface: typeof api = api;\n`,
      );
      writeFileSync(
        resolve(consumer, 'check.cts'),
        `import api = require(${name}); export const surface: typeof api = api;\n`,
      );
      writeFileSync(
        resolve(consumer, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            strict: true,
            noEmit: true,
            skipLibCheck: false,
            types: [],
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            target: 'ES2020',
            lib: ['ES2020', 'DOM'],
          },
          include: ['check.mts', 'check.cts'],
        }),
      );
      run(
        [
          resolve(cwd, 'node_modules/typescript/bin/tsc'),
          '--project',
          resolve(consumer, 'tsconfig.json'),
        ],
        consumer,
      );
    } finally {
      rmSync(consumer, { recursive: true, force: true });
    }
  },
);
