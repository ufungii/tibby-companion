import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Expand test paths ourselves: Windows npm does not use a Unix shell glob.
const directory = new URL('../tests/', import.meta.url);
const files = readdirSync(directory)
  .filter((name) => name.endsWith('.test.ts'))
  .sort()
  .map((name) => fileURLToPath(new URL(name, directory)));
if (!files.length) throw new Error('No test files found.');
const result = spawnSync(process.execPath, [
  '--experimental-strip-types', '--test', '--test-isolation=none', ...files,
], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
