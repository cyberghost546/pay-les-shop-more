// src/data/otherDestinations.js
//
// Everywhere else we ship, beyond the five islands that have pages of their
// own. One flat list, rendered in three columns and read down each column in
// turn, the way an alphabetical list is meant to be read.
//
// Two names per country rather than one, because half of them differ between
// the languages the site is written in: Brazilië and Brazil, Kaaimaneilanden
// and Cayman Islands. Papiamentu falls back to the Dutch name — several are
// identical, and inventing the rest would be worse than showing a name a
// reader in Curaçao already recognises.
//
// Sorted on the Dutch name, which is the order the page shows.

export const OTHER_DESTINATIONS = [
  { nl: 'Anguilla', en: 'Anguilla' },
  { nl: 'Antigua', en: 'Antigua' },
  { nl: 'Argentinië', en: 'Argentina' },
  { nl: "Bahama's", en: 'Bahamas' },
  { nl: 'Barbados', en: 'Barbados' },
  { nl: 'Belize', en: 'Belize' },
  { nl: 'Bolivia', en: 'Bolivia' },
  { nl: 'Brazilië', en: 'Brazil' },
  { nl: 'Britse Maagdeneilanden', en: 'British Virgin Islands' },
  { nl: 'Kaaimaneilanden', en: 'Cayman Islands' },
  { nl: 'Chili', en: 'Chile' },
  { nl: 'Colombia', en: 'Colombia' },
  { nl: 'Costa Rica', en: 'Costa Rica' },
  { nl: 'Dominicaanse Republiek', en: 'Dominican Republic' },
  { nl: 'Ecuador', en: 'Ecuador' },
  { nl: 'El Salvador', en: 'El Salvador' },
  { nl: 'Grenada', en: 'Grenada' },
  { nl: 'Guadeloupe', en: 'Guadeloupe' },
  { nl: 'Guatemala', en: 'Guatemala' },
  { nl: 'Guyana', en: 'Guyana' },
  { nl: 'Haïti', en: 'Haiti' },
  { nl: 'Honduras', en: 'Honduras' },
  { nl: 'Jamaica', en: 'Jamaica' },
  { nl: 'Martinique', en: 'Martinique' },
  { nl: 'Mexico', en: 'Mexico' },
  { nl: 'Montserrat', en: 'Montserrat' },
  { nl: 'Nicaragua', en: 'Nicaragua' },
  { nl: 'Panama', en: 'Panama' },
  { nl: 'Paraguay', en: 'Paraguay' },
  { nl: 'Peru', en: 'Peru' },
  { nl: 'Puerto Rico', en: 'Puerto Rico' },
  { nl: 'St. Kitts & Nevis', en: 'St Kitts & Nevis' },
  { nl: 'St. Lucia', en: 'St Lucia' },
  { nl: 'St. Vincent', en: 'St Vincent' },
  { nl: 'Trinidad en Tobago', en: 'Trinidad and Tobago' },
  { nl: 'Turks- & Caicoseilanden', en: 'Turks & Caicos Islands' },
  { nl: 'Uruguay', en: 'Uruguay' },
  { nl: 'Venezuela', en: 'Venezuela' },
];

/**
 * The list in the reader's language, in alphabetical order for that language.
 *
 * Sorted here rather than kept in two hand-ordered lists: "Kaaimaneilanden"
 * and "Cayman Islands" belong in different places, and a list that claims to
 * be alphabetical and is not is harder to read than an unsorted one.
 *
 * @param {string} language 'nl', 'en' or 'pap'
 */
export function destinationNames(language) {
  const key = language === 'en' ? 'en' : 'nl';

  return OTHER_DESTINATIONS.map((country) => country[key]).sort((a, b) =>
    // localeCompare, so ë and ï sort where a reader expects them rather than
    // after z, which is where their code points would put them.
    a.localeCompare(b, key === 'en' ? 'en' : 'nl'),
  );
}

/**
 * Splits the list into columns that are read downwards.
 *
 * The page shows three columns, and the alphabet runs down the first before
 * it starts the second. Filling across instead would put B next to C next to
 * D on one line, which is not how anybody scans a list for one name.
 *
 * Kept out of the component because it is the part with an off-by-one in it:
 * 38 names in three columns is 13, 13, 12, not 12, 12, 14.
 */
export function inColumns(names, count = 3) {
  const perColumn = Math.ceil(names.length / count);

  return Array.from({ length: count }, (_, index) =>
    names.slice(index * perColumn, (index + 1) * perColumn),
  ).filter((column) => column.length > 0);
}
