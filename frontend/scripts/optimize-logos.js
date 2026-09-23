// Turns the shop logos in src/images into small WebP files for the shop
// cards on the home page.
//
//     npm run logos
//
// Run by hand, like `npm run images`, and the output is committed.
//
// The originals are large (up to 3840px and 130 KB) and several are a small
// logo in the middle of a wide white image. Each is:
//
//   * trimmed back to the mark itself, against whatever its own background
//     is - white for most, brand colour for the few that ship as a coloured
//     tile. Bol.com in particular is a small wordmark adrift in a large blue
//     square, and untrimmed it reads as a blue block rather than a logo.
//     Trimming leaves the mark still on its brand colour, because that colour
//     is the background it is drawn on, not a border around it.
//   * scaled to fit 400x400, which is sharp on the cards on a high-density
//     screen.

import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const SOURCE = 'src/images';
const OUTPUT = 'src/images/optimized/logos';
const SIZE = 400;
const QUALITY = 85;

// source file -> [output name, the background colour to trim away]. The
// colour is the logo's own backdrop, sampled from its top-left corner; `null`
// means leave the borders alone, for a logo whose surrounding colour is part
// of the artwork rather than padding around it.
const LOGOS = {
  'IKEA-Image.png': ['ikea', '#ffffff'],
  'Bol.com-image.webp': ['bol', '#0100a4'],
  'autodoc-logo.png': ['autodoc', '#ffffff'],
  'coolblue-image.jpg': ['coolblue', '#1daaef'],
  'H&M logo.jpg': ['hm', '#ffffff'],
  'MediaMarkt.png': ['mediamarkt', '#ffffff'],
  'action-logo.png': ['action', '#ffffff'],
  'Zalando.png': ['zalando', '#ffffff'],

  // The wide "long" logos, used by the services page only - the home page
  // cards are small and square-ish, which suits the compact marks above.
  // See `longLogo` in src/data/shops.js.
  'Bol.com-Long-Logo.png': ['bol-long', '#ffffff'],
  // Not trimmed: this one is the badge centred on a wide band of brand
  // colour, and trimming the band would hand back the square badge, which is
  // the opposite of what a long logo is for.
  'Coolblue-Long-Long.jpg': ['coolblue-long', null],
};

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;

async function main() {
  await mkdir(OUTPUT, { recursive: true });

  for (const [file, [name, background]] of Object.entries(LOGOS)) {
    const source = join(SOURCE, file);

    let image = sharp(source);

    if (background) {
      image = image
        // Transparency becomes the logo's own backdrop rather than white, so
        // a mark on brand colour is not ringed in white once it is flattened.
        .flatten({ background })
        // A small threshold catches JPEG noise around the edge of the border.
        .trim({ background, threshold: 20 });
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
