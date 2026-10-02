// src/components/Tutorial/TutorialHelpMenu.jsx
//
// The help options in the robot's panel (src/components/PageGuide), under the
// explanation of the current page, as a grid of tiles - two per row, an icon
// above the label. An odd one out at the end (Contact) takes the full row:
//
//   Tour this page            a short tour of the page being looked at
//                             (the general tour on the home page)
//   Shipping information      the tour, at the shipping step
//   How to order              the tutorial page (/tutorial)
//   How to track my package   the tour, at the Track & Trace step
//   Contact us                the contact page
//
// To add an option, add a line to OPTIONS: `pageTour` starts the current
// page's tour, `step` opens the general tour at the step with that id (see
// tutorialSteps.js), `to` goes to a page, `Icon` is one of
// the icons in src/components/Icons/icons.jsx. The label is
// onboarding.helpButton.<key> in translations.js.

import { useNavigate } from 'react-router-dom';
import {
  BookIcon,
  MailIcon,
  PinIcon,
  PlayIcon,
  ShipIcon,
} from '../Icons/icons';
import { useLanguage } from '../../i18n/useLanguage';
import { useTutorial } from './useTutorial';
import styles from './Tutorial.module.css';

const OPTIONS = [
  { key: 'pageTour', pageTour: true, Icon: PlayIcon },
  { key: 'shipping', step: 'shipping', Icon: ShipIcon },
  { key: 'howToOrder', to: '/tutorial', Icon: BookIcon },
  { key: 'track', step: 'track', Icon: PinIcon },
  { key: 'contact', to: '/contact', Icon: MailIcon },
];

/**
 * @param {object} props
 * @param {() => void} props.onChoose  called before acting on a choice, so
 *                                     the panel around it can close
 */
export default function TutorialHelpMenu({ onChoose }) {
  const { t } = useLanguage();
  const { start, startPageTour } = useTutorial();
  const navigate = useNavigate();

  function choose(option) {
    onChoose();
    if (option.pageTour) startPageTour();
    else if (option.step) start(option.step);
    else navigate(option.to);
  }

  return (
    // No visible heading: the panel's greeting ("How can I help?") already
    // introduces these. Screen readers get the name from aria-label.
    <nav className={styles.helpMenu} aria-label={t('onboarding.helpButton.menuLabel')}>
      <ul className={styles.helpMenuList}>
        {OPTIONS.map((option) => (
          <li key={option.key}>
            {/* One tile per option: the icon on a yellow disc, the label
                under it. The whole tile is the button. */}
            <button
              type="button"
              className={styles.helpMenuItem}
              onClick={() => choose(option)}
            >
              <span className={styles.helpMenuIcon}>
                <option.Icon size={20} />
              </span>
              <span>{t(`onboarding.helpButton.${option.key}`)}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
