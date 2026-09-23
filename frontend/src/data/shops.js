// src/data/shops.js
//
// The shops customers order from, in one list. The shop grid on the home page
// reads it, so every surface shows the same shops. Edit here, and nowhere else.
//
//   name   the logo's alt text
//   logo   a small WebP from src/images/optimized/logos - made from the
//          original in src/images by `npm run logos`
//   longLogo
//          a wider version of the same mark, preferred wherever a shop has
//          one. `logo` stays as the fallback for the shops that do not, and
//          as what is served if a long file is ever withdrawn. Read it
//          through displayLogo() below rather than reaching for the field.
//   tile   true for a logo that is drawn on its own block of brand colour
//          rather than on white - bol.com's blue bar, IKEA's blue box. The
//          card rounds its corners so it reads as a deliberate brand tile
//          instead of a rectangle dropped on the white. Leave it out
//          otherwise.
//   href   the shop's own site, linked from the services page. The Dutch
//          storefront in each case: this is a forwarding service for parcels
//          bought in the Netherlands, so a customer sent to the .com would
//          land on a shop that will not deliver to the warehouse.
//
// This list is the FALLBACK, not the source. The shops the site shows come
// from the API the office edits in the dashboard; these stand in until that
// request answers, and if it fails. A row whose logo has not been uploaded
// yet also borrows the logo here that matches its name, which is what lets
// the table be filled in over time without the pages losing their pictures.
//
// So: add a shop in the dashboard, not here. Edit here only to change what a
// visitor sees before the API answers, or to add a bundled logo for a shop
// that already exists - put the file in src/images, add it to LOGOS in
// scripts/optimize-logos.js, run `npm run logos`, then add a line below.

import action from '../images/optimized/logos/action.webp';
import bolLong from '../images/optimized/logos/bol-long.webp';
import coolblueLong from '../images/optimized/logos/coolblue-long.webp';
import autodoc from '../images/optimized/logos/autodoc.webp';
import bol from '../images/optimized/logos/bol.webp';
import coolblue from '../images/optimized/logos/coolblue.webp';
import hm from '../images/optimized/logos/hm.webp';
import ikea from '../images/optimized/logos/ikea.webp';
import mediamarkt from '../images/optimized/logos/mediamarkt.webp';
import zalando from '../images/optimized/logos/zalando.webp';

export const SHOPS = [
  { name: 'IKEA', logo: ikea, tile: true, href: 'https://www.ikea.com/nl/nl/' },
  {
    name: 'Bol.com',
    logo: bol,
    longLogo: bolLong,
    tile: true,
    // /nl/ redirects here, so link the destination and skip the hop.
    href: 'https://www.bol.com/nl/nl/',
  },
  { name: 'AutoDoc', logo: autodoc, href: 'https://www.autodoc.nl/' },
  {
    name: 'Coolblue',
    logo: coolblue,
    longLogo: coolblueLong,
    tile: true,
    href: 'https://www.coolblue.nl/',
  },
  { name: 'H&M', logo: hm, href: 'https://www2.hm.com/nl_nl/index.html' },
  { name: 'MediaMarkt', logo: mediamarkt, href: 'https://www.mediamarkt.nl/' },
  { name: 'Action', logo: action, href: 'https://www.action.com/nl-nl/' },
  { name: 'Zalando', logo: zalando, href: 'https://www.zalando.nl/' },
];

/**
 * The logo to show for a shop: the long one where there is one.
 *
 * Both the home page cards and the services page ask through here, so the two
 * cannot drift into showing different marks for the same shop.
 */
export function displayLogo(shop) {
  return shop.longLogo ?? shop.logo;
}

/** The bundled shops by lowercased name, for the lookup below. */
const BY_NAME = new Map(SHOPS.map((shop) => [shop.name.toLowerCase(), shop]));

/**
 * The logo bundled with the site for a shop of this name, or null.
 *
 * This is the bridge between the two halves of the picture. A shop's row in
 * the database may have no uploaded logo - every seeded row starts that way -
 * and matching it back to the artwork already in the bundle is what lets the
 * site, and the dashboard, show a real logo in the meantime.
 *
 * Matched on the name because that is the only thing the two sides share: the
 * bundle has no ids, and the database has no files until somebody uploads one.
 *
 * @param {string} name a shop's name, as the database holds it
 */
export function bundledLogo(name) {
  const shop = BY_NAME.get(String(name ?? '').toLowerCase());
  return shop ? displayLogo(shop) : null;
}
