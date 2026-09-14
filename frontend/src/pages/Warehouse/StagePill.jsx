// src/pages/Warehouse/StagePill.jsx
import styles from './Warehouse.module.css';

/** The coloured warehouse stage pill used on cards, lists and the board. */
export default function StagePill({ stage, label }) {
  return <span className={`${styles.stagePill} ${styles[`stage_${stage}`]}`}>{label}</span>;
}
