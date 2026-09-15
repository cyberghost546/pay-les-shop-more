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
import DamageForm from './DamageForm';
import MeasurementForm from './MeasurementForm';
import { Message, Timeline } from './opsUi';
import PackagingForm from './PackagingForm';
import ShipmentCard from './ShipmentCard';
import styles from './Ops.module.css';

const LEFT = ['in_transit', 'arrived', 'delivered', 'cancelled'];
const PACKED_OR_LATER = ['packed', 'ready', 'shipped'];

const STEP_LABELS = ['Verify', 'Measure', 'Packaging', 'Packaged', 'Ready'];

/** Which step a package in this stage is on. */
function stepFor(stage) {
  if (['awaiting_pickup', 'received', 'awaiting_measurement'].includes(stage)) return 'verify';
  if (['measured', 'awaiting_packaging'].includes(stage)) return 'packaging';
  if (stage === 'packed') return 'ready';
  return 'done';
}

function Steps({ shipment, step }) {
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
    <ol className={styles.steps} aria-label="Progress">
      {STEP_LABELS.map((label, index) => {
        const className = [
          styles.step,
          done[index] && index !== current ? styles.stepDone : '',
          index === current ? styles.stepCurrent : '',
        ].join(' ');
        return (
          <li key={label} className={className} aria-current={index === current ? 'step' : undefined}>
            <span className={styles.stepDot}>{done[index] && index !== current ? '✓' : index + 1}</span>
            <span>{label}</span>
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
  const [value, setValue] = useState(shipment.warehouse_location ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const changed = value.trim().toUpperCase() !== (shipment.warehouse_location ?? '');

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      onSaved(await setLocation(shipment.id, value), `Location set to ${value.trim().toUpperCase() || 'none'}.`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={`${styles.fields} ${styles.alignEnd}`}>
      <label className={styles.field}>
        <span className={styles.label}>Warehouse location</span>
        <input
          className={styles.input}
          value={value}
          maxLength={40}
          placeholder="e.g. B-04"
          autoCapitalize="characters"
          autoComplete="off"
          onChange={(event) => setValue(event.target.value)}
        />
        {error && <span className={styles.fieldError}>{error}</span>}
      </label>
      <button type="submit" className={styles.secondary} disabled={busy || !changed}>
        {busy ? 'Saving…' : 'Save location'}
      </button>
    </form>
  );
}

export default function PackagePage() {
  const { id } = useParams();
  const navigate = useNavigate();

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
    setFlash({ tone: 'error', text: errorMessage(error, fallback) });
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function move(stage, text, nextStep) {
    setBusy(stage);
    setFlash({ tone: '', text: '' });
    try {
      completed(await moveStage(shipment.id, stage), text, nextStep);
    } catch (error) {
      failed(error, 'The package could not be moved. Try again.');
    } finally {
      setBusy('');
    }
  }

  async function confirmPackage() {
    // An expected package being held is a package received.
    if (shipment.warehouse_stage === 'awaiting_pickup' && shipment.allowed_stages.includes('received')) {
      await move('received', 'Package received. Now measure it.', 'measure');
      return;
    }
    setFlash({ tone: '', text: '' });
    setStep('measure');
  }

  const nextPackage = () => navigate('/warehouse/scan');
  const state = load.key === key ? load.status : 'loading';

  if (state === 'loading') return <Loading inline />;
  if (state === 'error') return <ConnectionError inline onRetry={() => setAttempt((n) => n + 1)} />;
  if (state === 'missing') {
    return (
      <div className={styles.page}>
        <Message tone="error">There is no package with this number.</Message>
        <button type="button" className={`${styles.primary} ${styles.wide}`} onClick={nextPackage}>
          Scan another package
        </button>
      </div>
    );
  }

  const hasLeft = LEFT.includes(shipment.status);
  const canMove = (stage) => shipment.allowed_stages.includes(stage);

  return (
    <div className={styles.page} ref={topRef}>
      <Link to="/warehouse/packages" className={styles.backLink}>
        ← Packages
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
          <Fact label="Tracking number" big>
            {shipment.tracking_number}
          </Fact>
          <Fact label="Customer">{shipment.customer}</Fact>
          <Fact label="Order number">{shipment.order_number}</Fact>
          <Fact label="Destination">{shipment.destination}</Fact>
          <Fact label="Package type">
            {[shipment.package_type, shipment.freight_display].filter(Boolean).join(' · ')}
          </Fact>
          <Fact label="Current status">{shipment.warehouse_stage_display}</Fact>
          <Fact label="Warehouse location">{shipment.warehouse_location}</Fact>
        </dl>

        {(shipment.has_open_damage || shipment.has_problem || shipment.overdue) && (
          <div className={styles.flagRow}>
            {shipment.has_open_damage && <span className={styles.flag}>Open damage report</span>}
            {shipment.has_problem && <span className={styles.flag}>Problem: {shipment.problem_note}</span>}
            {shipment.overdue && <span className={`${styles.flag} ${styles.flagWarn}`}>Waiting too long</span>}
          </div>
        )}
      </section>

      {hasLeft ? (
        <Message tone="info">
          This package is {shipment.status_display.toLowerCase()}. The warehouse can no longer change it.
        </Message>
      ) : (
        <>
          <Steps shipment={shipment} step={step} />

          {step === 'verify' && (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Is this the package in front of you?</h2>
              <div className={styles.buttonRow}>
                <button
                  type="button"
                  className={styles.success}
                  disabled={Boolean(busy)}
                  onClick={confirmPackage}
                  autoFocus
                >
                  {busy ? 'Saving…' : 'Yes, measure it'}
                </button>
                <button type="button" className={styles.secondary} onClick={nextPackage}>
                  No, scan again
                </button>
              </div>
            </section>
          )}

          {step === 'measure' && (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Measure</h2>
              <MeasurementForm
                shipment={shipment}
                onSaved={({ measurement, shipment: data }) =>
                  completed(
                    data,
                    `Measurements saved: ${Number(measurement.weight_kg)} kg · ${Number(measurement.volume_m3)} m³ · dim. weight ${Number(measurement.dimensional_weight_kg)} kg.`,
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
                  Keep current measurements
                </button>
              )}
            </section>
          )}

          {step === 'packaging' && (
            <section className={styles.card}>
              <div className={styles.cardHead}>
                <h2 className={styles.cardTitle}>Packaging</h2>
                <button type="button" className={styles.textButton} onClick={() => setStep('measure')}>
                  Re-measure
                </button>
              </div>
              <PackagingForm
                shipment={shipment}
                onSaved={({ packaging, shipment: data }) =>
                  completed(data, `${packaging.quantity} × ${packaging.packaging_type_display} added.`)
                }
              />
              <div className={`${styles.buttonRow} ${styles.gapTop}`}>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={Boolean(busy) || !canMove('packed')}
                  onClick={() => move('packed', 'Package marked as packaged.', 'ready')}
                >
                  {busy === 'packed' ? 'Saving…' : 'Mark Packaged'}
                </button>
              </div>
            </section>
          )}

          {step === 'ready' && (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Ready for shipping?</h2>
              <p className={`${styles.pageLead} ${styles.gapBottom}`}>
                Put the package in the outgoing area, then confirm.
              </p>
              <div className={styles.buttonRow}>
                <button
                  type="button"
                  className={styles.success}
                  disabled={Boolean(busy) || !canMove('ready')}
                  onClick={() => move('ready', 'Ready for shipping. Well done.', 'done')}
                >
                  {busy === 'ready' ? 'Saving…' : 'Mark Ready for Shipping'}
                </button>
                <button type="button" className={styles.secondary} onClick={() => setStep('packaging')}>
                  Back to packaging
                </button>
              </div>
            </section>
          )}

          {step === 'done' && (
            <section className={styles.done}>
              <p className={styles.doneTitle}>
                {shipment.warehouse_stage === 'shipped' ? 'This package has shipped' : 'Ready for shipping'}
              </p>
              <p className={styles.doneText}>Nothing more to do on this package.</p>
              <div className={styles.buttonRow}>
                {/* The label goes on the box before it leaves the floor. */}
                <Link to={`/warehouse/shipments/${shipment.id}/label`} className={styles.secondary}>
                  Print label
                </Link>
                <button type="button" className={styles.primary} onClick={nextPackage} autoFocus>
                  Next Package
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
              Next Package
            </button>
          )}
        </>
      )}

      <section className={styles.card}>
        {reportingDamage ? (
          <>
            <h2 className={styles.cardTitle}>Report damage</h2>
            <DamageForm
              shipment={shipment}
              onCancel={() => setReportingDamage(false)}
              onSaved={({ damage_report: report, shipment: data }) => {
                setReportingDamage(false);
                completed(data, `Damage reported: ${report.damage_type_display}.`);
              }}
            />
          </>
        ) : (
          <div className={styles.buttonRow}>
            <button type="button" className={styles.danger} onClick={() => setReportingDamage(true)}>
              Report damage
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
        <summary>Package history ({timeline.length})</summary>
        <section className={styles.card}>
          <Timeline entries={timeline} />
        </section>
      </details>

      <details className={styles.disclosure}>
        <summary>Full details and corrections</summary>
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
