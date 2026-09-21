// src/pages/Tutorial/Tutorial.jsx
//
// A guided walkthrough of the site: one step at a time, narrated by the robot
// assistant, in whichever of the three site languages is active.
//
// Two audiences are served by the same page. Someone who wants to be walked
// through it uses the player at the top — next, back, and a listen button that
// reads the step out loud. Someone who would rather skim reads the written
// version underneath, where every step is on the page at once, in order, and
// prints or translates like ordinary text. The player is a view of that same
// copy, not a second copy of it: both come from one dictionary.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import RobotGuide from '../../components/RobotGuide/RobotGuide';
import { useLanguage } from '../../i18n/useLanguage';
import { usePageMeta } from '../../hooks/usePageMeta';
import { useSpeech } from '../../hooks/useSpeech';
import styles from './Tutorial.module.css';

// The warehouse address goes on the visitor's order at the shop. It is not
// translated — an address is typed into a form exactly as it stands — and it
// is the one thing on this page that must never drift, so it lives here once
// and both the step and the copy card below read from it.
const PICKUP = {
  lastName: 'Pay less Shop More',
  street: 'Hertzstraat 10',
  city: '2652 XX Berkel en Rodenrijs',
};

// `to` puts a button under the step that goes where the step is talking about.
// Everything a visitor reads comes from tutorial.steps.<id> in the dictionary.
const STEPS = [
  { id: 'account', to: '/signup' },
  { id: 'quote', to: '/booking' },
  { id: 'order', to: '/services' },
  { id: 'invoice', address: true },
  { id: 'announce', to: '/booking' },
  { id: 'warehouse' },
  { id: 'track', to: '/tracking' },
  { id: 'delivery', to: '/destinations' },
];

/** A dictionary value that should be a list, whatever the dictionary holds. */
function asList(value) {
  return Array.isArray(value) ? value : [];
}

export default function Tutorial() {
  const { t, language } = useLanguage();
  const { supported, speaking, speak, stop } = useSpeech(language);
  const [index, setIndex] = useState(0);
  // Off until asked for. A page that starts talking on its own is the kind of
  // thing people close the tab over.
  const [narrating, setNarrating] = useState(false);

  usePageMeta(t('tutorial.title'), t('tutorial.lead'), '/tutorial');

  const step = STEPS[index];
  const isFirst = index === 0;
  const isLast = index === STEPS.length - 1;

  const title = t(`tutorial.steps.${step.id}.title`);
  const body = t(`tutorial.steps.${step.id}.body`);
  const bullets = asList(t(`tutorial.steps.${step.id}.bullets`));
  const note = t(`tutorial.steps.${step.id}.note`);
  const hasNote = note !== `tutorial.steps.${step.id}.note`;

  // What the voice reads: the step exactly as it is written on the page, with
  // the address spelled out where the step shows it as a card.
  const spoken = useMemo(() => {
    const parts = [title, body, ...bullets];
    if (step.address) {
      parts.push(
        `${t('tutorial.address.lastName')}: ${PICKUP.lastName}.`,
        `${t('tutorial.address.street')}: ${PICKUP.street}, ${PICKUP.city}.`,
      );
    }
    if (hasNote) parts.push(note);
    return parts.join('. ').replace(/\.\./g, '.');
  }, [title, body, bullets, note, hasNote, step.address, t]);

  // Narration follows the step: turning it on speaks the step showing now, and
  // moving on interrupts and reads the new one. Language changes re-read too,
  // because `spoken` changes with the dictionary.
  useEffect(() => {
    if (!narrating || !supported) return undefined;
    speak(spoken);
    return stop;
  }, [narrating, supported, spoken, speak, stop]);

  const go = useCallback((next) => {
    setIndex(Math.min(Math.max(next, 0), STEPS.length - 1));
  }, []);

  // Left and right arrows work the player, as they do in any slideshow.
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, STEPS.length - 1));
      if (event.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  function toggleNarration() {
    setNarrating((on) => {
      if (on) stop();
      return !on;
    });
  }

  const addressCard = (
    <dl className={styles.address}>
      <div className={styles.addressRow}>
        <dt>{t('tutorial.address.firstName')}</dt>
        <dd>{t('tutorial.address.firstNameValue')}</dd>
      </div>
      <div className={styles.addressRow}>
        <dt>{t('tutorial.address.lastName')}</dt>
        <dd>{PICKUP.lastName}</dd>
      </div>
      <div className={styles.addressRow}>
        <dt>{t('tutorial.address.street')}</dt>
        <dd>
          {PICKUP.street}
          <br />
          {PICKUP.city}
        </dd>
      </div>
    </dl>
  );

  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroText}>
            <p className={styles.eyebrow}>{t('tutorial.eyebrow')}</p>
            <h1 className={styles.title}>{t('tutorial.title')}</h1>
            <p className={styles.lead}>{t('tutorial.lead')}</p>
          </div>

          <div className={styles.robotWrap}>
            <RobotGuide
              className={styles.robot}
              speaking={speaking}
              waving={isFirst}
            />
          </div>
        </div>
      </section>

      {/* The player. aria-live so that stepping through it is announced to a
          screen reader, which otherwise sees the page silently rewrite itself. */}
      <section className={styles.player} aria-label={t('tutorial.playerLabel')}>
        <div className={styles.playerInner}>
          <div className={styles.stage}>
            <RobotGuide
              className={styles.stageRobot}
              speaking={speaking}
              waving={isFirst}
            />

            <div className={styles.bubble} aria-live="polite">
              <p className={styles.counter}>
                {t('tutorial.stepWord')} {index + 1} / {STEPS.length}
              </p>
              <h2 className={styles.stepTitle}>{title}</h2>
              <p className={styles.stepBody}>{body}</p>

              {bullets.length > 0 && (
                <ul className={styles.bullets}>
                  {bullets.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}

              {step.address && addressCard}

              {hasNote && <p className={styles.note}>{note}</p>}

              {step.to && (
                <Link to={step.to} className={styles.stepLink}>
                  {t(`tutorial.steps.${step.id}.action`)}
                </Link>
              )}
            </div>
          </div>

          <div className={styles.controls}>
            <button
              type="button"
              className={styles.button}
              onClick={() => go(index - 1)}
              disabled={isFirst}
            >
              {t('tutorial.previous')}
            </button>

            <button
              type="button"
              className={`${styles.button} ${styles.primary}`}
              onClick={() => go(index + 1)}
              disabled={isLast}
            >
              {t('tutorial.next')}
            </button>

            {/* Hidden rather than disabled where the browser has no voice:
                a button that can never do anything is worse than no button. */}
            {supported && (
              <button
                type="button"
                className={`${styles.button} ${narrating ? styles.listening : ''}`}
                onClick={toggleNarration}
                aria-pressed={narrating}
              >
                <span className={styles.speaker} aria-hidden="true">
                  {narrating ? '🔊' : '🔈'}
                </span>
                {narrating ? t('tutorial.stopVoice') : t('tutorial.playVoice')}
              </button>
            )}

            <button
              type="button"
              className={styles.button}
              onClick={() => {
                stop();
                setNarrating(false);
                go(0);
              }}
              disabled={isFirst && !narrating}
            >
              {t('tutorial.restart')}
            </button>
          </div>

          {/* Dots double as a jump: eight steps is few enough to pick from. */}
          <ol className={styles.dots}>
            {STEPS.map((item, dot) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={dot === index ? `${styles.dot} ${styles.dotActive}` : styles.dot}
                  aria-current={dot === index ? 'step' : undefined}
                  aria-label={`${t('tutorial.stepWord')} ${dot + 1}: ${t(
                    `tutorial.steps.${item.id}.title`,
                  )}`}
                  onClick={() => go(dot)}
                />
              </li>
            ))}
          </ol>

          {!supported && (
            <p className={styles.voiceNote}>{t('tutorial.voiceUnavailable')}</p>
          )}
        </div>
      </section>

      {/* The written version. Everything at once, for reading rather than
          being walked through. */}
      <section className={styles.written}>
        <h2 className={styles.writtenTitle}>{t('tutorial.writtenTitle')}</h2>
        <p className={styles.writtenLead}>{t('tutorial.writtenLead')}</p>

        <ol className={styles.writtenList}>
          {STEPS.map((item, number) => {
            const itemBullets = asList(t(`tutorial.steps.${item.id}.bullets`));
            const itemNote = t(`tutorial.steps.${item.id}.note`);
            const itemHasNote = itemNote !== `tutorial.steps.${item.id}.note`;

            return (
              <li key={item.id} className={styles.writtenItem}>
                <span className={styles.number} aria-hidden="true">
                  {number + 1}
                </span>
                <div>
                  <h3 className={styles.writtenStepTitle}>
                    {t(`tutorial.steps.${item.id}.title`)}
                  </h3>
                  <p className={styles.writtenBody}>
                    {t(`tutorial.steps.${item.id}.body`)}
                  </p>

                  {itemBullets.length > 0 && (
                    <ul className={styles.bullets}>
                      {itemBullets.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  )}

                  {item.address && addressCard}
                  {itemHasNote && <p className={styles.note}>{itemNote}</p>}

                  {item.to && (
                    <Link to={item.to} className={styles.writtenLink}>
                      {t(`tutorial.steps.${item.id}.action`)}
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        <div className={styles.cta}>
          <h2 className={styles.ctaTitle}>{t('tutorial.ctaTitle')}</h2>
          <p className={styles.ctaBody}>{t('tutorial.ctaBody')}</p>
          <div className={styles.ctaActions}>
            <Link to="/booking" className={styles.ctaPrimary}>
              {t('tutorial.ctaPrimary')}
            </Link>
            <Link to="/contact" className={styles.ctaSecondary}>
              {t('tutorial.ctaSecondary')}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
