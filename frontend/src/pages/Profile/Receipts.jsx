// src/pages/Profile/Receipts.jsx
//
// The profile page's upload section: the customer attaches the receipt for
// what they bought to the shipment carrying it, and the office can read it.
//
// Its own file rather than another block inside Profile.jsx, which is already
// eight hundred lines of five forms. This one has its own two requests and its
// own failure states and shares nothing with them but the card it sits in.

import { useEffect, useState } from 'react';
import FileDrop from '../../components/FileDrop/FileDrop';
import { formatBytes } from '../../components/FileDrop/formatBytes';
import { deleteDocument, listDocuments, uploadDocument } from '../../api/documents';
import { listPackages } from '../../api/profile';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './Profile.module.css';

// The kinds the API accepts, in the order a customer meets them.
const KINDS = ['receipt', 'invoice', 'customs', 'other'];

export default function Receipts() {
  const { t, language } = useLanguage();

  const [packages, setPackages] = useState([]);
  const [documents, setDocuments] = useState([]);
  // 'loading' | 'ready' | 'error'
  const [state, setState] = useState('loading');
  const [attempt, setAttempt] = useState(0);

  const [packageId, setPackageId] = useState('');
  const [kind, setKind] = useState('receipt');
  const [note, setNote] = useState('');
  // The file that has been chosen but not yet sent. Holding it here rather
  // than uploading the moment it is picked is what the send button is for:
  // it lets somebody see what they chose, say which shipment it belongs to
  // and describe it, and only then hand it over. Dropping the wrong file no
  // longer means it has already gone to the office.
  const [staged, setStaged] = useState(null);

  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => {
    let cancelled = false;

    // Both at once: the list of shipments to attach to, and what is already
    // attached. Sequentially would show an empty picker for a moment.
    Promise.all([listPackages(), listDocuments()])
      .then(([shipments, files]) => {
        if (cancelled) return;
        setPackages(shipments);
        setDocuments(files);
        // Preselect when there is only one, which is the common case: a
        // picker with a single option is a question not worth asking.
        if (shipments.length === 1) setPackageId(String(shipments[0].id));
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const dateFormat = new Intl.DateTimeFormat(language, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  /** Picking or dropping a file: held, not sent. */
  function handleFile(file) {
    setStaged(file);
    setProblem('');
    setDone('');
  }

  async function handleSend() {
    if (!staged) return;

    setBusy(true);
    setProblem('');
    setDone('');

    try {
      const saved = await uploadDocument({
        // Blank means "not for a shipment", which is a real answer: somebody
        // can have the receipt for a television before the parcel exists.
        packageId: packageId ? Number(packageId) : null,
        file: staged,
        kind,
        note: note.trim(),
      });

      setDocuments((current) => [saved, ...current]);
      // Cleared only on success. A failed send leaves the file staged and the
      // description typed, so trying again is one button rather than filling
      // the whole thing in a second time.
      setStaged(null);
      setNote('');
      setDone(t('profile.receipts.uploaded'));
    } catch (failure) {
      // The server's own words when it has any: "that file is named .pdf but
      // is not one" is the whole answer, and no wording here improves on it.
      const said = failure.fields?.file ?? failure.fields?.package;
      setProblem(
        said
          ? String(Array.isArray(said) ? said[0] : said)
          : t('profile.receipts.failed'),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(document) {
    setProblem('');
    setDone('');

    try {
      await deleteDocument(document.id);
      setDocuments((current) => current.filter((row) => row.id !== document.id));
    } catch {
      setProblem(t('profile.receipts.deleteFailed'));
    }
  }

  if (state === 'loading') {
    return <p className={styles.invoiceMessage}>{t('profile.receipts.loading')}</p>;
  }

  if (state === 'error') {
    return (
      <p className={styles.failure} role="alert">
        {t('profile.receipts.failed')}{' '}
        <button
          type="button"
          className={styles.linkButton}
          onClick={() => {
            setState('loading');
            setAttempt((n) => n + 1);
          }}
        >
          {t('profile.invoices.retry')}
        </button>
      </p>
    );
  }

  return (
    <>
      <p className={styles.cardIntro}>{t('profile.receipts.intro')}</p>

      <>
          <div className={styles.row}>
            {/* Only when there is something to choose between. A picker whose
                only option is "no shipment" is a question with one answer. */}
            {packages.length > 0 && (
              <label className={styles.field}>
                <span className={styles.label}>
                  {t('profile.receipts.shipment')}
                </span>
                <select
                  className={styles.input}
                  value={packageId}
                  onChange={(event) => setPackageId(event.target.value)}
                >
                  <option value="">{t('profile.receipts.noShipment')}</option>
                  {packages.map((shipment) => (
                    <option key={shipment.id} value={shipment.id}>
                      {shipment.tracking_number}
                      {shipment.description ? ` — ${shipment.description}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className={styles.field}>
              <span className={styles.label}>{t('profile.receipts.kind')}</span>
              <select
                className={styles.input}
                value={kind}
                onChange={(event) => setKind(event.target.value)}
              >
                {KINDS.map((value) => (
                  <option key={value} value={value}>
                    {t(`profile.receipts.kinds.${value}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className={styles.field}>
            <span className={styles.label}>{t('profile.receipts.note')}</span>
            <input
              className={styles.input}
              type="text"
              value={note}
              maxLength={255}
              placeholder={t('profile.receipts.notePlaceholder')}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>

          <FileDrop
            label={t('profile.receipts.fileLabel')}
            optionalLabel={t('profile.receipts.optional')}
            busy={busy}
            chooseLabel={
              staged
                ? t('profile.receipts.chooseOther')
                : t('profile.receipts.chooseFile')
            }
            dropLabel={t('profile.receipts.orDrop')}
            busyLabel={t('profile.receipts.uploading')}
            hint={t('profile.receipts.hint')}
            onFile={handleFile}
          />

          {/* What has been chosen and not yet sent. Nothing has left the
              browser at this point, which is the whole reason the send button
              below exists. */}
          {staged && (
            <div className={styles.staged}>
              <div className={styles.stagedText}>
                <p className={styles.stagedName}>{staged.name}</p>
                <p className={styles.invoiceMeta}>
                  {formatBytes(staged.size, language)} ·{' '}
                  {t('profile.receipts.notSentYet')}
                </p>
              </div>

              <div className={styles.invoiceRight}>
                <button
                  type="button"
                  className={styles.submit}
                  onClick={handleSend}
                  disabled={busy}
                >
                  {busy
                    ? t('profile.receipts.sending')
                    : t('profile.receipts.send')}
                </button>
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => setStaged(null)}
                  disabled={busy}
                >
                  {t('profile.receipts.discard')}
                </button>
              </div>
            </div>
          )}

          {problem && (
            <p className={styles.failure} role="alert">
              {problem}
            </p>
          )}
          {done && (
            <p className={styles.ok} role="status">
              {done}
            </p>
          )}
      </>

      {documents.length > 0 && (
        <ul className={styles.invoiceList}>
          {documents.map((document) => (
            <li key={document.id} className={styles.invoice}>
              <div className={styles.invoiceText}>
                <p className={styles.invoiceNumber}>{document.filename}</p>
                <p className={styles.invoiceMeta}>
                  {document.kindLabel} ·{' '}
                  {document.trackingNumber ?? t('profile.receipts.unlinked')} ·{' '}
                  {formatBytes(document.sizeBytes, language)} ·{' '}
                  {dateFormat.format(new Date(document.createdAt))}
                </p>
                {document.note && (
                  <p className={styles.invoiceMeta}>{document.note}</p>
                )}
                {/* Anything in this list has been sent — the office can read
                    it. Said out loud, because the send button above raises
                    the question of whether it went. */}
                <p className={styles.sentNote}>{t('profile.receipts.sent')}</p>
              </div>

              <div className={styles.invoiceRight}>
                <a
                  className={styles.invoiceDownload}
                  href={document.downloadUrl}
                  download
                >
                  {t('profile.receipts.download')}
                </a>
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => handleDelete(document)}
                >
                  {t('profile.receipts.remove')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
