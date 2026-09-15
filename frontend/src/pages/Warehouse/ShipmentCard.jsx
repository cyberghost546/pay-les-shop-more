// src/pages/Warehouse/ShipmentCard.jsx
//
// Everything about one shipment a worker needs after scanning it, and the
// three things they can do about it: move it to another stage, flag or clear
// a problem, and print its label.
//
// Shared by the scanner and the shipment page, so a box looks the same
// whichever way somebody got to it.

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  WAREHOUSE_STAGES,
  createIntakeSheet,
  reportShipmentProblem,
  resolveShipmentProblem,
  setWarehouseStage,
} from '../../api/staff';
import { errorMessage } from '../../api/warehouse';
import { Banner, StatusBadge } from '../Dashboard/ui';
import { formatDateTime, formatWeight } from '../Dashboard/format';
import { useLanguage } from '../../i18n/useLanguage';
import StagePill from './StagePill';
import { waitedFor } from './waited';
import styles from './Warehouse.module.css';

function Detail({ label, children }) {
  return (
    <div className={styles.detail}>
      <dt>{label}</dt>
      <dd>{children || '—'}</dd>
    </div>
  );
}

function dims(line) {
  const sides = [line.length_cm, line.width_cm, line.height_cm];
  return sides.every((side) => side !== null)
    ? `${sides.map((side) => Number(side)).join(' × ')} cm`
    : 'size not measured';
}

/**
 * @param {{ shipment: object, onChange: (shipment: object) => void }} props
 */
export default function ShipmentCard({ shipment, onChange }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState('');

  const { intake, invoice } = shipment;

  async function run(what, call) {
    setBusy(what);
    setError('');
    try {
      onChange(await call());
      return true;
    } catch (caught) {
      setError(errorMessage(caught, 'That could not be saved. Check the connection and try again.'));
      return false;
    } finally {
      setBusy('');
    }
  }

  async function submitProblem(event) {
    event.preventDefault();
    if (!note.trim()) return;
    if (await run('problem', () => reportShipmentProblem(shipment.id, note.trim()))) {
      setReporting(false);
      setNote('');
    }
  }

  async function startIntake() {
    setBusy('intake');
    setError('');
    try {
      const sheet = await createIntakeSheet({
        reference: shipment.tracking_number,
        package: shipment.id,
      });
      navigate(`/warehouse/intake?sheet=${sheet.id}`);
    } catch {
      setError('The intake sheet could not be started. Try again.');
      setBusy('');
    }
  }

  return (
    <article className={styles.shipment}>
      <header className={styles.shipmentHead}>
        <div>
          <p className={styles.shipmentKicker}>Tracking number</p>
          <h2 className={styles.shipmentNumber}>{shipment.tracking_number}</h2>
        </div>
        <div className={styles.shipmentBadges}>
          <StagePill stage={shipment.warehouse_stage} label={t(`dashboard.flow.stages.${shipment.warehouse_stage}`)} />
          {shipment.overdue && <StatusBadge tone="attention">Waiting too long</StatusBadge>}
        </div>
      </header>

      <p className={styles.shipmentSince}>
        In this stage for {waitedFor(shipment.warehouse_stage_at)} · customer status:{' '}
        {shipment.status_display}
      </p>

      <Banner tone="error">{error}</Banner>

      {shipment.has_problem && (
        <div className={styles.problem} role="alert">
          <strong>Problem:</strong> {shipment.problem_note}
          <span className={styles.problemMeta}>
            {shipment.problem_reported_by && `${shipment.problem_reported_by} · `}
            {formatDateTime(shipment.problem_reported_at)}
          </span>
          <button
            type="button"
            className={styles.problemResolve}
            disabled={busy === 'resolve'}
            onClick={() => run('resolve', () => resolveShipmentProblem(shipment.id))}
          >
            {busy === 'resolve' ? 'Clearing…' : 'Problem solved'}
          </button>
        </div>
      )}

      <dl className={styles.details}>
        <Detail label="Customer">
          {shipment.customer}
          {shipment.customer_phone && (
            <span className={styles.detailSub}>{shipment.customer_phone}</span>
          )}
        </Detail>
        <Detail label="Destination">
          {shipment.destination}
          {shipment.delivery_address_text && (
            <span className={styles.detailSub}>{shipment.delivery_address_text}</span>
          )}
        </Detail>
        <Detail label="Shipping method">
          {shipment.freight_display || intake?.freight_display}
        </Detail>
        <Detail label="Quantity">{intake?.colli ? `${intake.colli} colli` : ''}</Detail>
        <Detail label="Weight">
          {intake?.weight_kg ? formatWeight(intake.weight_kg) : formatWeight(shipment.weight_kg)}
          {intake?.weight_kg && shipment.weight_kg && (
            <span className={styles.detailSub}>
              Declared {formatWeight(shipment.weight_kg)}
            </span>
          )}
        </Detail>
        <Detail label="Invoice">
          {invoice && (
            <>
              {invoice.number}
              <span className={styles.detailSub}>{invoice.status_display}</span>
            </>
          )}
          {!invoice && 'No invoice yet'}
        </Detail>
      </dl>

      <section className={styles.products}>
        <h3 className={styles.productsTitle}>Products</h3>
        {shipment.description ? (
          <p className={styles.productsText}>{shipment.description}</p>
        ) : (
          <p className={styles.productsEmpty}>No description on the shipment.</p>
        )}
        {intake?.lines?.length > 0 && (
          <ul className={styles.lines}>
            {intake.lines.map((line, index) => (
              <li key={index}>
                <strong>{line.quantity} ×</strong> {line.packaging || 'item'} · {dims(line)}
                {line.weight_kg !== null && ` · ${Number(line.weight_kg)} kg each`}
                {line.note && <span className={styles.detailSub}>{line.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className={styles.productsTitle}>Move to</h3>
        <div className={styles.stageButtons}>
          {/* Only the stages this account may set; the server refuses the rest. */}
          {WAREHOUSE_STAGES.filter(
            (stage) =>
              stage.value === shipment.warehouse_stage ||
              (shipment.allowed_stages ?? []).includes(stage.value),
          ).map((stage) => {
            const current = stage.value === shipment.warehouse_stage;
            return (
              <button
                key={stage.value}
                type="button"
                aria-pressed={current}
                className={`${styles.stageButton} ${current ? styles.stageButtonCurrent : ''}`}
                disabled={current || Boolean(busy) || shipment.status === 'cancelled'}
                onClick={() => run(`stage-${stage.value}`, () => setWarehouseStage(shipment.id, stage.value))}
              >
                {busy === `stage-${stage.value}` ? t('dashboard.flow.common.saving') : t(`dashboard.flow.stages.${stage.value}`)}
              </button>
            );
          })}
        </div>
      </section>

      {reporting ? (
        <form className={styles.problemForm} onSubmit={submitProblem}>
          <label className={styles.profileField}>
            <span className={styles.productsTitle}>What is wrong?</span>
            <textarea
              className={styles.problemInput}
              value={note}
              maxLength={500}
              rows={3}
              placeholder="Box damaged, item missing, address label unreadable…"
              onChange={(event) => setNote(event.target.value)}
              autoFocus
            />
          </label>
          <div className={styles.cardActions}>
            <button type="submit" className={styles.dangerButton} disabled={busy === 'problem' || !note.trim()}>
              {busy === 'problem' ? 'Saving…' : 'Report problem'}
            </button>
            <button type="button" className={styles.plainButton} onClick={() => setReporting(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className={styles.cardActions}>
          <button type="button" className={styles.dangerButton} onClick={() => setReporting(true)}>
            {shipment.has_problem ? 'Change the problem' : 'Report a problem'}
          </button>
          <Link to={`/warehouse/shipments/${shipment.id}/label`} className={styles.plainButton}>
            Print label
          </Link>
          {intake ? (
            <Link to={`/warehouse/intake?sheet=${intake.id}`} className={styles.plainButton}>
              Intake sheet {intake.label}
            </Link>
          ) : (
            <button
              type="button"
              className={styles.plainButton}
              disabled={busy === 'intake'}
              onClick={startIntake}
            >
              {busy === 'intake' ? 'Starting…' : 'Start intake sheet'}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
