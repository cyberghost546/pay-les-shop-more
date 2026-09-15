// src/components/SpinningWheel/segments.js
//
// The wheel's segments. By default these are the shops in src/data/shops.js -
// edit the shops there, not here - but the wheel accepts any list through its
// `segments` prop.
//
// Each entry is a plain string (text only) or an object:
//
//   name   shown under the wheel when there is no image, and read out
//   image  a logo URL
//   fit    'cover' to crop a logo on a coloured background to the round badge;
//          otherwise the whole logo is fitted inside it

import { SHOPS } from '../../data/shops';

export const segments = SHOPS.map(({ name, logo, fit }) => ({ name, image: logo, fit }));

/** Every entry as `{ name, image?, fit? }`, whichever form it was written in. */
export function normaliseSegments(list) {
  return list.map((entry) => (typeof entry === 'string' ? { name: entry } : entry));
}
