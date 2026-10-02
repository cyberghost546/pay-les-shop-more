// src/components/Tutorial/storage.js
//
// Remembers, in this browser, that the visitor has been through the tour (or
// skipped it), so it does not open by itself again.
//
// Two localStorage entries:
//   plsm.tutorialCompleted  'true' once the tour was finished or skipped
//   plsm.tutorialVersion    which version of the tour that was
//
// The tour counts as done only when both match. So raising
// TUTORIAL_VERSION in tutorialSteps.js shows the new tour once to everyone,
// including people who saw the old one.
//
// TO SEE THE TOUR AGAIN WHILE TESTING: click the robot in the corner and
// choose "Start tutorial again", or run this in the browser console and
// reload:
//   localStorage.removeItem('plsm.tutorialCompleted')
//
// localStorage throws in private windows and when site data is blocked.
// Every call is wrapped. Then the flag is simply not saved: the tour opens
// once per visit (each fresh page load), never more than that - the
// provider also remembers, in memory, that it has already been shown.

import { TUTORIAL_VERSION } from './tutorialSteps';

export const COMPLETED_KEY = 'plsm.tutorialCompleted';
export const VERSION_KEY = 'plsm.tutorialVersion';

export function isTutorialDone() {
  try {
    return (
      window.localStorage.getItem(COMPLETED_KEY) === 'true' &&
      window.localStorage.getItem(VERSION_KEY) === String(TUTORIAL_VERSION)
    );
  } catch {
    return false;
  }
}

export function markTutorialDone() {
  try {
    window.localStorage.setItem(COMPLETED_KEY, 'true');
    window.localStorage.setItem(VERSION_KEY, String(TUTORIAL_VERSION));
  } catch {
    // Nothing to do; see the note at the top.
  }
}
