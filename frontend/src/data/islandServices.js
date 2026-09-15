// src/data/islandServices.js
//
// What is offered for each island, as the services page lists it.
//
// Shop and service names, so they are not translated: "Bol.com" is "Bol.com"
// in every language, and "BTW-vrij verzenden" is the name of the arrangement
// rather than a sentence about it.
//
// Bonaire and Curaçao are copied from the current paylessshopmore.com pages.
// The other three are the shared baseline every destination gets — worth
// checking against what the office actually offers there, since this is the
// list a customer decides on. One edit here changes the page.

import { DESTINATIONS } from './destinations';
import { SHOPS } from './shops';

// What every island has. Kept separate so adding a service everywhere is one
// line rather than five.
const EVERYWHERE = [
  'Autodoc',
  'Bol.com',
  'BTW-vrij verzenden',
  'Ikea',
  'Shop and ship',
];

const PER_ISLAND = {
  bonaire: EVERYWHERE,
  curacao: [
    'Autodoc',
    'Bol.com',
    'Bruna',
    'BTW-vrij verzenden',
    'DA-drogist',
    'Ikea',
    'Rituals',
    'Online shopping',
    'Top 1 Toys',
  ],
  aruba: EVERYWHERE,
  'sint-maarten': EVERYWHERE,
  suriname: EVERYWHERE,
};

/**
 * The islands, each with the services listed under it.
 *
 * Built from DESTINATIONS rather than repeating the islands here, so adding a
 * destination adds its panel to the services page with the baseline list, and
 * cannot leave a panel behind for an island that is no longer served.
 */
export const ISLAND_SERVICES = DESTINATIONS.map((destination) => ({
  ...destination,
  services: PER_ISLAND[destination.slug] ?? EVERYWHERE,
}));

/**
 * The logo strip: the same shops as the home page wheel, from ./shops.js.
 * Edit the shops there. A brand with no logo shows its name in type instead.
 */
export const BRANDS = SHOPS.map(({ name, logo }) => ({ name, logo: logo ?? null }));
