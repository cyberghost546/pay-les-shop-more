// src/pages/Warehouse/DamageForm.jsx
//
// Damage in three taps: what kind, a line about it, and photos from the
// tablet's camera. The server checks each file really is an image.

import { useEffect, useMemo, useRef, useState } from 'react';
import { DAMAGE_TYPES, errorMessage, fieldError, reportDamage } from '../../api/warehouse';
import { fill } from '../../i18n/fill';
import { useLanguage } from '../../i18n/useLanguage';
import { Message } from './opsUi';
import styles from './Ops.module.css';

const MAX_PHOTOS = 6;
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp';

/**
 * @param {{ shipment: object, onSaved: (answer: {damage_report: object, shipment: object}) => void,
 *   onCancel: () => void }} props
 */
export default function DamageForm({ shipment, onSaved, onCancel }) {
  const { t } = useLanguage();
  const [type, setType] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [clientError, setClientError] = useState('');
  const fileInput = useRef(null);

  // Preview URLs are released when the photo list changes or the form goes.
  const previews = useMemo(() => photos.map((file) => URL.createObjectURL(file)), [photos]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  function addFiles(fileList) {
    const incoming = Array.from(fileList ?? []);
    const tooBig = incoming.find((file) => file.size > MAX_BYTES);
    if (tooBig) {
      setClientError(fill(t('dashboard.flow.damage.tooBig'), { name: tooBig.name }));
      return;
    }
    const next = [...photos, ...incoming].slice(0, MAX_PHOTOS);
    if (photos.length + incoming.length > MAX_PHOTOS) {
      setClientError(fill(t('dashboard.flow.damage.tooMany'), { max: MAX_PHOTOS }));
    } else {
      setClientError('');
    }
    setPhotos(next);
  }

  async function submit(event) {
    event.preventDefault();
    if (!type) {
      setClientError(t('dashboard.flow.damage.chooseType'));
      return;
    }
    if (type === 'other' && !description.trim()) {
      setClientError(t('dashboard.flow.damage.describe'));
      return;
    }

    setBusy(true);
    setError(null);
    setClientError('');
    try {
      const answer = await reportDamage(shipment.id, {
        damage_type: type,
        description: description.trim(),
        photos,
      });
      onSaved(answer);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  const serverMessage =
    fieldError(error, 'damage_type') ||
    fieldError(error, 'description') ||
    fieldError(error, 'photos') ||
    (error ? errorMessage(error, t('dashboard.flow.damage.saveError'), t) : '');

  return (
    <form onSubmit={submit} noValidate>
      <Message tone="error">{clientError || serverMessage}</Message>

      <div className={styles.choices} role="radiogroup" aria-label={t('dashboard.flow.damage.typeLabel')}>
        {DAMAGE_TYPES.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={type === option.value}
            className={`${styles.choice} ${type === option.value ? styles.choiceOn : ''}`}
            onClick={() => {
              setType(option.value);
              setClientError('');
            }}
          >
            {t(`dashboard.flow.damage.types.${option.value}`)}
          </button>
        ))}
      </div>

      <div className={styles.fields}>
        <label className={styles.field}>
          <span className={styles.label}>{t('dashboard.flow.damage.description')}{type === 'other' ? t('dashboard.flow.damage.required') : ''}</span>
          <textarea
            className={styles.textarea}
            value={description}
            maxLength={1000}
            placeholder={t('dashboard.flow.damage.descriptionPlaceholder')}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
      </div>

      <div className={styles.photos}>
        {previews.map((url, index) => (
          <span key={url} className={styles.photoPick}>
            <img src={url} alt={fill(t('dashboard.flow.damage.photo'), { number: index + 1 })} className={styles.photo} />
            <button
              type="button"
              className={styles.photoRemove}
              aria-label={fill(t('dashboard.flow.damage.removePhoto'), { number: index + 1 })}
              onClick={() => setPhotos((list) => list.filter((_, i) => i !== index))}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        // Opens the rear camera straight away on tablets and phones.
        capture="environment"
        multiple
        className={styles.fileInput}
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = '';
        }}
      />

      <div className={styles.buttonRow}>
        <button
          type="button"
          className={styles.secondary}
          disabled={photos.length >= MAX_PHOTOS}
          onClick={() => fileInput.current?.click()}
        >
          {photos.length ? fill(t('dashboard.flow.damage.addPhoto'), { count: photos.length, max: MAX_PHOTOS }) : t('dashboard.flow.damage.takePhoto')}
        </button>
        <button type="submit" className={styles.danger} disabled={busy}>
          {busy ? t('dashboard.flow.common.saving') : t('dashboard.flow.damage.submit')}
        </button>
        <button type="button" className={styles.secondary} onClick={onCancel}>
          {t('dashboard.flow.common.cancel')}
        </button>
      </div>
    </form>
  );
}
