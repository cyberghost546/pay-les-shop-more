// src/data/destinations.js
//
// One entry per island the site ships to. The header dropdown, the
// /destinations index, the /destinations/:slug page, the services page and the
// homepage route map all read from here, so adding an island is a single edit.
//
// `transitDays` and `port` describe the real service and are shown to
// customers, so they are worth keeping accurate. `mapX`/`mapY` are positions
// in the homepage map's 900×470 drawing — a schematic, not real coordinates.

import aruba from '../images/Aruba-Centraal.jpeg';
import bonaire from '../images/Bonaire-centraal.webp';
import curacao from '../images/Curacao-centraal.png';
import sintMaarten from '../images/St.Maarten-centraal.webp';
import suriname from '../images/Suriname-centraal.jpeg';

export const DESTINATIONS = [
  {
    slug: 'aruba',
    nameKey: 'destinations.aruba',
    hero: aruba,
    port: 'Oranjestad',
    transitDays: 21,
    mapX: 208,
    mapY: 292,
  },
  {
    slug: 'bonaire',
    nameKey: 'destinations.bonaire',
    hero: bonaire,
    port: 'Kralendijk',
    transitDays: 24,
    mapX: 258,
    mapY: 318,
  },
  {
    slug: 'curacao',
    nameKey: 'destinations.curacao',
    hero: curacao,
    port: 'Willemstad',
    transitDays: 21,
    mapX: 232,
    mapY: 300,
  },
  {
    slug: 'sint-maarten',
    nameKey: 'destinations.saintMartin',
    hero: sintMaarten,
    port: 'Philipsburg',
    transitDays: 18,
    mapX: 268,
    mapY: 268,
  },
  {
    slug: 'suriname',
    nameKey: 'destinations.suriname',
    hero: suriname,
    port: 'Paramaribo',
    transitDays: 28,
    mapX: 300,
    mapY: 348,
  },
];

export function findDestination(slug) {
  return DESTINATIONS.find((item) => item.slug === slug);
}
