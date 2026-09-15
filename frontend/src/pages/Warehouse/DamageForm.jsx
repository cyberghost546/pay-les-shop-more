// src/pages/Warehouse/DamageForm.jsx
//
// Damage in three taps: what kind, a line about it, and photos from the
// tablet's camera. The server checks each file really is an image.

import { useEffect, useMemo, useRef, useState } from 'react';
import { DAMAGE_TYPES, errorMessage, fieldError, reportDamage } from '../../api/warehouse';
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
      setClientError(`${tooBig.name} is larger than 10 MB.`);
      return;
    }
    const next = [...photos, ...incoming].slice(0, MAX_PHOTOS);
    if (photos.length + incoming.length > MAX_PHOTOS) {
      setClientError(`At most ${MAX_PHOTOS} photos. The extra ones were left out.`);
    } else {
      setClientError('');
    }
    setPhotos(next);
  }

  async function submit(event) {
    event.preventDefault();
    if (!type) {
      setClientError('Choose what kind of damage it is.');
      return;
    }
    if (type === 'other' && !description.trim()) {
      setClientError('Describe the damage.');
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
    (error ? errorMessage(error, 'The damage report could not be saved. Try again.') : '');

  return (
    <form onSubmit={submit} noValidate>
      <Message tone="error">{clientError || serverMessage}</Message>

      <div className={styles.choices} role="radiogroup" aria-label="Damage type">
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
            {option.label}
          </button>
        ))}
      </div>

      <div className={styles.fields}>
        <label className={styles.field}>
          <span className={styles.label}>Description{type === 'other' ? ' (required)' : ''}</span>
          <textarea
            className={styles.textarea}
            value={description}
            maxLength={1000}
            placeholder="Where is the damage and how bad is it?"
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
      </div>

      <div className={styles.photos}>
        {previews.map((url, index) => (
          <span key={url} className={styles.photoPick}>
            <img src={url} alt={`Damage photo ${index + 1}`} className={styles.photo} />
            <button
              type="button"
              className={styles.photoRemove}
              aria-label={`Remove photo ${index + 1}`}
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
          {photos.length ? `Add photo (${photos.length}/${MAX_PHOTOS})` : 'Take photo'}
        </button>
        <button type="submit" className={styles.danger} disabled={busy}>
          {busy ? 'Saving…' : 'Report damage'}
        </button>
        <button type="button" className={styles.secondary} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
