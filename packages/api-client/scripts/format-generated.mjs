import { readFile, writeFile } from 'node:fs/promises';

const target = new URL('../src/generated.ts', import.meta.url);
const source = await readFile(target, 'utf8');
const normalized = `${source
  .split(/\r?\n/u)
  .map((line) => line.trimEnd())
  .join('\n')
  .trimEnd()}\n`;

await writeFile(target, normalized, 'utf8');
