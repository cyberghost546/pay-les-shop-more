// src/pages/Warehouse/PackagePage.jsx
//
// One package, worked through from top to bottom:
//
//   Verify → Measure → Packaging → Mark Packaged → Mark Ready → Next Package
//
// The step shown is worked out from where the package already is, so a box
// scanned halfway through its process picks up where it was left. Every
// completed action says so in a big green line and offers Next Package, which
// goes straight back to the scanner.
//
// Underneath: damage reporting, the rack location, the package's timeline,
// and the full shipment card for corrections.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getWarehouseShipment } from '../../api/staff';
import { errorMessage, getPackageTimeline, moveStage, setLocation } from '../../api/warehouse';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import Loading from '../../components/Loading/Loading';
import { fill } from '../../i18n/fill';
import { useLanguage } from '../../i18n/useLanguage';
import DamageForm from './DamageForm';
import MeasurementForm from './MeasurementForm';
import { Message, Timeline } from './opsUi';
import PackagingForm from './PackagingForm';
import ShipmentCard from './ShipmentCard';
import styles from './Ops.module.css';

const LEFT = ['in_transit', 'arrived', 'delivered', 'cancelled'];
const PACKED_OR_LATER = ['packed', 'ready', 'shipped'];
const STEP_KEYS = ['verify', 'measure', 'packaging', 'packaged', 'ready'];
const P = 'dashboard.flow.package.';

/** Which step a package in this stage is on. */
function stepFor(stage) {
  if (['awaiting_pickup', 'received', 'awaiting_measurement'].includes(stage)) return 'verify';
  if (['measured', 'awaiting_packaging'].includes(stage)) return 'packaging';
  if (stage === 'packed') return 'ready';
  return 'done';
}

function Steps({ shipment, step }) {
  const { t } = useLanguage();
  const stage = shipment.warehouse_stage;
  const done = [
    step !== 'verify',
    Boolean(shipment.measurement),
    PACKED_OR_LATER.includes(stage),
    PACKED_OR_LATER.includes(stage),
    ['ready', 'shipped'].includes(stage),
  ];
  const current = { verify: 0, measure: 1, packaging: 2, ready: 4 }[step] ?? -1;

  return (
    <ol className={styles.steps} aria-label={t(`${P}progress`)}>
      {STEP_KEYS.map((key, index) => {
        const className = [
          styles.step,
          done[index] && index !== current ? styles.stepDone : '',
          index === current ? styles.stepCurrent : '',
        ].join(' ');
        return (
          <li key={key} className={className} aria-current={index === current ? 'step' : undefined}>
            <span className={styles.stepDot}>{done[index] && index !== current ? '✓' : index + 1}</span>
            <span>{t(`${P}steps.${key}`)}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Fact({ label, children, big }) {
  return (
    <div className={`${styles.fact} ${big ? styles.factBig : ''}`}>
      <dt>{label}</dt>
      <dd>{children || '—'}</dd>
    </div>
  );
}

function LocationForm({ shipment, onSaved }) {
  const { t } = useLanguage();
  const [value, setValue] = useState(shipment.warehouse_location ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const changed = value.trim().toUpperCase() !== (shipment.warehouse_location ?? '');

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const location = value.trim().toUpperCase() || t(`${P}noLocation`);
      onSaved(await setLocation(shipment.id, value), fill(t(`${P}locationSet`), { location }));
    } catch (caught) {
      setError(errorMessage(caught, undefined, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={`${styles.fields} ${styles.alignEnd}`}>
      <label className={styles.field}>
        <span className={styles.label}>{t(`${P}location`)}</span>
        <input
          className={styles.input}
          value={value}
          maxLength={40}
          placeholder={t(`${P}locationPlaceholder`)}
          autoCapitalize="characters"
          autoComplete="off"
          onChange={(event) => setValue(event.target.value)}
        />
        {error && <span className={styles.fieldError}>{error}</span>}
      </label>
      <button type="submit" className={styles.secondary} disabled={busy || !changed}>
        {busy ? t('dashboard.flow.common.saving') : t(`${P}saveLocation`)}
      </button>
    </form>
  );
}

export default function PackagePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState({ key: null, status: 'loading' });
  const [shipment, setShipment] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [step, setStep] = useState('verify');
  const [flash, setFlash] = useState({ tone: '', text: '' });
  const [worked, setWorked] = useState(false);
  const [busy, setBusy] = useState('');
  const [reportingDamage, setReportingDamage] = useState(false);
  const topRef = useRef(null);
  const key = `${id}#${attempt}`;

  useEffect(() => {
    let cancelled = false;
    Promise.all([getWarehouseShipment(id), getPackageTimeline(id)])
      .then(([data, entries]) => {
        if (cancelled) return;
        setShipment(data);
        setTimeline(entries);
        setStep(stepFor(data.warehouse_stage));
        setLoad({ key, status: 'ready' });
      })
      .catch((error) => {
        if (!cancelled) setLoad({ key, status: error?.status === 404 ? 'missing' : 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [id, key]);

  const refreshTimeline = useCallback(() => {
    getPackageTimeline(id)
      .then(setTimeline)
      .catch(() => {});
  }, [id]);

  /** Every completed action ends here: new data, a green line, Next Package. */
  function completed(data, text, nextStep) {
    setShipment(data);
    setFlash({ tone: 'success', text });
    setWorked(true);
    if (nextStep) setStep(nextStep);
    refreshTimeline();
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function failed(error, fallback) {
    setFlash({ tone: 'error', text: errorMessage(error, fallback, t) });
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function move(stage, text, nextStep) {
    setBusy(stage);
    setFlash({ tone: '', text: '' });
    try {
      completed(await moveStage(shipment.id, stage), text, nextStep);
    } catch (error) {
      failed(error, t(`${P}moveError`));
    } finally {
      setBusy('');
    }
  }

  async function confirmPackage() {
    // An expected package being held is a package received.
    if (shipment.warehouse_stage === 'awaiting_pickup' && shipment.allowed_stages.includes('received')) {
      await move('received', t(`${P}received`), 'measure');
      return;
    }
    setFlash({ tone: '', text: '' });
    setStep('measure');
  }

  const nextPackage = () => navigate('/warehouse/scan');
  const state = load.key === key ? load.status : 'loading';
  const saving = t('dashboard.flow.common.saving');

  if (state === 'loading') return <Loading inline />;
  if (state === 'error') return <ConnectionError inline onRetry={() => setAttempt((n) => n + 1)} />;
  if (state === 'missing') {
    return (
      <div className={styles.page}>
        <Message tone="error">{t(`${P}missing`)}</Message>
        <button type="button" className={`${styles.primary} ${styles.wide}`} onClick={nextPackage}>
          {t(`${P}scanAnother`)}
        </button>
      </div>
    );
  }

  const hasLeft = LEFT.includes(shipment.status);
  const canMove = (stage) => shipment.allowed_stages.includes(stage);

  return (
    <div className={styles.page} ref={topRef}>
      <Link to="/warehouse/packages" className={styles.backLink}>
        {t('dashboard.flow.common.backToPackages')}
      </Link>

      <Message tone={flash.tone || 'info'}>{flash.text}</Message>

      {/* Verify: the facts a worker checks against the label in their hand. */}
      <section className={styles.card} aria-labelledby="package-heading">
        <div className={styles.cardHead}>
          <h1 id="package-heading" className={styles.pageTitle}>
            {shipment.package_number}
          </h1>
          <span className={styles.statusPill}>{shipment.workflow_status_display}</span>
        </div>

        <dl className={styles.identity}>
          <Fact label={t(`${P}facts.tracking`)} big>
            {shipment.tracking_number}
          </Fact>
          <Fact label={t(`${P}facts.customer`)}>{shipment.customer}</Fact>
          <Fact label={t(`${P}facts.order`)}>{shipment.order_number}</Fact>
          <Fact label={t(`${P}facts.destination`)}>{shipment.destination}</Fact>
          <Fact label={t(`${P}facts.type`)}>
            {[shipment.package_type, shipment.freight_display].filter(Boolean).join(' · ')}
          </Fact>
          <Fact label={t(`${P}facts.status`)}>{t(`dashboard.flow.stages.${shipment.warehouse_stage}`)}</Fact>
          <Fact label={t(`${P}facts.location`)}>{shipment.warehouse_location}</Fact>
        </dl>

        {(shipment.has_open_damage || shipment.has_problem || shipment.overdue) && (
          <div className={styles.flagRow}>
            {shipment.has_open_damage && <span className={styles.flag}>{t(`${P}flagDamage`)}</span>}
            {shipment.has_problem && (
              <span className={styles.flag}>{fill(t(`${P}flagProblem`), { note: shipment.problem_note })}</span>
            )}
            {shipment.overdue && <span className={`${styles.flag} ${styles.flagWarn}`}>{t(`${P}flagOverdue`)}</span>}
          </div>
        )}
      </section>

      {hasLeft ? (
        <Message tone="info">{fill(t(`${P}left`), { status: shipment.status_display.toLowerCase() })}</Message>
      ) : (
        <>
          <Steps shipment={shipment} step={step} />

          {step === 'verify' && (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>{t(`${P}verifyTitle`)}</h2>
              <div className={styles.buttonRow}>
                <button
                  type="button"
                  className={styles.success}
                  disabled={Boolean(busy)}
                  onClick={confirmPackage}
                  autoFocus
                >
                  {busy ? saving : t(`${P}verifyYes`)}
                </button>
                <button type="button" className={styles.secondary} onClick={nextPackage}>
                  {t(`${P}verifyNo`)}
                </button>
              </div>
            </section>
          )}

          {step === 'measure' && (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>{t(`${P}measureTitle`)}</h2>
              <MeasurementForm
                shipment={shipment}
                onSaved={({ measurement, shipment: data }) =>
                  completed(
                    data,
                    fill(t(`${P}measured`), {
                      weight: Number(measurement.weight_kg),
                      volume: Number(measurement.volume_m3),
                      dim: Number(measurement.dimensional_weight_kg),
                    }),
                    'packaging',
                  )
                }
              />
              {shipment.measurement && (
                <button
                  type="button"
                  className={`${styles.secondary} ${styles.wide} ${styles.gapTop}`}
                  onClick={() => setStep('packaging')}
                >
                  {t(`${P}keepMeasurements`)}
                </button>
              )}
            </section>
          )}

          {step === 'packaging' && (
            <section className={styles.card}>
              <div className={styles.cardHead}>
                <h2 className={styles.cardTitle}>{t(`${P}packagingTitle`)}</h2>
                <button type="button" className={styles.textButton} onClick={() => setStep('measure')}>
                  {t(`${P}remeasure`)}
                </button>
              </div>
              <PackagingForm
                shipment={shipment}
                onSaved={({ packaging, shipment: data }) =>
                  completed(
                    data,
                    fill(t(`${P}packagingAdded`), {
                      quantity: packaging.quantity,
                      type: t(`dashboard.flow.packaging.types.${packaging.packaging_type}`),
                    }),
                  )
                }
              />
              <div className={`${styles.buttonRow} ${styles.gapTop}`}>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={Boolean(busy) || !canMove('packed')}
                  onClick={() => move('packed', t(`${P}packagedDone`), 'ready')}
                >
                  {busy === 'packed' ? saving : t(`${P}markPackaged`)}
                </button>
              </div>
            </section>
          )}

          {step === 'ready' && (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>{t(`${P}readyTitle`)}</h2>
              <p className={`${styles.pageLead} ${styles.gapBottom}`}>{t(`${P}readyLead`)}</p>
              <div className={styles.buttonRow}>
                <button
                  type="button"
                  className={styles.success}
                  disabled={Boolean(busy) || !canMove('ready')}
                  onClick={() => move('ready', t(`${P}readyDone`), 'done')}
                >
                  {busy === 'ready' ? saving : t(`${P}markReady`)}
                </button>
                <button type="button" className={styles.secondary} onClick={() => setStep('packaging')}>
                  {t(`${P}backToPackaging`)}
                </button>
              </div>
            </section>
          )}

          {step === 'done' && (
            <section className={styles.done}>
              <p className={styles.doneTitle}>
                {shipment.warehouse_stage === 'shipped' ? t(`${P}doneShipped`) : t(`${P}doneReady`)}
              </p>
              <p className={styles.doneText}>{t(`${P}doneText`)}</p>
              <div className={styles.buttonRow}>
                {/* The label goes on the box before it leaves the floor. */}
                <Link to={`/warehouse/shipments/${shipment.id}/label`} className={styles.secondary}>
                  {t(`${P}printLabel`)}
                </Link>
                <button type="button" className={styles.primary} onClick={nextPackage} autoFocus>
                  {t('dashboard.flow.common.nextPackage')}
                </button>
              </div>
            </section>
          )}

          {worked && step !== 'done' && (
            <button
              type="button"
              className={`${styles.secondary} ${styles.wide} ${styles.gapBottom}`}
              onClick={nextPackage}
            >
              {t('dashboard.flow.common.nextPackage')}
            </button>
          )}
        </>
      )}

      <section className={styles.card}>
        {reportingDamage ? (
          <>
            <h2 className={styles.cardTitle}>{t(`${P}damageTitle`)}</h2>
            <DamageForm
              shipment={shipment}
              onCancel={() => setReportingDamage(false)}
              onSaved={({ damage_report: report, shipment: data }) => {
                setReportingDamage(false);
                completed(
                  data,
                  fill(t(`${P}damageReported`), { type: t(`dashboard.flow.damage.types.${report.damage_type}`) }),
                );
              }}
            />
          </>
        ) : (
          <div className={styles.buttonRow}>
            <button type="button" className={styles.danger} onClick={() => setReportingDamage(true)}>
              {t(`${P}reportDamage`)}
            </button>
          </div>
        )}
        {!hasLeft && (
          <div className={styles.gapTop}>
            <LocationForm
              key={shipment.warehouse_location}
              shipment={shipment}
              onSaved={(data, text) => completed(data, text)}
            />
          </div>
        )}
      </section>

      <details className={styles.disclosure} open>
        <summary>{fill(t(`${P}history`), { count: timeline.length })}</summary>
        <section className={styles.card}>
          <Timeline entries={timeline} />
        </section>
      </details>

      <details className={styles.disclosure}>
        <summary>{t(`${P}details`)}</summary>
        <ShipmentCard
          shipment={shipment}
          onChange={(data) => {
            setShipment(data);
            setStep(stepFor(data.warehouse_stage));
            refreshTimeline();
          }}
        />
      </details>
    </div>
  );
}
