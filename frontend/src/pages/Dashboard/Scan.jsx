// src/pages/Dashboard/Scan.jsx
//
// The warehouse scanner: point a phone at the code on a box, and get either
// the intake sheet somebody already wrote for it or a way to start one.
//
// This page is designed for a phone held in one hand in a warehouse, which is
// a different thing from a page that merely fits on a phone. Everything it
// asks for is one tap, the targets are large, and the answer to a scan is a
// single card with a single button on it. There is no table.
//
// Three things it refuses to do:
//
// * Decide for you. A scan looks the code up and stops. Starting a sheet is a
//   second, deliberate tap, because the commonest failure of a scanner is the
//   mis-scan - the label on the box behind, the second barcode on a carton -
//   and one that wrote a row on every read would fill the dashboard with junk
//   somebody has to work out and delete.
// * Insist on the camera. There is a box to type into, and it is not hidden
//   away: labels get torn, get wet, get covered in tape, and a scanner that
//   is the only way in is one that stops the work when it fails.
// * Load the camera library until it is needed. It is large, and somebody who
//   opens this page to type a number should not wait for it.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createIntakeSheet, scanCode } from '../../api/staff';
import { Banner, StatusBadge } from './ui';
import styles from './Dashboard.module.css';

/**
 * Whether the browser will give us a camera at all.
 *
 * getUserMedia is only exposed on a secure origin, so on plain http the
 * property is simply missing rather than the call failing - which reads as
 * "this phone has no camera" unless it is checked for separately. localhost
 * counts as secure, which is what makes this testable in development.
 */
function cameraAvailable() {
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

/** The camera, as a hook: start it, stop it, and hear about a decoded code. */
function useScanner(onCode) {
  const videoRef = useRef(null);
  // The zxing controls object, which is the only handle on the camera track.
  // A ref rather than state: losing it leaks a camera that stays switched on
  // behind the page, and a re-render must not be able to drop it.
  const controlsRef = useRef(null);

  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  const stop = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setRunning(false);
  }, []);

  // Stopped on the way out, always. A camera left running is a light on the
  // phone, a flat battery and, to anybody watching, a page that is still
  // looking at them.
  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    setError('');

    if (!cameraAvailable()) {
      setError(
        window.isSecureContext === false
          ? 'The camera only works over https. Open the dashboard on the secure address.'
          : 'This device has no camera the browser can use. Type the code instead.',
      );
      return;
    }

    setStarting(true);

    try {
      // Loaded here rather than imported at the top of the file, so the
      // decoder is downloaded the first time somebody actually scans and
      // never for somebody who came here to type.
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();

      controlsRef.current = await reader.decodeFromConstraints(
        // The back camera. `ideal` rather than `exact` so a laptop with only
        // a front camera still works instead of failing outright.
        { video: { facingMode: { ideal: 'environment' } } },
        videoRef.current,
        (result) => {
          if (!result) return;

          // One code per start. zxing keeps decoding the same label many
          // times a second, and without this a box held in front of the lens
          // would fire a lookup on every frame.
          stop();
          onCode(result.getText());
        },
      );

      setRunning(true);
    } catch (failure) {
      setError(
        failure?.name === 'NotAllowedError'
          ? 'The camera was blocked. Allow it for this site in your browser settings, or type the code instead.'
          : 'The camera could not be started. Type the code instead.',
      );
    } finally {
      setStarting(false);
    }
  }, [onCode, stop]);

  return { videoRef, start, stop, running, starting, error };
}

/** What a scan found, and the one thing to do about it. */
function Result({ result, onStart, busy }) {
  const { match, code, sheet, package: shipment, booking } = result;

  if (match === 'sheet') {
    return (
      <div className={styles.scanResult}>
        <p className={styles.scanResultHead}>Already written up</p>
        <p className={styles.scanCode}>{sheet.label}</p>

        <div className={styles.scanBadges}>
          <StatusBadge tone={sheet.status === 'draft' ? 'attention' : 'done'}>
            {sheet.status_display}
          </StatusBadge>
          {sheet.revision > 1 && (
            <StatusBadge tone="attention">Version {sheet.revision}</StatusBadge>
          )}
        </div>

        <p className={styles.scanDetail}>
          {sheet.destination || 'No destination yet'}
          {sheet.colli_count ? ` · ${sheet.colli_count} colli` : ''}
          {sheet.status === 'draft' && sheet.missing?.length > 0
            ? ` · ${sheet.missing.length} still to fill in`
            : ''}
        </p>

        <button type="button" className={styles.scanAction} onClick={onStart}>
          Open this sheet
        </button>
      </div>
    );
  }

  if (match === 'package') {
    return (
      <div className={styles.scanResult}>
        <p className={styles.scanResultHead}>Shipment on file</p>
        <p className={styles.scanCode}>{shipment.tracking_number}</p>
        <p className={styles.scanDetail}>
          {shipment.customer}
          {shipment.destination ? ` · ${shipment.destination}` : ''}
        </p>

        <button
          type="button"
          className={styles.scanAction}
          disabled={busy}
          onClick={onStart}
        >
          {busy ? 'Starting…' : 'Start the intake'}
        </button>
      </div>
    );
  }

  if (match === 'booking') {
    return (
      <div className={styles.scanResult}>
        <p className={styles.scanResultHead}>Booking on file</p>
        <p className={styles.scanCode}>{booking.shipping_number}</p>
        <p className={styles.scanDetail}>
          {booking.sender} → {booking.recipient}
          {booking.destination ? ` · ${booking.destination}` : ''}
        </p>

        <button
          type="button"
          className={styles.scanAction}
          disabled={busy}
          onClick={onStart}
        >
          {busy ? 'Starting…' : 'Start the intake'}
        </button>
      </div>
    );
  }

  // Nothing recognised it. A normal answer, not a failure: goods arrive with
  // a supplier's own barcode and nothing else every day of the week.
  return (
    <div className={styles.scanResult}>
      <p className={styles.scanResultHead}>Nothing on file</p>
      <p className={styles.scanCode}>{code}</p>
      <p className={styles.scanDetail}>
        No sheet, shipment or booking has this code. Start a sheet under it and
        fill in the rest by hand.
      </p>

      <button
        type="button"
        className={styles.scanAction}
        disabled={busy}
        onClick={onStart}
      >
        {busy ? 'Starting…' : 'Start a sheet for this code'}
      </button>
    </div>
  );
}

export default function Scan() {
  const navigate = useNavigate();

  const [result, setResult] = useState(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const lookUp = useCallback(async (code) => {
    const trimmed = (code ?? '').trim();
    if (!trimmed) return;

    setError('');
    setResult(null);
    setBusy(true);

    try {
      setResult(await scanCode(trimmed));
    } catch {
      setError('That code could not be looked up. Check the connection and try again.');
    } finally {
      setBusy(false);
    }
  }, []);

  // Destructured rather than kept as one `scanner` object. The hook returns
  // a ref among its values, and reading anything off that object during
  // render reads as reading a ref - which is a rule worth keeping, because a
  // ref really does not re-render when it changes.
  const {
    videoRef,
    start: startCamera,
    stop: stopCamera,
    running,
    starting,
    error: cameraError,
  } = useScanner(lookUp);

  /** Open the sheet a scan found, or start the one it says is missing. */
  async function act() {
    if (result.match === 'sheet') {
      navigate(`/dashboard/intake?sheet=${result.sheet.id}`);
      return;
    }

    setBusy(true);
    setError('');

    try {
      // The code goes on as the reference whatever it matched, so the next
      // person to scan this box finds the sheet rather than starting a
      // second one. The link is what makes the office side join up.
      const sheet = await createIntakeSheet({
        reference: result.code,
        package: result.package?.id ?? null,
        booking: result.booking?.id ?? null,
      });

      navigate(`/dashboard/intake?sheet=${sheet.id}`);
    } catch {
      setError('The sheet could not be started. Check the connection and try again.');
      setBusy(false);
    }
  }

  return (
    <>
      <header className={styles.head}>
        <h1 className={styles.title}>Scan a package</h1>
        <p className={styles.subtitle}>
          Point the camera at the code on the box. If it has been written up
          already you get that sheet; if not, you can start one here.
        </p>
      </header>

      <Banner tone="error">{error || cameraError}</Banner>

      <div className={styles.scanStage}>
        {/* Always mounted, hidden until running. zxing is handed this element
            when the camera starts, and an element created in the same tick is
            not laid out yet. */}
        <video
          ref={videoRef}
          className={styles.scanVideo}
          hidden={!running}
          muted
          playsInline
        />

        {running ? (
          <button
            type="button"
            className={styles.scanSecondary}
            onClick={stopCamera}
          >
            Stop the camera
          </button>
        ) : (
          <button
            type="button"
            className={styles.scanStart}
            disabled={starting}
            onClick={startCamera}
          >
            {starting ? 'Starting the camera…' : 'Scan with the camera'}
          </button>
        )}
      </div>

      {result && <Result result={result} onStart={act} busy={busy} />}

      {/* Not tucked behind a link. A torn label is an ordinary morning, and
          typing the number has to be as reachable as the camera. */}
      <form
        className={styles.scanTypeIn}
        onSubmit={(event) => {
          event.preventDefault();
          stopCamera();
          lookUp(typed);
        }}
      >
        <label className={styles.intakeField}>
          <span className={styles.intakeLabel}>Or type the code</span>
          <input
            className={styles.intakeInput}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder="CI-1001"
            // Off on all four: a code is not a word, and a phone keyboard
            // that corrects it is a phone keyboard that breaks it.
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="off"
            spellCheck="false"
          />
        </label>

        <button type="submit" className={styles.scanSecondary} disabled={busy}>
          {busy ? 'Looking…' : 'Look it up'}
        </button>
      </form>
    </>
  );
}
