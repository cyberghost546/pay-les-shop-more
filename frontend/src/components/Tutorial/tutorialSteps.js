// src/components/Tutorial/tutorialSteps.js
//
// THE TOURS. There are two kinds:
//
//   1. The general tour (`tutorialSteps` below): how shopping and shipping
//      works, start to finish. It opens by itself once for a new visitor, and
//      is the home page's own tour.
//   2. A short tour of every other page (`pageTours`, further down): what
//      that page is for and where its parts are. Started from the robot in
//      the corner, "Tour this page"; never opens by itself.
//
// To add, remove or reorder a step, edit the lists; nothing else needs
// rewriting. To give a new page a tour, add it to `pageTours` and to
// TOUR_ROUTES at the bottom.
//
// Each step has:
//
//   id      A unique name within its tour. Its texts are looked up in
//           translations.js: under onboarding.steps.<id> for the general
//           tour, under onboarding.pages.<tour>.<id> for a page tour. A
//           `title`, and optionally `text`, `points` (a list of bullet
//           lines) and `note` (a yellow warning line). Add those texts in
//           every language (nl, en, pap).
//
//   kind    Which extra content the step shows under its text, rendered by
//           TutorialStep.jsx:
//             'welcome'   the "About 2 minutes" badge
//             'text'      nothing extra (the default)
//             'address'   the warehouse address card with a copy button
//             'flow'      the store -> warehouse -> shipping -> you diagram
//             'shipping'  the sea and air freight cards
//             'help'      help topics, contact details and "You're all set!"
//           A new kind needs a new branch in TutorialStep.jsx.
//
//   target  What to highlight on the page, as a CSS selector, or a list of
//           selectors tried in order (the first one that is on the page AND
//           visible wins). null for no highlight. If nothing matches - the
//           element is on another page, hidden in the phone menu, or was
//           renamed - the step simply shows without a highlight. It never
//           crashes.
//
//           Use the data-tour="..." attributes for targets, not class names:
//           class names change when the styling changes, and CSS modules
//           rename them anyway. Current hooks:
//             [data-tour="signup"]   Header: "Sign up" (signed out)
//             [data-tour="login"]    Header: "Log in" (signed out)
//             [data-tour="booking"]  Header: the "Booking" link
//             [data-tour="account"]  Header: the customer's name (signed in)
//             [data-tour="menu"]     Header: the ☰ button (phones/tablets)
//             [data-tour="shops"]    Home page: the strip of shops
//             [data-tour="address"]  Tutorial page: the address card
//             [data-tour="help"]     The robot in the corner (help + guide)
//             #track, #tracking      Track & Trace (home when signed in,
//                                    and the account page)
//           The page tours use hooks named after their page, e.g.
//           [data-tour="services-offer"], set on that page's sections, and
//           the account page's own section ids (#details, #shipments, ...).

// Raise this number when the tour changes enough that everyone who has
// already seen it should see it once more. See storage.js.
export const TUTORIAL_VERSION = 1;

export const tutorialSteps = [
  {
    id: 'welcome',
    kind: 'welcome',
    target: null,
  },
  {
    id: 'account',
    kind: 'text',
    // Signed out: the "Sign up" button. Signed in: their name. On a phone
    // both are inside the menu, so the ☰ button is highlighted instead.
    target: ['[data-tour="signup"]', '[data-tour="account"]', '[data-tour="menu"]'],
  },
  {
    id: 'shop',
    kind: 'text',
    target: '[data-tour="shops"]',
  },
  {
    id: 'address',
    kind: 'address',
    // Only on the tutorial page; elsewhere the card in the tour is enough.
    target: '[data-tour="address"]',
  },
  {
    // After ordering: tell us a parcel is coming, and send the invoice.
    // Without this the warehouse does not know whose parcel it is.
    id: 'register',
    kind: 'text',
    // The "Booking" link in the header (the booking form); on a phone it is
    // inside the ☰ menu.
    target: ['[data-tour="booking"]', '[data-tour="menu"]'],
  },
  {
    id: 'warehouse',
    kind: 'flow',
    target: null,
  },
  {
    id: 'shipping',
    kind: 'shipping',
    target: null,
  },
  {
    id: 'track',
    kind: 'text',
    // The Track & Trace panel where there is one; otherwise the way into the
    // account, where it lives (on a phone, inside the ☰ menu).
    target: [
      '#track',
      '#tracking',
      '[data-tour="account"]',
      '[data-tour="login"]',
      '[data-tour="menu"]',
    ],
  },
  {
    id: 'help',
    kind: 'help',
    target: '[data-tour="help"]',
  },
];

// ---------------------------------------------------------------------------
// The page tours. Every step here is a plain 'text' step with a target; the
// texts live under onboarding.pages.<tour>.<step id> in translations.js.

export const pageTours = {
  services: [
    { id: 'intro', target: '[data-tour="services-intro"]' },
    { id: 'islands', target: '[data-tour="services-islands"]' },
    { id: 'offer', target: '[data-tour="services-offer"]' },
    { id: 'partners', target: '[data-tour="services-partners"]' },
    { id: 'contact', target: '[data-tour="services-contact"]' },
  ],
  booking: [
    { id: 'intro', target: '[data-tour="booking-intro"]' },
    { id: 'shipment', target: '[data-tour="booking-shipment"]' },
    { id: 'people', target: '[data-tour="booking-sender"]' },
    { id: 'consignment', target: '[data-tour="booking-consignment"]' },
    { id: 'terms', target: '[data-tour="booking-terms"]' },
  ],
  contact: [
    { id: 'methods', target: '[data-tour="contact-methods"]' },
    { id: 'form', target: '[data-tour="contact-form"]' },
  ],
  destinations: [
    { id: 'list', target: '[data-tour="destinations-list"]' },
  ],
  destination: [
    { id: 'facts', target: '[data-tour="destination-facts"]' },
    { id: 'how', target: '[data-tour="destination-how"]' },
    { id: 'faq', target: '[data-tour="destination-faq"]' },
    { id: 'quote', target: '[data-tour="quote-form"]' },
  ],
  profile: [
    { id: 'details', target: '#details' },
    { id: 'tracking', target: '#tracking' },
    { id: 'shipments', target: '#shipments' },
    { id: 'invoices', target: '#invoices' },
    { id: 'notifications', target: '#notifications' },
  ],
  login: [
    { id: 'form', target: '[data-tour="login-form"]' },
    { id: 'forgot', target: '[data-tour="login-forgot"]' },
    { id: 'signup', target: '[data-tour="login-signup"]' },
  ],
  signup: [
    { id: 'form', target: '[data-tour="signup-form"]' },
    { id: 'password', target: '[data-tour="signup-password"]' },
    { id: 'terms', target: '[data-tour="signup-terms"]' },
  ],
  tutorial: [
    { id: 'player', target: '[data-tour="tutorial-player"]' },
    { id: 'written', target: '[data-tour="tutorial-written"]' },
    { id: 'cta', target: '[data-tour="tutorial-cta"]' },
  ],
};

// Which tour belongs to which page. Checked in order, so a destination page
// matches before the index it sits under. Any page not listed here (the home
// page, 404, ...) gets the general tour.
const TOUR_ROUTES = [
  { match: (path) => path === '/services', tour: 'services' },
  { match: (path) => path === '/booking', tour: 'booking' },
  { match: (path) => path === '/contact', tour: 'contact' },
  { match: (path) => path.startsWith('/destinations/'), tour: 'destination' },
  { match: (path) => path === '/destinations', tour: 'destinations' },
  { match: (path) => path === '/profile', tour: 'profile' },
  { match: (path) => path === '/login', tour: 'login' },
  { match: (path) => path === '/signup', tour: 'signup' },
  { match: (path) => path === '/tutorial', tour: 'tutorial' },
];

/** The id of the general tour, for the places that ask for it by name. */
export const GENERAL_TOUR = 'general';

/** The tour for the page at this address: a page tour id, or GENERAL_TOUR. */
export function tourForPath(pathname) {
  return TOUR_ROUTES.find((route) => route.match(pathname))?.tour ?? GENERAL_TOUR;
}

/** The steps of a tour, by id. Unknown ids get the general tour. */
export function stepsOf(tourId) {
  return pageTours[tourId] ?? tutorialSteps;
}
