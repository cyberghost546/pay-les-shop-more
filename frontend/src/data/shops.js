// src/data/shops.js
//
// The shops customers order from, in one list. The spinning wheel on the home
// page and the "Our brands" strip on the services page both read it, so they
// always show the same shops. Edit here, and nowhere else.
//
//   name   shown under the wheel and as the logo's alt text
//   logo   a small WebP from src/images/optimized/logos - made from the
//          original in src/images by `npm run logos`
//   fit    'cover' for a logo on a coloured background that may be cropped to
//          the wheel's round badge; leave it out for a logo on white
//   href   the shop's own site, linked from the services page. The Dutch
//          storefront in each case: this is a forwarding service for parcels
//          bought in the Netherlands, so a customer sent to the .com would
//          land on a shop that will not deliver to the warehouse.
//
// To add a shop: put its logo in src/images, add it to LOGOS in
// scripts/optimize-logos.js, run `npm run logos`, then add a line below.

import action from '../images/optimized/logos/action.webp';
import autodoc from '../images/optimized/logos/autodoc.webp';
import bol from '../images/optimized/logos/bol.webp';
import coolblue from '../images/optimized/logos/coolblue.webp';
import hm from '../images/optimized/logos/hm.webp';
import ikea from '../images/optimized/logos/ikea.webp';
import mediamarkt from '../images/optimized/logos/mediamarkt.webp';
import zalando from '../images/optimized/logos/zalando.webp';

export const SHOPS = [
  { name: 'IKEA', logo: ikea, href: 'https://www.ikea.com/nl/nl/' },
  {
    name: 'Bol.com',
    logo: bol,
    fit: 'cover',
    // /nl/ redirects here, so link the destination and skip the hop.
    href: 'https://www.bol.com/nl/nl/',
  },
  { name: 'AutoDoc', logo: autodoc, href: 'https://www.autodoc.nl/' },
  {
    name: 'Coolblue',
    logo: coolblue,
    fit: 'cover',
    href: 'https://www.coolblue.nl/',
  },
  { name: 'H&M', logo: hm, href: 'https://www2.hm.com/nl_nl/index.html' },
  { name: 'MediaMarkt', logo: mediamarkt, href: 'https://www.mediamarkt.nl/' },
  { name: 'Action', logo: action, href: 'https://www.action.com/nl-nl/' },
  { name: 'Zalando', logo: zalando, href: 'https://www.zalando.nl/' },
];
