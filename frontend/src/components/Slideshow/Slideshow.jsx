// src/components/Slideshow/Slideshow.jsx
import { useEffect, useState } from 'react';
import styles from './Slideshow.module.css';
import aruba from '../../images/Flag_of_Aruba.svg';
import bonaire from '../../images/Flag_of_Bonaire.svg';
import curacao from '../../images/Flag_of_Curacao.webp';
import saba from '../../images/Flag_of_Saba.svg';
import sintEustatius from '../../images/Sint-Eustatius-vlag.png';
import sintMaarten from '../../images/Sint-Maarten-vlag.png';
import suriname from '../../images/Flag_of_Suriname.svg';
import dominicanRepublic from '../../images/Flag_of_the_Dominican_Republic.svg';

const SLIDES = [
  { id: 'aruba', image: aruba, caption: 'Aruba' },
  { id: 'bonaire', image: bonaire, caption: 'Bonaire' },
  { id: 'curacao', image: curacao, caption: 'Curaçao' },
  { id: 'saba', image: saba, caption: 'Saba' },
  { id: 'sint-eustatius', image: sintEustatius, caption: 'Sint Eustatius' },
  { id: 'sint-maarten', image: sintMaarten, caption: 'Sint Maarten' },
  { id: 'suriname', image: suriname, caption: 'Suriname' },
  { id: 'dominican-republic', image: dominicanRepublic, caption: 'Dominican Republic' },
];

const INTERVAL_MS = 2000;

export default function Slideshow() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // bumped on every click so the autoplay timer restarts from zero
  const [restart, setRestart] = useState(0);

  useEffect(() => {
    if (paused) return;

    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % SLIDES.length);
    }, INTERVAL_MS);

    return () => clearInterval(timer);
  }, [paused, restart]);

  // step by +1 or -1, wrapping around at either end
  function move(step) {
    setIndex((current) => (current + step + SLIDES.length) % SLIDES.length);
    setRestart((n) => n + 1);
  }

  return (
    <section
      className={styles.slideshow}
      aria-roledescription="carousel"
      aria-label="Featured deals"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className={styles.stage}>
        <div className={styles.viewport}>
          <ul
            className={styles.track}
            style={{ transform: `translateX(-${index * 100}%)` }}
          >
            {SLIDES.map((slide, i) => (
              <li
                key={slide.id}
                className={styles.slide}
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${SLIDES.length}`}
                aria-hidden={i !== index}
              >
                <img src={slide.image} alt={`Flag of ${slide.caption}`} className={styles.image} />
                <p className={styles.caption}>{slide.caption}</p>
              </li>
            ))}
          </ul>
        </div>

        <button
          type="button"
          className={`${styles.arrow} ${styles.prev}`}
          onClick={() => move(-1)}
          aria-label="Previous flag"
        >
          &#8249;
        </button>
        <button
          type="button"
          className={`${styles.arrow} ${styles.next}`}
          onClick={() => move(1)}
          aria-label="Next flag"
        >
          &#8250;
        </button>
      </div>

      <p className={styles.shipNote}>
        We ship to all of these places.
      </p>
    </section>
  );
}
