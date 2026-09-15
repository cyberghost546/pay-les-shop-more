// src/pages/Warehouse/WarehouseProfile.jsx
//
// The worker's own page: who they are signed in as, what they have handed
// over, the sheets still on their plate, and the tools they reach for that
// are not a sheet - a calculator for a quote over the phone, the handover
// e-mail setting, and their password.
//
// Deliberately not the customer profile at /profile. That page is about
// addresses, shipments and marketing mail, none of which a warehouse account
// has, and it sits inside the public site's header and footer.

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  INTAKE_FREIGHT,
  createIntakeSheet,
  getWarehouseSummary,
  listIntakeSheets,
  roleLabel,
} from '../../api/staff';
import { changePassword, setWarehouseEmails } from '../../api/profile';
import { useAuth } from '../../auth/useAuth';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import Loading from '../../components/Loading/Loading';
import Measurements from '../Dashboard/Measurements';
import { Banner, Empty, StatusBadge } from '../Dashboard/ui';
import { formatDate, formatDateTime } from '../Dashboard/format';
import dashboard from '../Dashboard/Dashboard.module.css';
import styles from './Warehouse.module.css';

const EMPTY_PASSWORDS = { current: '', next: '', repeat: '' };

/** The counts and the person's own drafts, fetched together and retried together. */
function useMyWork() {
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState({ attempt: -1, status: 'loading', data: null });

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      getWarehouseSummary(),
      listIntakeSheets({ mine: 'true', status: 'draft', ordering: '-updated_at' }),
    ])
      .then(([summary, drafts]) => {
        if (!cancelled) setAnswer({ attempt, status: 'ready', data: { summary, drafts } });
      })
      .catch(() => {
        if (!cancelled) setAnswer({ attempt, status: 'error', data: null });
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const state = answer.attempt === attempt ? answer.status : 'loading';

  return { state, data: answer.data, reload };
}

/** First message the server sent about a field, or nothing. */
function fieldError(error, field) {
  const messages = error?.fields?.[field];
  return Array.isArray(messages) ? messages[0] : messages;
}

function PasswordForm() {
  const [passwords, setPasswords] = useState(EMPTY_PASSWORDS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const mismatch = passwords.repeat !== '' && passwords.next !== passwords.repeat;

  function set(field, value) {
    setPasswords((current) => ({ ...current, [field]: value }));
    setDone(false);
  }

  async function submit(event) {
    event.preventDefault();
    if (mismatch || !passwords.current || !passwords.next) return;

    setBusy(true);
    setError(null);

    try {
      await changePassword({ currentPassword: passwords.current, newPassword: passwords.next });
      setDone(true);
    } catch (caught) {
      setError(caught);
    } finally {
      // Never left sitting in state after the request, whichever way it went.
      setPasswords(EMPTY_PASSWORDS);
      setBusy(false);
    }
  }

  const general =
    error && !fieldError(error, 'current_password') && !fieldError(error, 'new_password')
      ? 'The password could not be changed. Check the connection and try again.'
      : '';

  return (
    <form onSubmit={submit} className={styles.profileForm}>
      <Banner tone="success">{done ? 'Password changed. You stay signed in here.' : ''}</Banner>
      <Banner tone="error">{general}</Banner>

      <label className={styles.profileField}>
        <span className={dashboard.intakeLabel}>Current password</span>
        <input
          type="password"
          autoComplete="current-password"
          className={dashboard.intakeInput}
          value={passwords.current}
          onChange={(event) => set('current', event.target.value)}
          required
        />
        {fieldError(error, 'current_password') && (
          <span className={dashboard.measureWarning}>{fieldError(error, 'current_password')}</span>
        )}
      </label>

      <label className={styles.profileField}>
        <span className={dashboard.intakeLabel}>New password</span>
        <input
          type="password"
          autoComplete="new-password"
          className={dashboard.intakeInput}
          value={passwords.next}
          onChange={(event) => set('next', event.target.value)}
          required
        />
        {fieldError(error, 'new_password') && (
          <span className={dashboard.measureWarning}>{fieldError(error, 'new_password')}</span>
        )}
      </label>

      <label className={styles.profileField}>
        <span className={dashboard.intakeLabel}>New password again</span>
        <input
          type="password"
          autoComplete="new-password"
          className={dashboard.intakeInput}
          value={passwords.repeat}
          onChange={(event) => set('repeat', event.target.value)}
          required
        />
        {mismatch && (
          <span className={dashboard.measureWarning}>The two new passwords are not the same.</span>
        )}
      </label>

      <button type="submit" className={dashboard.primaryButton} disabled={busy || mismatch}>
        {busy ? 'Saving…' : 'Change password'}
      </button>
    </form>
  );
}

/**
 * Sizes and weights worked out without a sheet: for "what would this cost to
 * send" from somebody at the counter. Nothing here is saved.
 */
function Calculator() {
  const [lines, setLines] = useState([]);
  const [freight, setFreight] = useState('sea');

  return (
    <>
      <div className={styles.calcHead}>
        <label className={styles.profileField}>
          <span className={dashboard.intakeLabel}>Freight</span>
          <select
            className={dashboard.intakeInput}
            value={freight}
            onChange={(event) => setFreight(event.target.value)}
          >
            {INTAKE_FREIGHT.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {lines.length > 0 && (
          <button type="button" className={dashboard.linkButton} onClick={() => setLines([])}>
            Clear
          </button>
        )}
      </div>

      <Measurements
        lines={lines}
        onChange={setLines}
        freight={freight}
        declaredWeight={null}
        disabled={false}
      />
    </>
  );
}

export default function WarehouseProfile() {
  const { user, refreshUser, signOut } = useAuth();
  const navigate = useNavigate();
  const work = useMyWork();

  const [starting, setStarting] = useState(false);
  const [mailBusy, setMailBusy] = useState(false);
  const [error, setError] = useState('');

  const mailsMe = user?.notifications?.warehouse ?? true;
  const roles = [roleLabel(user?.role)];

  async function startSheet() {
    setStarting(true);
    setError('');

    try {
      const sheet = await createIntakeSheet();
      navigate(`/warehouse/intake?sheet=${sheet.id}`);
    } catch {
      setError('A new sheet could not be started. Check the connection and try again.');
      setStarting(false);
    }
  }

  async function setMailsMe(enabled) {
    setMailBusy(true);
    setError('');

    try {
      await setWarehouseEmails(enabled);
      await refreshUser();
    } catch {
      setError('That preference could not be saved. Try again in a moment.');
    } finally {
      setMailBusy(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    navigate('/', { replace: true });
  }

  const summary = work.data?.summary;
  const drafts = work.data?.drafts;

  return (
    <>
      <header className={`${dashboard.head} ${styles.profileHead}`}>
        <div className={styles.avatar} aria-hidden="true">
          {(user?.firstName?.[0] || user?.email?.[0] || '?').toUpperCase()}
        </div>
        <div>
          <h1 className={dashboard.title}>{user?.name?.trim() || user?.email}</h1>
          <p className={dashboard.subtitle}>
            {user?.email}
            {user?.memberSince && <> · working here since {formatDate(user.memberSince)}</>}
          </p>
          <div className={styles.roles}>
            {roles.map((role) => (
              <StatusBadge key={role} tone="progress">
                {role}
              </StatusBadge>
            ))}
          </div>
        </div>
      </header>

      <Banner tone="error">{error}</Banner>

      <div className={styles.actions}>
        <Link to="/warehouse/scan" className={dashboard.scanStart}>
          Scan a package
        </Link>
        <button
          type="button"
          className={dashboard.scanSecondary}
          onClick={startSheet}
          disabled={starting}
        >
          {starting ? 'Starting…' : 'New sheet without scanning'}
        </button>
      </div>

      {work.state === 'loading' && <Loading inline />}
      {work.state === 'error' && <ConnectionError inline onRetry={work.reload} />}

      {work.state === 'ready' && (
        <>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statValue}>{summary.my_drafts}</span>
              <span className={styles.statLabel}>Your open drafts</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{summary.my_released_today}</span>
              <span className={styles.statLabel}>You released today</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{summary.my_released_week}</span>
              <span className={styles.statLabel}>This week</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{summary.my_released_total}</span>
              <span className={styles.statLabel}>All time</span>
            </div>
          </div>

          <section className={`${dashboard.card} ${styles.section}`}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Your drafts</h2>
              <Link to="/warehouse/intake?status=draft" className={dashboard.sectionLink}>
                Everybody&apos;s drafts
              </Link>
            </div>

            {drafts.results.length === 0 ? (
              <Empty>Nothing waiting on you. Every sheet you started has been released.</Empty>
            ) : (
              <ul className={styles.recent}>
                {drafts.results.map((sheet) => (
                  <li key={sheet.id}>
                    <Link to={`/warehouse/intake?sheet=${sheet.id}`} className={styles.recentRow}>
                      <span className={styles.recentMain}>
                        <span className={styles.recentLabel}>{sheet.label}</span>
                        <span className={styles.recentDetail}>
                          {sheet.destination || 'No destination yet'} ·{' '}
                          {formatDateTime(sheet.updated_at)}
                        </span>
                        {sheet.missing?.length > 0 && (
                          <span className={styles.recentDetail}>
                            Still to fill in: {sheet.missing.join(', ')}
                          </span>
                        )}
                      </span>
                      <StatusBadge tone={sheet.missing?.length ? 'attention' : 'done'}>
                        {sheet.missing?.length ? 'Unfinished' : 'Ready to release'}
                      </StatusBadge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <section className={`${dashboard.card} ${styles.section}`}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Volume &amp; weight calculator</h2>
        </div>
        <p className={dashboard.intakeHint}>
          Work out colli, cubic metres and chargeable weight without starting a
          sheet. Nothing here is saved.
        </p>
        <Calculator />
      </section>

      <div className={styles.profileColumns}>
        <section className={`${dashboard.card} ${styles.section}`}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Handover e-mails</h2>
          </div>
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={mailsMe}
              disabled={mailBusy}
              onChange={(event) => setMailsMe(event.target.checked)}
            />
            <span>
              E-mail me when a colleague releases an intake sheet.
              {!user?.email && ' There is no e-mail address on this account, so nothing can be sent.'}
            </span>
          </label>
        </section>

        <section className={`${dashboard.card} ${styles.section}`}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Password</h2>
          </div>
          <PasswordForm />
        </section>
      </div>

      <div className={styles.profileFoot}>
        {user?.isStaff && (
          <Link to="/dashboard" className={styles.officeLink}>
            Office dashboard
          </Link>
        )}
        <button type="button" className={styles.signOut} onClick={handleSignOut}>
          Sign out
        </button>
      </div>
    </>
  );
}
