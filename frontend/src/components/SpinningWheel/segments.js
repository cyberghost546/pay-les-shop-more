// src/components/SpinningWheel/segments.js
//
// The wheel's shops, in the order the wheel moves through them. Edit this
// array and nothing else; the wheel adapts to however many entries it has.
//
// Each entry is a plain string (text only) or an object:
//
//   name   shown under the wheel, and on the slice when there is no image
//   image  the logo, imported from src/images
//   fit    'cover' for a logo on a coloured background that may be cropped to
//          the round badge; 'contain' (the default) for a logo on white whose
//          edges must not be cut; 'full' for a wide logo whose image already
//          has white space around it - fitted whole, with no extra margin
//   href   not used yet - the wheel is not clickable

import actionLogo from '../../images/action-logo.png';
import autodocLogo from '../../images/autodoc-logo.png';
import bolLogo from '../../images/Bol.com-image.webp';
import coolblueLogo from '../../images/coolblue-image.jpg';
import hmLogo from '../../images/H&M logo.jpg';
import ikeaLogo from '../../images/IKEA-Image.png';
import mediaMarktLogo from '../../images/MediaMarkt.png';
import zalandoLogo from '../../images/Zalando.png';

export const segments = [
  { name: 'Ikea', image: ikeaLogo },
  { name: 'Bol.com', image: bolLogo, fit: 'cover' },
  { name: 'AutoDoc', image: autodocLogo },
  { name: 'Coolblue', image: coolblueLogo, fit: 'cover' },
  // Small logo in the middle of a wide white image: cover crops the white
  // away and shows the logo large, without cutting into it.
  { name: 'H&M', image: hmLogo, fit: 'cover' },
  { name: 'MediaMarkt', image: mediaMarktLogo, fit: 'full' },
  { name: 'Action', image: actionLogo, fit: 'full' },
  { name: 'Zalando', image: zalandoLogo, fit: 'full' },
];

/** Every entry as `{ name, image?, fit?, href? }`, whichever form it was written in. */
export function normaliseSegments(list) {
  return list.map((entry) => (typeof entry === 'string' ? { name: entry } : entry));
}
