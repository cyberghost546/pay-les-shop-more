// src/data/destinations.js
//
// One entry per island the site ships to. The header dropdown, the
// /destinations index and the /destinations/:slug page all read from here, so
// adding an island is a single edit.

import aruba from '../images/Aruba-Centraal.jpeg';
import bonaire from '../images/Bonaire-centraal.webp';
import curacao from '../images/Curacao-centraal.png';
import sintMaarten from '../images/St.Maarten-centraal.webp';
import suriname from '../images/Suriname-centraal.jpeg';

export const DESTINATIONS = [
  { slug: 'aruba', nameKey: 'destinations.aruba', hero: aruba },
  { slug: 'bonaire', nameKey: 'destinations.bonaire', hero: bonaire },
  { slug: 'curacao', nameKey: 'destinations.curacao', hero: curacao },
  {
    slug: 'sint-maarten',
    nameKey: 'destinations.saintMartin',
    hero: sintMaarten,
  },
  { slug: 'suriname', nameKey: 'destinations.suriname', hero: suriname },
];

export function findDestination(slug) {
  return DESTINATIONS.find((item) => item.slug === slug);
}
