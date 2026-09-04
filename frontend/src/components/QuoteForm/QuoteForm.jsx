// src/components/QuoteForm/QuoteForm.jsx
import { useRef, useState } from 'react';
import {
  ACCEPTED_FILE_TYPES,
  ACCEPT_ATTRIBUTE,
  MAX_FILE_BYTES,
  requestQuote,
} from '../../api/quote';
import { API_ERRORS } from '../../api/client';
import { useLanguage } from '../../i18n/useLanguage';
import styles from './QuoteForm.module.css';

const SUPPORT_EMAIL = 'info@paylesshopmore.com';

const EMPTY_FORM = { firstName: '', lastName: '', email: '', message: '' };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** "1.4 MB", so someone can see at a glance whether they are near the limit. */
function formatSize(bytes) {
  const mb = bytes / (1024 * 1024);
  return mb >= 0.1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

// Returns translation keys, so errors on screen follow a language change.
function validate({ firstName, lastName, email }, file) {
  const errors = {};

  if (!firstName.trim())
    errors.firstName = 'destination.quote.errors.firstNameRequired';
  if (!lastName.trim())
    errors.lastName = 'destination.quote.errors.lastNameRequired';

  if (!email.trim()) errors.email = 'destination.quote.errors.emailRequired';
  else if (!EMAIL_PATTERN.test(email.trim()))
    errors.email = 'destination.quote.errors.emailInvalid';

  // The file is optional — the copy tells people they can describe their list
  // in the message instead — but if one is attached it has to be usable.
  if (file) {
    if (!ACCEPTED_FILE_TYPES.includes(file.type))
      errors.file = 'destination.quote.errors.fileType';
    else if (file.size > MAX_FILE_BYTES)
      errors.file = 'destination.quote.errors.fileTooLarge';
  }

  return errors;
}

const FAILURE_KEYS = {
  [API_ERRORS.RATE_LIMITED]: 'destination.quote.errors.tooMany',
  [API_ERRORS.VALIDATION]: 'destination.quote.errors.invalid',
  [API_ERRORS.UNAVAILABLE]: 'destination.quote.errors.offline',
};

/**
 * @param {{ destination: string }} props the island name, sent with the request
 */
export default function QuoteForm({ destination }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [failureKey, setFailureKey] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);
  const { t, language } = useLanguage();

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function acceptFile(chosen) {
    setFile(chosen ?? null);
    setErrors((current) => {
      if (!current.file) return current;
      const next = { ...current };
      delete next.file;
      return next;
    });
  }

  function handleFileChange(event) {
    acceptFile(event.target.files?.[0] ?? null);
  }

  function clearFile() {
    setFile(null);
    // The input keeps its own value; without this, picking the same file again
    // fires no change event.
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // Dropping a file is the obvious gesture over an area this shape. The button
  // still works, so nothing depends on being able to drag.
  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    acceptFile(event.dataTransfer.files?.[0] ?? null);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const found = validate(form, file);
    setErrors(found);
    setFailureKey(null);
    setSent(false);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    try {
      await requestQuote({
        destination,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        message: form.message.trim(),
        file,
        language,
      });
      setForm(EMPTY_FORM);
      clearFile();
      setSent(true);
    } catch (error) {
      setFailureKey(
        FAILURE_KEYS[error.code] ?? 'destination.quote.errors.offline',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        <header className={styles.head}>
          {/* The form is per-island and says which one. Without it, someone
              who scrolled straight here has no way to tell. */}
          {destination && (
            <p className={styles.forIsland}>
              {t('destination.quote.forIsland')} <b>{destination}</b>
            </p>
          )}
          <h2 className={styles.title}>{t('destination.quote.title')}</h2>
          <p className={styles.intro}>{t('destination.quote.intro')}</p>
        </header>

        <div className={styles.card}>
          {failureKey && (
            <p className={styles.failure} role="alert">
              {t(failureKey)}
            </p>
          )}

          {sent && (
            <p className={styles.success} role="status">
              {t('destination.quote.sent')}
            </p>
          )}

          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <div className={styles.row}>
              <label className={styles.field}>
                <span className={styles.label}>
                  {t('destination.quote.firstName')}
                  <span className={styles.required} aria-hidden="true">
                    {' '}
                    *
                  </span>
                </span>
                <input
                  className={styles.input}
                  type="text"
                  name="firstName"
                  value={form.firstName}
                  onChange={handleChange}
                  autoComplete="given-name"
                  required
                  aria-invalid={Boolean(errors.firstName)}
                />
                {errors.firstName && (
                  <span className={styles.error}>{t(errors.firstName)}</span>
                )}
              </label>

              <label className={styles.field}>
                <span className={styles.label}>
                  {t('destination.quote.lastName')}
                  <span className={styles.required} aria-hidden="true">
                    {' '}
                    *
                  </span>
                </span>
                <input
                  className={styles.input}
                  type="text"
                  name="lastName"
                  value={form.lastName}
                  onChange={handleChange}
                  autoComplete="family-name"
                  required
                  aria-invalid={Boolean(errors.lastName)}
                />
                {errors.lastName && (
                  <span className={styles.error}>{t(errors.lastName)}</span>
                )}
              </label>

              <label className={styles.field}>
                <span className={styles.label}>
                  {t('destination.quote.email')}
                  <span className={styles.required} aria-hidden="true">
                    {' '}
                    *
                  </span>
                </span>
                <input
                  className={styles.input}
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  autoComplete="email"
                  required
                  aria-invalid={Boolean(errors.email)}
                />
                {errors.email && (
                  <span className={styles.error}>{t(errors.email)}</span>
                )}
              </label>
            </div>

            <div className={styles.field}>
              <span className={styles.label}>
                {t('destination.quote.upload')}
                <span className={styles.optional}>
                  {t('destination.quote.optional')}
                </span>
              </span>

              {/* The native file input is unstyleable across browsers, so it is
                  hidden and driven by the label beside it. Keeping it a real
                  input is what makes the keyboard and the file picker work. */}
              <div
                className={[
                  styles.dropzone,
                  dragging && styles.dropzoneActive,
                  file && styles.dropzoneFilled,
                  errors.file && styles.dropzoneError,
                ]
                  .filter(Boolean)
                  .join(' ')}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  className={styles.fileInput}
                  type="file"
                  id="quote-file"
                  accept={ACCEPT_ATTRIBUTE}
                  onChange={handleFileChange}
                  aria-invalid={Boolean(errors.file)}
                />

                {file ? (
                  <div className={styles.chosen}>
                    <span className={styles.fileIcon} aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7Z" />
                        <path d="M14 3v4h4" />
                      </svg>
                    </span>
                    <span className={styles.fileMeta}>
                      <span className={styles.fileName}>{file.name}</span>
                      <span className={styles.fileSize}>
                        {formatSize(file.size)}
                      </span>
                    </span>
                    <button
                      type="button"
                      className={styles.removeFile}
                      onClick={clearFile}
                    >
                      {t('destination.quote.removeFile')}
                    </button>
                  </div>
                ) : (
                  <>
                    <span className={styles.uploadIcon} aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path d="M12 16V4" />
                        <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
                        <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
                      </svg>
                    </span>
                    <p className={styles.dropText}>
                      <label htmlFor="quote-file" className={styles.browse}>
                        {t('destination.quote.chooseFile')}
                      </label>{' '}
                      {t('destination.quote.orDrop')}
                    </p>
                    <p className={styles.hint}>
                      {t('destination.quote.uploadHint')}
                    </p>
                  </>
                )}
              </div>

              {errors.file && (
                <span className={styles.error}>{t(errors.file)}</span>
              )}

              {/* One instruction, in the one place the decision is made. The
                  page used to answer this twice, differently: once above the
                  form saying to use the message box, once here saying to send
                  an e-mail. */}
              <p className={styles.note}>
                {t('destination.quote.filesNote')}{' '}
                <a href={`mailto:${SUPPORT_EMAIL}`} className={styles.mailLink}>
                  {SUPPORT_EMAIL}
                </a>
              </p>
            </div>

            <label className={styles.field}>
              <span className={styles.label}>
                {t('destination.quote.message')}
                <span className={styles.optional}>
                  {t('destination.quote.optional')}
                </span>
              </span>
              <textarea
                className={styles.textarea}
                name="message"
                rows={7}
                value={form.message}
                onChange={handleChange}
                placeholder={t('destination.quote.messagePlaceholder')}
              />
            </label>

            <div className={styles.actions}>
              <button type="submit" className={styles.submit} disabled={busy}>
                {busy
                  ? t('destination.quote.sending')
                  : t('destination.quote.send')}
              </button>
              <p className={styles.requiredNote}>
                {t('destination.quote.requiredNote')}
              </p>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
