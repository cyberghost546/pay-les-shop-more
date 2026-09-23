// src/pages/Dashboard/Shops.jsx
//
// The webshops the services page lists. These used to be a hard-coded list in
// the React app, so adding a shop meant a code change and a deploy; they are
// rows now, and this is where the office edits them.
//
// What each column does to the public page:
//
//   move     the arrows change where a shop sits on the services page. The
//            position is a number in the database, but nobody has to see or
//            type it: a move sends the whole running order and the server
//            renumbers in tens
//   shown    unticked hides the shop from the services page without losing
//            its logo and description, which is what a seasonal shop wants
//   logo     PNG, JPEG or WebP, 2 MB at most. Drop one straight onto a row's
//            logo to replace it, or use the button beside it. A shop with no
//            logo falls back to the one bundled with the site if the site has
//            one for that name, and to a lettered plate if it does not
//
// Every write here is refused by the server unless the session is staff. The
// page hiding itself from a customer is only tidiness.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Loading from '../../components/Loading/Loading';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import FileDrop from '../../components/FileDrop/FileDrop';
import {
  createShop,
  deleteShop,
  listAllShops,
  reorderShops,
  updateShop,
} from '../../api/shops';
import { apiUrl } from '../../api/client';
import { Banner, Empty, SearchInput, Toolbar } from './ui';
import styles from './Dashboard.module.css';

/** What the logo inputs accept, said once so the picker and the server agree. */
const LOGO_TYPES = 'image/png,image/jpeg,image/webp';

/** What a blank row in the "add a shop" form starts as. */
const BLANK = { name: '', url: '', description: '', logo: null };

/**
 * The first error the API reported, as one line.
 *
 * DRF answers a rejected write with `{field: [message, ...]}`, and showing
 * the raw object is how "[object Object]" ends up in front of somebody.
 */
function firstError(error, fallback = 'That could not be saved.') {
  const detail = error?.data ?? error?.detail;

  if (typeof detail === 'string') return detail;

  if (detail && typeof detail === 'object') {
    for (const value of Object.values(detail)) {
      if (typeof value === 'string') return value;
      if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
    }
  }

  return fallback;
}

/**
 * A thumbnail of a file the browser is holding but has not sent yet.
 *
 * The object URL is released when the file changes and when this unmounts:
 * until it is revoked the browser keeps the whole file in memory.
 */
function LogoPreview({ file, onClear }) {
  // Derived during render rather than set from an effect: the URL is a pure
  // function of the file, and going through state would render once without
  // it and again with it.
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  // Released when the file changes and when this unmounts.
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  if (!url) return null;

  return (
    <div className={styles.logoPreview}>
      <img src={url} alt="" className={styles.logoPreviewImage} />
      <span className={styles.logoPreviewName}>{file.name}</span>
      <button type="button" className={styles.linkButton} onClick={onClear}>
        Remove
      </button>
    </div>
  );
}

/**
 * A shop's logo in the table - and the drop target for replacing it.
 *
 * Dropping a file straight onto the logo is the shortest route there is from
 * "I have the new artwork" to "the website shows it", which is what this page
 * is for. The button beside it does the same thing for anyone not dragging.
 */
function LogoCell({ shop, onFile, disabled }) {
  // Counted rather than a boolean: dragging across a child element fires
  // dragleave on the parent, so a boolean flickers off halfway through.
  const [depth, setDepth] = useState(0);

  return (
    <span
      className={[styles.logoDrop, depth > 0 ? styles.logoDropActive : '']
        .filter(Boolean)
        .join(' ')}
      onDragEnter={(event) => {
        event.preventDefault();
        setDepth((n) => n + 1);
      }}
      onDragOver={(event) => {
        // Without this the browser navigates to the file instead of handing
        // it over, which looks exactly like the page crashing.
        event.preventDefault();
      }}
      onDragLeave={() => setDepth((n) => Math.max(0, n - 1))}
      onDrop={(event) => {
        event.preventDefault();
        setDepth(0);
        const [file] = event.dataTransfer.files ?? [];
        if (file && !disabled) onFile(file);
      }}
    >
      {shop.logo_url ? (
        <img
          // Straight from the API rather than through request(): this is an
          // <img>, so the browser fetches it itself. Same origin, so the
          // session cookie goes with it — which is what lets a hidden shop's
          // logo show here.
          src={apiUrl(shop.logo_url)}
          alt=""
          className={styles.shopLogo}
          loading="lazy"
        />
      ) : (
        <span className={styles.personAvatar} aria-hidden="true">
          {shop.name.charAt(0)}
        </span>
      )}
    </span>
  );
}

/** The form that adds a shop. */
function AddShop({ onAdded }) {
  const [draft, setDraft] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (field) => (event) =>
    setDraft((current) => ({ ...current, [field]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);

    try {
      await createShop({
        name: draft.name.trim(),
        url: draft.url.trim(),
        description: draft.description.trim(),
        logo: draft.logo ?? undefined,
      });

      setDraft(BLANK);
      onAdded();
    } catch (failure) {
      setError(firstError(failure, 'That shop could not be added.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.officeBox} onSubmit={submit}>
      <p className={styles.officeHead}>New shop</p>

      <div className={styles.officeGrid}>
        <label className={styles.officeField}>
          <span className={styles.officeLabel}>Name</span>
          <input
            className={styles.officeInput}
            value={draft.name}
            onChange={set('name')}
            required
            maxLength={80}
          />
        </label>

        <label className={styles.officeField}>
          <span className={styles.officeLabel}>Link</span>
          <input
            className={styles.officeInput}
            type="url"
            value={draft.url}
            onChange={set('url')}
            placeholder="https://www.example.nl/"
            required
          />
        </label>

        <label className={styles.officeField}>
          <span className={styles.officeLabel}>Description (optional)</span>
          <input
            className={styles.officeInput}
            value={draft.description}
            onChange={set('description')}
            maxLength={200}
          />
        </label>

        <div className={styles.officeField}>
          <FileDrop
            label="Logo"
            optionalLabel="optional"
            hint="PNG, JPEG or WebP. 2 MB at most."
            accept={LOGO_TYPES}
            chooseLabel="Choose a logo"
            dropLabel="or drop one here"
            disabled={busy}
            onFile={(file) => setDraft((current) => ({ ...current, logo: file }))}
          />

          <LogoPreview
            file={draft.logo}
            onClear={() => setDraft((current) => ({ ...current, logo: null }))}
          />
        </div>

      </div>

      <p className={styles.officeNote}>
        A new shop joins the top of the list; use the arrows to move it. The
        Dutch storefront, please — this is a forwarding service for parcels
        bought in the Netherlands, so a customer sent to the .com would land on
        a shop that will not deliver to the warehouse.
      </p>

      {error && <Banner tone="error">{error}</Banner>}

      <button type="submit" className={styles.rowButton} disabled={busy}>
        {busy ? 'Adding…' : 'Add shop'}
      </button>
    </form>
  );
}

/** One row, editable in place. */
function ShopRow({ shop, onChanged, onError, onMove, isFirst, isLast }) {
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const save = useCallback(
    async (changes) => {
      setBusy(true);
      try {
        await updateShop(shop.id, changes);
        onChanged();
      } catch (failure) {
        onError(firstError(failure));
      } finally {
        setBusy(false);
      }
    },
    [shop.id, onChanged, onError],
  );

  /** Commits a text field only when it actually changed, on blur. */
  const commit = (field) => (event) => {
    const value = event.target.value.trim();
    if (value === (shop[field] ?? '')) return;
    save({ [field]: value });
  };

  async function remove() {
    // Deleting takes the shop off a public page, and there is no undo.
    if (!window.confirm(`Remove ${shop.name} from the services page?`)) return;

    setBusy(true);
    try {
      await deleteShop(shop.id);
      onChanged();
    } catch (failure) {
      onError(firstError(failure, 'That shop could not be removed.'));
      setBusy(false);
    }
  }

  return (
    <tr className={busy ? styles.rowBusy : undefined}>
      <td>
        <div className={styles.moveCell}>
          <button
            type="button"
            className={styles.moveButton}
            onClick={() => onMove(-1)}
            disabled={busy || isFirst}
            // The name is in the label, not just the arrow: a screen reader
            // reading eight rows of "Move up" cannot tell them apart.
            aria-label={`Move ${shop.name} up`}
          >
            <span aria-hidden="true">↑</span>
          </button>
          <button
            type="button"
            className={styles.moveButton}
            onClick={() => onMove(1)}
            disabled={busy || isLast}
            aria-label={`Move ${shop.name} down`}
          >
            <span aria-hidden="true">↓</span>
          </button>
        </div>
      </td>

      <td>
        <LogoCell
          shop={shop}
          disabled={busy}
          onFile={(file) => save({ logo: file })}
        />
      </td>

      <td>
        <input
          className={styles.officeInput}
          defaultValue={shop.name}
          aria-label={`Name of ${shop.name}`}
          onBlur={commit('name')}
          maxLength={80}
        />
      </td>

      <td>
        <input
          className={styles.officeInput}
          type="url"
          defaultValue={shop.url}
          aria-label={`Link for ${shop.name}`}
          onBlur={commit('url')}
        />
      </td>

      <td>
        <input
          className={styles.officeInput}
          defaultValue={shop.description}
          aria-label={`Description of ${shop.name}`}
          onBlur={commit('description')}
          maxLength={200}
        />
      </td>

      <td>
        <label className={styles.shownToggle}>
          <input
            type="checkbox"
            checked={shop.is_active}
            aria-label={`Show ${shop.name} on the services page`}
            onChange={(event) => save({ is_active: event.target.checked })}
          />
          <span className={styles.srOnly}>Shown</span>
        </label>
      </td>

      <td className={styles.actionsCell}>
        {/* The file input is the control; the button is what anybody sees. */}
        <input
          ref={fileRef}
          className={styles.srOnly}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label={`Replace the logo for ${shop.name}`}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) save({ logo: file });
            // Cleared, so choosing the same file twice fires change again.
            event.target.value = '';
          }}
        />
        <button
          type="button"
          className={styles.linkButton}
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          {shop.logo_url ? 'Replace logo' : 'Add logo'}
        </button>

        <button
          type="button"
          className={styles.linkButton}
          onClick={remove}
          disabled={busy}
        >
          Remove
        </button>
      </td>
    </tr>
  );
}

export default function Shops() {
  const [shops, setShops] = useState([]);
  const [status, setStatus] = useState('loading');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setShops(await listAllShops({ search }));
      setStatus('ready');
    } catch {
      setStatus('failed');
    }
  }, [search]);

  useEffect(() => {
    let cancelled = false;

    // Debounced, so typing a name is one request rather than several.
    const timer = setTimeout(() => {
      if (!cancelled) load();
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [load]);

  const refresh = useCallback(() => {
    setError('');
    load();
  }, [load]);

  /**
   * Move the shop at `index` one place up (-1) or down (+1).
   *
   * The new order is shown straight away and sent afterwards, because waiting
   * on a round trip to see a row move makes the arrows feel broken. A refusal
   * puts the old order back, so what is on screen is never a move the server
   * did not make.
   */
  const move = useCallback(
    async (index, delta) => {
      const target = index + delta;
      if (target < 0 || target >= shops.length) return;

      const next = [...shops];
      [next[index], next[target]] = [next[target], next[index]];

      const previous = shops;
      setShops(next);
      setError('');

      try {
        await reorderShops(next.map((shop) => shop.id));
      } catch (failure) {
        setShops(previous);
        setError(firstError(failure, 'That shop could not be moved.'));
      }
    },
    [shops],
  );

  if (status === 'loading') return <Loading />;
  if (status === 'failed') return <ConnectionError onRetry={refresh} />;

  return (
    <>
      <header className={styles.head}>
        <h1 className={styles.title}>Shops</h1>
        <p className={styles.subtitle}>
          The webshops listed on the services page. Changes here are live on the
          website as soon as they are saved.
        </p>
      </header>

      <AddShop onAdded={refresh} />

      <Toolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          label="Search shops"
          placeholder="Search by name"
        />
      </Toolbar>

      {error && <Banner tone="error">{error}</Banner>}

      {shops.length === 0 ? (
        <Empty>No shops match that.</Empty>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Move</th>
                <th scope="col">Logo</th>
                <th scope="col">Name</th>
                <th scope="col">Link</th>
                <th scope="col">Description</th>
                <th scope="col">Shown</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shops.map((shop, index) => (
                <ShopRow
                  key={shop.id}
                  shop={shop}
                  onChanged={refresh}
                  onError={setError}
                  onMove={(delta) => move(index, delta)}
                  isFirst={index === 0}
                  isLast={index === shops.length - 1}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
