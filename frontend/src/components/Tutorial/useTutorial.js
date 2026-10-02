// src/components/Tutorial/useTutorial.js
import { useContext } from 'react';
import { TutorialContext } from './context';

/**
 * The tour's state and controls, for any component under TutorialProvider.
 * Example: a "Show me around" button anywhere on the site could do
 *
 *   const { start } = useTutorial();
 *   <button onClick={() => start()}>Show me around</button>
 */
export function useTutorial() {
  const value = useContext(TutorialContext);
  if (!value) {
    throw new Error('useTutorial() must be used inside <TutorialProvider>.');
  }
  return value;
}
