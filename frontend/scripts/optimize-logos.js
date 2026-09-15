// Turns the shop logos in src/images into small WebP files for the spinning
// wheel and the brands strip.
//
//     npm run logos
//
// Run by hand, like `npm run images`, and the output is committed.
//
// The originals are large (up to 3840px and 130 KB) and several are a small
// logo in the middle of a wide white image. Each is:
//
//   * trimmed, when its background is white - so the logo itself fills the
//     file and needs no per-logo sizing tricks in the wheel. Never for a logo
//     on a coloured background: trimming would remove the brand colour and
//     leave white text on nothing.
//   * scaled to fit 400x400, which is sharp at the wheel's largest badge and
//     the brands card on a high-density screen.

import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const SOURCE = 'src/images';
const OUTPUT = 'src/images/optimized/logos';
const SIZE = 400;
const QUALITY = 85;

// source file -> [output name, trim the white border?]
const LOGOS = {
  'IKEA-Image.png': ['ikea', true],
  'Bol.com-image.webp': ['bol', false],
  'autodoc-logo.png': ['autodoc', true],
  'coolblue-image.jpg': ['coolblue', false],
  'H&M logo.jpg': ['hm', true],
  'MediaMarkt.png': ['mediamarkt', true],
  'action-logo.png': ['action', true],
  'Zalando.png': ['zalando', true],
};

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;

async function main() {
  await mkdir(OUTPUT, { recursive: true });

  for (const [file, [name, trim]] of Object.entries(LOGOS)) {
    const source = join(SOURCE, file);
    let image = sharp(source).flatten({ background: '#ffffff' });

    if (trim) {
      // A small threshold catches JPEG noise around the edge of the white.
      image = image.trim({ background: '#ffffff', threshold: 20 });
    }

    const buffer = await image
      .resize(SIZE, SIZE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer();

    const target = join(OUTPUT, `${name}.webp`);
    await writeFile(target, buffer);

    const before = (await stat(source)).size;
    console.log(`${file.padEnd(22)} ${kb(before).padStart(7)} -> ${name}.webp ${kb(buffer.length)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
