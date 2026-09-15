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
import autodocLogo from '../images/autodoc-logo.png';
import bolLogo from '../images/Bol.com-image.webp';
import brunaLogo from '../images/Bruna.png';
import coolblueLogo from '../images/coolblue-image.jpg';
import daDrogistLogo from '../images/DA-Drogist-Logo.jpg';
import ikeaLogo from '../images/IKEA-Image.png';
import ritualsLogo from '../images/Rituals.png';
import top1ToysLogo from '../images/top1toys-2710135365.png';

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
 * To add a brand: put the logo in src/images/, import it at the top of this
 * module, and add it below. A brand with `logo: null` shows its name in type
 * instead, so the strip keeps its shape either way.
 */
export const BRANDS = [
  { name: 'Autodoc', logo: autodocLogo },
  { name: 'Bol.com', logo: bolLogo },
  { name: 'IKEA', logo: ikeaLogo },
  { name: 'Bruna', logo: brunaLogo },
  { name: 'Rituals', logo: ritualsLogo },
  { name: 'DA Drogist', logo: daDrogistLogo },
  { name: 'Top 1 Toys', logo: top1ToysLogo },
  { name: 'Coolblue', logo: coolblueLogo },
];
