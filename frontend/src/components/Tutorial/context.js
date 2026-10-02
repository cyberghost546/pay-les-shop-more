// src/components/Tutorial/context.js
//
// The tour's shared state. Kept in its own file (not in TutorialProvider.jsx)
// so that file only exports a component, which hot reloading needs.
//
// What it holds - see TutorialProvider.jsx for how each one works:
//   isOpen, stepIndex, steps
//   tourId, isGeneralTour       which tour is showing
//   start(stepId?, tourId?)     open a tour, at the beginning or at a step
//   startPageTour()             open the tour of the page being looked at
//   next(), back()              move one step
//   close()                     close it (remembered for the general tour)

import { createContext } from 'react';

export const TutorialContext = createContext(null);
