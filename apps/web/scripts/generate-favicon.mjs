import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve('next'))('sharp');
const source = await readFile(new URL('./assets/athleta-star.svg', import.meta.url));
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(size => sharp(source, { density: 384 }).resize(size, size).png().toBuffer()));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (const [index, size] of sizes.entries()) {
  const entry = 6 + index * 16;
  header[entry] = size; header[entry + 1] = size;
  header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(images[index].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += images[index].length;
}
await writeFile(new URL('../src/app/favicon.ico', import.meta.url), Buffer.concat([header, ...images]));
