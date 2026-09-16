// src/data/islandServices.js
//
// What is offered for each island, as the services page lists it.
//
// Shop and service names, so they are not translated: "Bol.com" is "Bol.com"
// in every language, and "BTW-vrij verzenden" is the name of the arrangement
// rather than a sentence about it.
//
// Every island offers the same thing: the shops on the home page wheel, plus
// the two arrangements that are not shops. There is no per-island list any
// more — the panels used to differ because they were copied from the pages of
// the old site, which listed shops the wheel does not.

import { DESTINATIONS } from './destinations';
import { SHOPS } from './shops';

// Not shops, so they are not in ./shops.js and have no logo: these are the
// names of arrangements this site runs. No href, which is what marks them as
// ours — the services page links those to the island's own page, where the
// quote form for the arrangement lives.
const ARRANGEMENTS = [{ name: 'BTW-vrij verzenden' }, { name: 'Shop and ship' }];

/**
 * The one list every island shows, in the wheel's own order so the panel and
 * the wheel cannot disagree about which shops are offered. Adding a shop to
 * ./shops.js adds it to the wheel, the brands strip and all five panels.
 *
 * Each entry is `{ name, href }`. `href` is the shop's own site and absent on
 * an arrangement.
 */
const SERVICES = [
  ...SHOPS.map(({ name, href }) => ({ name, href })),
  ...ARRANGEMENTS,
];

/**
 * The islands, each with the services listed under it.
 *
 * Built from DESTINATIONS rather than repeating the islands here, so adding a
 * destination adds its panel to the services page, and cannot leave a panel
 * behind for an island that is no longer served.
 */
export const ISLAND_SERVICES = DESTINATIONS.map((destination) => ({
  ...destination,
  services: SERVICES,
}));

/**
 * The logo strip: the same shops as the home page wheel, from ./shops.js.
 * Edit the shops there. A brand with no logo shows its name in type instead.
 */
export const BRANDS = SHOPS.map(({ name, logo }) => ({ name, logo: logo ?? null }));
