// src/components/Hero/Hero.jsx
import Slideshow from '../Slideshow/Slideshow';
import { containerShip } from '../../images/optimized/photos';
import styles from './Hero.module.css';

export default function Hero() {
  return (
    <div className={styles.hero}>
      <div className={styles.picture}>
        <img
          src={containerShip.src}
          srcSet={containerShip.srcSet}
          // The picture is roughly half the window on a desktop and the full
          // width of a phone. Without this the browser assumes 100vw and
          // sends a phone the 960 file for a 480-wide slot.
          sizes="(max-width: 900px) 100vw, 50vw"
          width={containerShip.width}
          height={containerShip.height}
          alt="Container ship loaded with freight in port"
          className={styles.pictureImage}
          // The one image on the site that must not be lazy: it is the first
          // thing above the fold, and deferring it is deferring the page.
          fetchPriority="high"
          decoding="async"
        />
      </div>

      <Slideshow />
    </div>
  );
}
