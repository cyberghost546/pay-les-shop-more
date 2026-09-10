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
 * The logo strip.
 *
 * `logo` is null for every one of them: these are other companies' marks and
 * none of the files are in this repository. Until one is added the box shows
 * the name set in type, which is why the strip has its shape either way.
 *
 * To add a real logo: put the file in src/images/brands/, import it at the
 * top of this module, and set it as `logo` below.
 */
export const BRANDS = [
  { name: 'Autodoc', logo: null },
  { name: 'Bol.com', logo: null },
  { name: 'IKEA', logo: null },
  { name: 'Bruna', logo: null },
  { name: 'Rituals', logo: null },
  { name: 'DA Drogist', logo: null },
  { name: 'Top 1 Toys', logo: null },
  { name: 'Coolblue', logo: null },
];
