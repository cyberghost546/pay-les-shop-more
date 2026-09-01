// src/components/Hero/Hero.jsx
import Slideshow from '../Slideshow/Slideshow';
import containerShip from '../../images/container-ship.webp';
import styles from './Hero.module.css';

export default function Hero() {
  return (
    <div className={styles.hero}>
      <div className={styles.picture}>
        <img
          src={containerShip}
          alt="Container ship loaded with freight in port"
          className={styles.pictureImage}
        />
      </div>

      <Slideshow />
    </div>
  );
}
