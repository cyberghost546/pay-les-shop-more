// src/pages/Dashboard/Intake.jsx
//
// The warehouse intake sheet: the clipboard that gets filled in when goods
// arrive, and the button that hands it to everybody else.
//
// The form below is laid out in the order the paper form is printed in -
// Ophalen, Inpakken, the three checks, who and where, what turned up - and
// keeps its Dutch labels. That is not decoration. The people filling this in
// have the paper version in their other hand for months yet, and a field that
// has been renamed to something clearer in English is a field they cannot
// find.
//
// Everything here is behind the staff guard on the route, and behind IsStaff
// on the server. A sheet says who packed badly and what arrived damaged; no
// customer ever sees one.

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Loading from '../../components/Loading/Loading';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import {
  INTAKE_CHECKS,
  INTAKE_FREIGHT,
  INTAKE_PACKAGING,
  INTAKE_STATUSES,
  createIntakeSheet,
  getIntakeRecipients,
  listIntakeSheets,
  releaseIntakeSheet,
  reopenIntakeSheet,
  updateIntakeSheet,
} from '../../api/staff';
import { useAuth } from '../../auth/useAuth';
import { setWarehouseEmails } from '../../api/profile';
import { useCollection } from './useCollection';
import { formatDate, formatDateTime } from './format';
import {
  Banner,
  Empty,
  FilterSelect,
  Pagination,
  SearchInput,
  StatusBadge,
  Toolbar,
} from './ui';
import styles from './Dashboard.module.css';

const TONES = {
  draft: 'attention',
  released: 'done',
};

// Every field the form writes, with what an empty one looks like. Written out
// rather than derived from the server's answer so that a new sheet and a
// loaded one are the same shape, and a `value={undefined}` never turns a
// controlled input into an uncontrolled one halfway through typing.
const EMPTY = {
  reference: '',
  pickup: false,
  upper_floor: false,
  employees: '',
  pickup_location: '',
  received_on: '',
  packing_required: false,
  pallet_box: false,
  volume_m3: '',
  packed_well: '',
  damage_present: '',
  address_label_present: '',
  check_notes: '',
  supplier: '',
  sender: '',
  destination: '',
  recipient: '',
  notes: '',
  colli_count: '',
  packaging: '',
  packaging_other: '',
  dimensions_weight: '',
  freight: '',
};

/** A sheet from the API, as the form holds it: nulls become empty strings. */
function toDraft(sheet) {
  const draft = { ...EMPTY };

  for (const field of Object.keys(EMPTY)) {
    const value = sheet[field];
    draft[field] = typeof value === 'boolean' ? value : (value ?? '');
  }

  return draft;
}

/**
 * The form as the API wants it: the two numeric boxes go back as null when
 * they are empty, because "nobody has measured it" is not zero cubic metres.
 */
function toPayload(draft) {
  return {
    ...draft,
    volume_m3: draft.volume_m3 === '' ? null : draft.volume_m3,
    colli_count: draft.colli_count === '' ? null : draft.colli_count,
    received_on: draft.received_on === '' ? null : draft.received_on,
  };
}

// What has to be answered before a sheet may be handed over, in the order the
// form asks for it. A copy of REQUIRED_FOR_RELEASE and REQUIRED_CHECKS in
// backend/warehouse/serializers.py, kept in the same words so that the list
// under the button and the list in a refusal read identically.
//
// The server is still the one that decides. This exists so the button can
// answer while somebody is typing, which is the one thing a round trip per
// keystroke cannot do; the release itself is checked again on the server,
// which is what holds when two people have the same sheet open.
const REQUIRED = [
  ['received_on', 'Datum aanname goederen'],
  ['colli_count', 'Aantal colli'],
  ['freight', 'Transportwijze'],
  ['destination', 'Bestemming'],
  ['packed_well', 'Goed ingepakt?'],
  ['damage_present', 'Schade aanwezig?'],
  ['address_label_present', 'Adreslabel aanwezig?'],
];

/** @returns {string[]} the labels of everything still blank, or an empty list. */
function missingFor(draft) {
  const missing = REQUIRED.filter(
    ([field]) => String(draft[field] ?? '').trim() === '',
  ).map(([, label]) => label);

  // Verpakking counts as answered either by a choice or, for "anders", by the
  // words written on the line after it.
  if (!draft.packaging) missing.push('Verpakking');
  else if (draft.packaging === 'other' && !draft.packaging_other.trim()) {
    missing.push('Verpakking (anders)');
  }

  return missing;
}

/** A labelled box. `wide` spans the grid, for the ones people write in. */
function Field({ label, wide = false, children }) {
  return (
    <label className={wide ? styles.intakeFieldWide : styles.intakeField}>
      <span className={styles.intakeLabel}>{label}</span>
      {children}
    </label>
  );
}

/**
 * A Ja / Nee pair that starts on neither.
 *
 * Radio buttons rather than a checkbox, which is the whole point: a checkbox
 * has two states and this question has three. "Nobody has looked at it yet"
 * and "we looked, there is no damage" are different answers, and a form that
 * cannot tell them apart is one that quietly reports the first as the second.
 */
function CheckField({ label, name, value, onChange, disabled }) {
  return (
    <fieldset className={styles.intakeCheck} disabled={disabled}>
      <legend className={styles.intakeLabel}>{label}</legend>
      {INTAKE_CHECKS.map((option) => (
        <label key={option.value || 'blank'} className={styles.intakeRadio}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** A Ja / Nee that really is a yes or no: Ophalen, Verdieping, Inpakken. */
function ToggleField({ label, checked, onChange, disabled }) {
  return (
    <label className={styles.intakeToggle}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

/**
 * One sheet, open.
 *
 * Handed the sheet rather than an id, and keyed on that id by the caller, so
 * that opening a different sheet builds a fresh form instead of leaving one
 * sheet's half-typed remarks sitting in another's boxes.
 */
function SheetForm({ sheet, recipients, onSaved, onReleased, onClose }) {
  const [draft, setDraft] = useState(() => toDraft(sheet));
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const locked = sheet.released;
  // What is still unanswered, judged on what is on screen rather than on what
  // was last saved.
  //
  // The server sends its own `missing` with every sheet, and it is the one
  // that decides - but it describes the stored row. Reading that here meant
  // somebody could fill the last box in and watch the Release button stay
  // grey, because the row it was looking at was still the one from before
  // they typed. Release saves any unsaved boxes first anyway, so what is on
  // screen is what would be handed over, and it is what the button should
  // answer to.
  const missing = missingFor(draft);

  const dirty = Object.keys(EMPTY).some(
    (field) => String(draft[field]) !== String(toDraft(sheet)[field]),
  );

  function set(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
    setNote('');
  }

  async function save() {
    setBusy('save');
    setError('');
    setNote('');

    try {
      onSaved(await updateIntakeSheet(sheet.id, toPayload(draft)));
      setNote('Saved.');
    } catch (failure) {
      setError(
        failure?.status === 409
          ? 'Somebody has already released this sheet, so it can no longer be changed.'
          : 'That could not be saved. Check the connection and try again.',
      );
    } finally {
      setBusy('');
    }
  }

  async function release() {
    setBusy('release');
    setError('');
    setNote('');

    try {
      // Saved first, always. Release reads the stored row, so releasing with
      // unsaved boxes on screen would hand over the version on the server -
      // which is the one thing somebody pressing this button is certain they
      // are not doing.
      if (dirty) onSaved(await updateIntakeSheet(sheet.id, toPayload(draft)));

      onReleased(await releaseIntakeSheet(sheet.id));
    } catch (failure) {
      const stillMissing = failure?.fields?.missing;

      if (Array.isArray(stillMissing) && stillMissing.length > 0) {
        setError(`Still to fill in: ${stillMissing.join(', ')}.`);
      } else if (failure?.status === 409) {
        setError('Somebody has already released this sheet.');
      } else {
        setError('That could not be sent. Check the connection and try again.');
      }
    } finally {
      setBusy('');
    }
  }

  async function reopen() {
    setBusy('reopen');
    setError('');
    setNote('');

    try {
      onSaved(await reopenIntakeSheet(sheet.id));
      setNote(
        'Reopened. Correct it, then release it again - everybody will be ' +
          'e-mailed a copy marked as a correction.',
      );
    } catch (failure) {
      setError(
        failure?.status === 409
          ? 'Somebody has already reopened this sheet.'
          : 'That could not be reopened. Check the connection and try again.',
      );
    } finally {
      setBusy('');
    }
  }

  return (
    <section className={styles.detail}>
      <div className={styles.intakeHead}>
        <h2 className={styles.detailTitle}>Intake sheet {sheet.label}</h2>
        <StatusBadge tone={TONES[sheet.status]}>{sheet.status_display}</StatusBadge>
        {/* Only from the second version on. "Version 1" on every other sheet
            would be noise on the ninety-nine that were right first time. */}
        {sheet.revision > 1 && (
          <StatusBadge tone="attention">Version {sheet.revision}</StatusBadge>
        )}
        <button type="button" className={styles.linkButton} onClick={onClose}>
          Close
        </button>
      </div>

      {locked && (
        <>
          <Banner tone="info">
            Released {formatDateTime(sheet.released_at)} by{' '}
            {sheet.released_by_name || 'somebody'}
            {sheet.emailed_at
              ? `, and e-mailed ${formatDateTime(sheet.emailed_at)}.`
              : '. The e-mail has not gone out yet.'}{' '}
            A released sheet is the record of what was handed over, so it is
            locked - reopen it to correct a mistake.
          </Banner>

          {/* The way back for a sheet with a mistake on it. Deliberately not
              a plain Edit button: reopening is a decision, because the people
              who were already e-mailed are working from the version this is
              about to replace. */}
          <div className={styles.intakeActions}>
            <button
              type="button"
              className={styles.rowButton}
              disabled={busy !== ''}
              onClick={reopen}
            >
              {busy === 'reopen' ? 'Reopening…' : 'Reopen to correct'}
            </button>
            <p className={styles.intakeHint}>
              It goes back to a draft you can edit. Nothing is sent until you
              release it again, and that e-mail is marked as a correction so
              nobody works from the old copy.
            </p>
          </div>
        </>
      )}

      <Banner tone="error">{error}</Banner>
      <Banner tone="success">{note}</Banner>

      <fieldset className={styles.intakeForm} disabled={locked}>
        <legend className={styles.srOnly}>Intake sheet</legend>

        <div className={styles.intakeSection}>
          <p className={styles.intakeSectionHead}>Shipment</p>
          <div className={styles.intakeGrid}>
            <Field label="Shipment / referentie">
              <input
                className={styles.intakeInput}
                value={draft.reference}
                onChange={(event) => set('reference', event.target.value)}
                placeholder="CI-0000"
              />
            </Field>
            {/* Naam werknemer, shown rather than asked for. The sheet is
                signed by the account that started it and that name is fixed
                on the server, so an input here would be a box that quietly
                discards whatever is typed into it. */}
            <Field label="Naam werknemer">
              <p className={styles.intakeSignature}>
                {sheet.employee_name || sheet.created_by_name || '—'}
              </p>
            </Field>
          </div>
        </div>

        <div className={styles.intakeSection}>
          <p className={styles.intakeSectionHead}>Ophalen</p>
          <div className={styles.intakeToggles}>
            <ToggleField
              label="Ophalen"
              checked={draft.pickup}
              onChange={(value) => set('pickup', value)}
            />
            <ToggleField
              label="Verdieping"
              checked={draft.upper_floor}
              onChange={(value) => set('upper_floor', value)}
            />
          </div>

          <div className={styles.intakeGrid}>
            <Field label="Werknemers">
              <input
                className={styles.intakeInput}
                value={draft.employees}
                onChange={(event) => set('employees', event.target.value)}
              />
            </Field>
            <Field label="Plaats van ophalen">
              <input
                className={styles.intakeInput}
                value={draft.pickup_location}
                onChange={(event) => set('pickup_location', event.target.value)}
              />
            </Field>
            <Field label="Datum aanname goederen">
              <input
                type="date"
                className={styles.intakeInput}
                value={draft.received_on}
                onChange={(event) => set('received_on', event.target.value)}
              />
            </Field>
          </div>
        </div>

        <div className={styles.intakeSection}>
          <p className={styles.intakeSectionHead}>Inpakken</p>
          <div className={styles.intakeToggles}>
            <ToggleField
              label="Inpakken"
              checked={draft.packing_required}
              onChange={(value) => set('packing_required', value)}
            />
            <ToggleField
              label="Palletdoos"
              checked={draft.pallet_box}
              onChange={(value) => set('pallet_box', value)}
            />
          </div>

          <div className={styles.intakeGrid}>
            <Field label="Aantal kuub (m³)">
              <input
                type="number"
                step="0.001"
                min="0"
                className={styles.intakeInput}
                value={draft.volume_m3}
                onChange={(event) => set('volume_m3', event.target.value)}
              />
            </Field>
          </div>
        </div>

        <div className={styles.intakeSection}>
          <p className={styles.intakeSectionHead}>Controle</p>
          <div className={styles.intakeGrid}>
            <CheckField
              label="Goed ingepakt?"
              name={`packed_well-${sheet.id}`}
              value={draft.packed_well}
              onChange={(value) => set('packed_well', value)}
              disabled={locked}
            />
            <CheckField
              label="Schade aanwezig?"
              name={`damage_present-${sheet.id}`}
              value={draft.damage_present}
              onChange={(value) => set('damage_present', value)}
              disabled={locked}
            />
            <CheckField
              label="Adreslabel aanwezig?"
              name={`address_label_present-${sheet.id}`}
              value={draft.address_label_present}
              onChange={(value) => set('address_label_present', value)}
              disabled={locked}
            />
            <Field label="Opmerkingen" wide>
              <textarea
                className={styles.intakeTextarea}
                rows={2}
                value={draft.check_notes}
                onChange={(event) => set('check_notes', event.target.value)}
              />
            </Field>
          </div>
        </div>

        <div className={styles.intakeSection}>
          <p className={styles.intakeSectionHead}>Zending</p>
          <div className={styles.intakeGrid}>
            <Field label="Leverancier">
              <input
                className={styles.intakeInput}
                value={draft.supplier}
                onChange={(event) => set('supplier', event.target.value)}
              />
            </Field>
            <Field label="Bestemming">
              <input
                className={styles.intakeInput}
                value={draft.destination}
                onChange={(event) => set('destination', event.target.value)}
              />
            </Field>
            <Field label="Afzender">
              <input
                className={styles.intakeInput}
                value={draft.sender}
                onChange={(event) => set('sender', event.target.value)}
              />
            </Field>
            <Field label="Ontvanger">
              <input
                className={styles.intakeInput}
                value={draft.recipient}
                onChange={(event) => set('recipient', event.target.value)}
              />
            </Field>
            <Field label="Opmerkingen" wide>
              <textarea
                className={styles.intakeTextarea}
                rows={2}
                value={draft.notes}
                onChange={(event) => set('notes', event.target.value)}
              />
            </Field>
          </div>
        </div>

        <div className={styles.intakeSection}>
          <p className={styles.intakeSectionHead}>Goederen</p>
          <div className={styles.intakeGrid}>
            <Field label="Aantal colli">
              <input
                type="number"
                min="0"
                className={styles.intakeInput}
                value={draft.colli_count}
                onChange={(event) => set('colli_count', event.target.value)}
              />
            </Field>
            <Field label="Verpakking">
              <select
                className={styles.intakeInput}
                value={draft.packaging}
                onChange={(event) => set('packaging', event.target.value)}
              >
                <option value="">—</option>
                {INTAKE_PACKAGING.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            {/* The blank line the paper form leaves after "kist /". Shown
                only when it has been chosen, because an input nobody should
                fill in is an input somebody will. */}
            {draft.packaging === 'other' && (
              <Field label="Verpakking, anders">
                <input
                  className={styles.intakeInput}
                  value={draft.packaging_other}
                  onChange={(event) => set('packaging_other', event.target.value)}
                />
              </Field>
            )}
            <Field label="Transportwijze">
              <select
                className={styles.intakeInput}
                value={draft.freight}
                onChange={(event) => set('freight', event.target.value)}
              >
                <option value="">—</option>
                {INTAKE_FREIGHT.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Afmetingen & gewicht" wide>
              <textarea
                className={styles.intakeTextarea}
                rows={3}
                value={draft.dimensions_weight}
                onChange={(event) => set('dimensions_weight', event.target.value)}
                placeholder="2 pallets 120x80x150, 340 kg totaal"
              />
            </Field>
          </div>
        </div>
      </fieldset>

      {!locked && (
        <div className={styles.intakeActions}>
          <button
            type="button"
            className={styles.rowButton}
            disabled={!dirty || busy !== ''}
            onClick={save}
          >
            {busy === 'save' ? 'Saving…' : 'Save draft'}
          </button>

          <button
            type="button"
            className={styles.intakeRelease}
            disabled={busy !== '' || missing.length > 0}
            onClick={release}
          >
            {busy === 'release' ? 'Sending…' : 'Release and e-mail the team'}
          </button>

          <p className={styles.intakeHint}>
            {missing.length > 0 ? (
              <>Still to fill in: {missing.join(', ')}.</>
            ) : recipients?.count === 0 ? (
              <>
                Ready to send, but nobody would receive it. Staff accounts need
                a work e-mail address and warehouse notifications switched on.
              </>
            ) : sheet.revision > 1 ? (
              <>
                Sends a correction, marked as version {sheet.revision}, to{' '}
                {recipients === null
                  ? 'the rest of the staff'
                  : `${recipients.count} ${
                      recipients.count === 1 ? 'colleague' : 'colleagues'
                    }`}
                .
              </>
            ) : recipients === null ? (
              <>Ready to send.</>
            ) : (
              <>
                Goes to {recipients.count}{' '}
                {recipients.count === 1 ? 'colleague' : 'colleagues'}:{' '}
                {recipients.addresses.join(', ')}.
              </>
            )}
          </p>
        </div>
      )}
    </section>
  );
}

export default function Intake() {
  const [params, setParams] = useSearchParams();

  const list = useCollection(
    listIntakeSheets,
    {
      status: params.get('status') ?? '',
      freight: params.get('freight') ?? '',
    },
    params.get('search') ?? '',
  );

  // Which sheet is open, in the URL. That is what makes the link at the
  // bottom of the handover e-mail work: /dashboard/intake?sheet=41 opens the
  // sheet somebody was just told about.
  const openId = Number(params.get('sheet')) || null;

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [recipients, setRecipients] = useState(null);

  // Whether this person is themselves on the list when somebody else releases
  // a sheet. Their own preference, so it is read from the session rather than
  // from the recipients call - which deliberately leaves them out of its
  // count, since a release never mails the person who pressed the button.
  const { user, refreshUser } = useAuth();
  const [optOutBusy, setOptOutBusy] = useState(false);
  const mailsMe = user?.notifications?.warehouse ?? true;

  async function setMailsMe(enabled) {
    setOptOutBusy(true);

    try {
      await setWarehouseEmails(enabled);
      // Republished to everything holding the session, so the checkbox and
      // the header cannot disagree about what was just saved.
      await refreshUser();
    } catch {
      setError('That preference could not be saved. Try again in a moment.');
    } finally {
      setOptOutBusy(false);
    }
  }

  // Asked for once. The answer changes when somebody joins or leaves, which
  // is not something worth a request per sheet.
  useEffect(() => {
    let cancelled = false;

    getIntakeRecipients()
      .then((answer) => {
        if (!cancelled) setRecipients(answer);
      })
      // Left null, which the form reads as "not known" and says nothing
      // about. A failure to count colleagues must not look like having none.
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const open = useCallback(
    (id) => {
      const next = new URLSearchParams(params);

      if (id === null) next.delete('sheet');
      else next.set('sheet', String(id));

      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  async function startSheet() {
    setCreating(true);
    setError('');

    try {
      const sheet = await createIntakeSheet();
      list.reload();
      open(sheet.id);
    } catch {
      setError('A new sheet could not be started. Check the connection and try again.');
    } finally {
      setCreating(false);
    }
  }

  const sheet = list.rows.find((row) => row.id === openId) ?? null;

  return (
    <>
      <header className={styles.head}>
        <h1 className={styles.title}>Intake sheets</h1>
        <p className={styles.subtitle}>
          The warehouse form, filled in when goods come through the door. A
          draft is yours to work on; releasing one e-mails it to the rest of
          the staff so they can start the paperwork, and closes it to further
          edits.
        </p>
      </header>

      <Toolbar>
        <SearchInput
          value={list.searchInput}
          onChange={list.setSearchInput}
          label="Search intake sheets"
          placeholder="Search by reference, supplier, sender or destination"
        />
        <FilterSelect
          label="Status"
          value={list.filters.status}
          onChange={(value) => list.setFilter('status', value)}
          options={INTAKE_STATUSES}
          allLabel="Any status"
        />
        <FilterSelect
          label="Transportwijze"
          value={list.filters.freight}
          onChange={(value) => list.setFilter('freight', value)}
          options={INTAKE_FREIGHT}
          allLabel="Sea and air"
        />
        <button
          type="button"
          className={styles.newButton}
          onClick={startSheet}
          disabled={creating}
        >
          {creating ? 'Starting…' : 'New intake sheet'}
        </button>
      </Toolbar>

      <Banner tone="error">{error}</Banner>

      {/* Sits above the list rather than inside a sheet: it is a standing
          preference about every future handover, not a choice about this one.
          The dashboard has no settings page of its own, and this is the only
          screen on which the setting means anything. */}
      <label className={styles.intakeOptOut}>
        <input
          type="checkbox"
          checked={mailsMe}
          disabled={optOutBusy}
          onChange={(event) => setMailsMe(event.target.checked)}
        />
        <span>E-mail me intake sheets that colleagues release</span>
      </label>

      {list.state === 'loading' && <Loading inline />}
      {list.state === 'error' && <ConnectionError inline onRetry={list.reload} />}

      {list.state === 'ready' &&
        (list.rows.length === 0 ? (
          <Empty>No intake sheets match that.</Empty>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Sheet</th>
                  <th scope="col">Received</th>
                  <th scope="col">From</th>
                  <th scope="col">To</th>
                  <th scope="col">Goods</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((row) => (
                  <tr
                    key={row.id}
                    className={row.status === 'draft' ? styles.rowUnhandled : undefined}
                  >
                    <td>
                      <div className={styles.primaryCell}>{row.label}</div>
                      <div className={styles.mutedCell}>
                        {row.created_by_name || 'Unknown'}
                      </div>
                      <button
                        type="button"
                        className={styles.linkButton}
                        onClick={() => open(openId === row.id ? null : row.id)}
                      >
                        {openId === row.id ? 'Hide sheet' : 'Open sheet'}
                      </button>
                    </td>

                    <td className={styles.dateCell}>{formatDate(row.received_on)}</td>

                    <td>
                      <div>{row.supplier || row.sender || '—'}</div>
                      {row.pickup && (
                        <div className={styles.mutedCell}>
                          Opgehaald{row.pickup_location ? ` · ${row.pickup_location}` : ''}
                        </div>
                      )}
                    </td>

                    <td>
                      <div>{row.destination || '—'}</div>
                      <div className={styles.mutedCell}>{row.recipient}</div>
                    </td>

                    <td className={styles.numberCell}>
                      <div>
                        {row.colli_count ?? '—'} {row.packaging_display}
                      </div>
                      <div className={styles.mutedCell}>{row.freight_display}</div>
                      {/* The one thing on a sheet that changes what the
                          office does before they have opened it. */}
                      {row.damage_present === 'yes' && (
                        <div className={styles.intakeDamage}>Schade</div>
                      )}
                    </td>

                    <td>
                      <StatusBadge tone={TONES[row.status]}>
                        {row.status_display}
                      </StatusBadge>
                      {row.status === 'draft' && row.missing?.length > 0 && (
                        <div className={styles.mutedCell}>
                          {row.missing.length} still to fill in
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {/* Below the table rather than inside it: this is the whole paper sheet,
          and a form that size crammed into a table cell is unusable. Keyed on
          the sheet id so switching sheets builds a fresh form. */}
      {sheet && (
        <SheetForm
          key={sheet.id}
          sheet={sheet}
          recipients={recipients}
          onSaved={list.replaceRow}
          onReleased={list.replaceRow}
          onClose={() => open(null)}
        />
      )}

      <Pagination
        page={list.page}
        count={list.count}
        hasNext={list.hasNext}
        hasPrevious={list.hasPrevious}
        onChange={list.setPage}
      />
    </>
  );
}
