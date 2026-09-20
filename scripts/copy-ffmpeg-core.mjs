import { cp, mkdir, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'node_modules/@ffmpeg/core/dist/esm');
const destination = resolve(root, 'public/ffmpeg');
const files = ['ffmpeg-core.js', 'ffmpeg-core.wasm'];

await mkdir(destination, { recursive: true });

for (const file of files) {
  await cp(resolve(source, file), resolve(destination, file));
}

const licenseFiles = await readdir(resolve(root, 'node_modules/@ffmpeg/core'));
const license = licenseFiles.find((file) => /^license/i.test(file));
if (license) {
  await cp(
    resolve(root, 'node_modules/@ffmpeg/core', license),
    resolve(destination, 'LICENSE.ffmpeg-core'),
  );
}
