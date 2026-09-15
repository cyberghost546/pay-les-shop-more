// src/pages/Home/ShopSlideshow.jsx
//
// The hero's right-hand side: the Dutch webshops customers order from, one at
// a time. Advances on its own every few seconds, with arrows and dots to
// choose a shop by hand.
//
// It stops advancing while the pointer or keyboard focus is on it - nobody
// wants a slide to change under the button they are about to press - and it
// never advances on its own for somebody who has asked the browser for less
// movement.

import { useEffect, useState } from 'react';
import { prefersReducedMotion } from '../../hooks/useInViewport';
import { useLanguage } from '../../i18n/useLanguage';
import autodoc from '../../images/autodoc-logo.png';
import bol from '../../images/Bol.com-image.webp';
import coolblue from '../../images/coolblue-image.jpg';
import ikea from '../../images/IKEA-Image.png';
import styles from './Home.module.css';

const SLIDE_MS = 4000;

// `fill` for a logo on a coloured background that can be cropped to the card,
// `fit` for a logo on white whose edges must not be cut.
const SHOPS = [
  { name: 'bol.com', src: bol, mode: 'fill' },
  { name: 'Coolblue', src: coolblue, mode: 'fill' },
  { name: 'IKEA', src: ikea, mode: 'fit' },
  { name: 'AUTODOC', src: autodoc, mode: 'fit' },
];

export default function ShopSlideshow() {
  const { t } = useLanguage();
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);

  const go = (index) => setCurrent((index + SHOPS.length) % SHOPS.length);

  useEffect(() => {
    if (paused || prefersReducedMotion()) return undefined;
    const timer = setTimeout(() => setCurrent((n) => (n + 1) % SHOPS.length), SLIDE_MS);
    return () => clearTimeout(timer);
    // `current` restarts the countdown after a manual choice, so a click is
    // never followed by an immediate jump to the next slide.
  }, [current, paused]);

  return (
    <section
      className={styles.visual}
      aria-roledescription="carousel"
      aria-label={t('home.hero.shops')}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <p className={styles.shopsCaption}>{t('home.hero.shops')}</p>

      <div className={styles.slides}>
        {SHOPS.map((shop, index) => (
          <div
            key={shop.name}
            className={`${styles.slide} ${index === current ? styles.slideCurrent : ''}`}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} / ${SHOPS.length}: ${shop.name}`}
            aria-hidden={index !== current}
          >
            <img
              src={shop.src}
              alt={shop.name}
              className={`${styles.slideLogo} ${styles[`slideLogo_${shop.mode}`]}`}
              // Decoded up front: with async decoding a hidden slide is only
              // prepared when it is shown, and the card flashes blank first.
              decoding="sync"
            />
          </div>
        ))}
      </div>

      <div className={styles.slideControls}>
        <button
          type="button"
          className={styles.slideArrow}
          onClick={() => go(current - 1)}
          aria-label="Previous"
        >
          ‹
        </button>

        <div className={styles.slideDots}>
          {SHOPS.map((shop, index) => (
            <button
              key={shop.name}
              type="button"
              className={`${styles.slideDot} ${index === current ? styles.slideDotCurrent : ''}`}
              onClick={() => go(index)}
              aria-label={shop.name}
              aria-current={index === current}
            />
          ))}
        </div>

        <button
          type="button"
          className={styles.slideArrow}
          onClick={() => go(current + 1)}
          aria-label="Next"
        >
          ›
        </button>
      </div>
    </section>
  );
}
