// Checks that the committed image output still matches the sources.
//
//     node scripts/check-images.mjs
//
// optimize-images.js and optimize-logos.js are run by hand and their output is
// committed, for the reasons their own comments give: sharp is a compiled
// dependency, and the photographs change about once a year. The cost of that
// choice is that nothing notices when somebody adds a photograph, imports it,
// and does not run the script -- the build succeeds, because the import
// resolves to the original file, and the site ships a four megabyte JPEG to a
// phone.
//
// This is the part of those scripts that can run without sharp: not "are the
// WebPs correct", but "is there a WebP at all, for everything that claims
// one". It runs in CI, where installing sharp would be the tax the scripts
// were written to avoid.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, basename } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = join(HERE, '..');
const SOURCE = join(FRONTEND, 'src/images');
const OPTIMIZED = join(SOURCE, 'optimized');
const LOGO_OUTPUT = join(OPTIMIZED, 'logos');

const problems = [];
const fail = (message) => problems.push(message);

// The two scripts own the lists. Reading them from the source rather than
// repeating them here is the whole point: a second copy of the list would
// itself be a thing that drifts.
const imagesScript = readFileSync(join(HERE, 'optimize-images.js'), 'utf8');
const logosScript = readFileSync(join(HERE, 'optimize-logos.js'), 'utf8');

/**
 * Drop `//` comment lines before reading string literals out of a block.
 *
 * Without this, an apostrophe in a comment -- "the photograph's width" -- is
 * read as the start of a string literal, and every filename after it comes out
 * shifted by one quote. The result is not a clean failure but a set of
 * nonsense names reported as missing files, which is a worse bug than the one
 * this script exists to catch.
 */
const withoutComments = (block) =>
  block
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');

/** The PHOTOGRAPHS array, as literal strings. */
function photographs() {
  const block = imagesScript.match(/const PHOTOGRAPHS = \[([\s\S]*?)\];/)?.[1];
  if (!block) throw new Error('could not find PHOTOGRAPHS in optimize-images.js');
  return [...withoutComments(block).matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

/** The LOGOS object, as source filename -> output name. */
function logos() {
  const block = logosScript.match(/const LOGOS = \{([\s\S]*?)\};/)?.[1];
  if (!block) throw new Error('could not find LOGOS in optimize-logos.js');
  return [...withoutComments(block).matchAll(/'([^']+)':\s*\['([^']+)'/g)].map((match) => ({
    source: match[1],
    output: match[2],
  }));
}

/** aruba-centraal, matching optimize-images.js's own stem(). */
const stem = (filename) => basename(filename, extname(filename)).replaceAll('.', '-');

const present = new Set(readdirSync(SOURCE));
const generated = existsSync(OPTIMIZED) ? new Set(readdirSync(OPTIMIZED)) : new Set();
const generatedLogos = existsSync(LOGO_OUTPUT) ? new Set(readdirSync(LOGO_OUTPUT)) : new Set();

const PHOTOGRAPHS = photographs();
const LOGOS = logos();

// ---------------------------------------------------------------------------
// Every photograph the script claims still exists, and has output committed.
// ---------------------------------------------------------------------------

for (const name of PHOTOGRAPHS) {
  if (!present.has(name)) {
    fail(`optimize-images.js lists ${name}, which is not in src/images`);
    continue;
  }

  // Which widths were written depends on the source's own width -- the script
  // never upscales -- so the assertion is "at least one", not a fixed set.
  const variants = [...generated].filter((file) =>
    new RegExp(`^${escape(stem(name))}-\\d+\\.webp$`).test(file)
  );

  if (variants.length === 0) {
    fail(`${name} has no optimised WebP in src/images/optimized -- run \`npm run images\``);
  }
}

// ---------------------------------------------------------------------------
// The generated module the components actually import.
// ---------------------------------------------------------------------------

const photosModule = join(OPTIMIZED, 'photos.js');

if (!existsSync(photosModule)) {
  fail('src/images/optimized/photos.js is missing -- run `npm run images`');
} else {
  const source = readFileSync(photosModule, 'utf8');
  for (const name of PHOTOGRAPHS) {
    // The module keys each entry by the source filename, so this is a cheap
    // way to ask whether it was regenerated after the list changed.
    if (!source.includes(stem(name))) {
      fail(`photos.js has no entry for ${name} -- it is stale; run \`npm run images\``);
    }
  }
}

// ---------------------------------------------------------------------------
// The same, for logos.
// ---------------------------------------------------------------------------

for (const { source, output } of LOGOS) {
  if (!present.has(source)) {
    fail(`optimize-logos.js lists ${source}, which is not in src/images`);
    continue;
  }

  if (!generatedLogos.has(`${output}.webp`)) {
    fail(`${source} has no ${output}.webp in src/images/optimized/logos -- run \`npm run logos\``);
  }
}

// ---------------------------------------------------------------------------
// A large original imported straight into a component.
//
// Being in src/images is not itself a problem: Vite only emits an asset that
// something imports, so the uncompressed masters sit in the repository and
// never reach a browser. That is the arrangement optimize-images.js describes
// -- the originals are the masters, and re-running it has to start from full
// quality.
//
// The problem is importing one. `import photo from '../images/big.jpg'` is a
// working line of code that produces a working page and ships the full file to
// a phone, and nothing else in the toolchain objects. So the check is not "is
// this file large" but "is this large file reached by the bundle".
// ---------------------------------------------------------------------------

const LARGE = 250 * 1024;

const known = new Set([...PHOTOGRAPHS, ...LOGOS.map((logo) => logo.source)]);

/** Every source file that could carry an import, excluding generated output. */
function sourceFiles(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'optimized') continue;
      found.push(...sourceFiles(path));
    } else if (['.js', '.jsx'].includes(extname(entry.name))) {
      found.push(path);
    }
  }
  return found;
}

const appSource = sourceFiles(join(FRONTEND, 'src'))
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');

for (const name of present) {
  if (known.has(name)) continue;

  const path = join(SOURCE, name);
  const stats = statSync(path);
  if (stats.isDirectory() || stats.size <= LARGE) continue;

  // Quoted, so this matches the import specifier rather than a mention of the
  // filename in a comment.
  if (appSource.includes(`/${name}'`) || appSource.includes(`/${name}"`)) {
    fail(
      `src/images/${name} is ${Math.round(stats.size / 1024)} KB, is imported directly, and is in ` +
        'neither PHOTOGRAPHS (optimize-images.js) nor LOGOS (optimize-logos.js), so it ships uncompressed'
    );
  }
}

/** Escape a filename stem for use inside a RegExp. */
function escape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

if (problems.length === 0) {
  console.log(
    `images agree: ${PHOTOGRAPHS.length} photographs, ${LOGOS.length} logos, output committed.`
  );
  process.exit(0);
}

console.error(`\n${problems.length} problem(s):\n`);
for (const problem of problems) console.error(`  ${problem}`);
console.error('');
process.exit(1);
