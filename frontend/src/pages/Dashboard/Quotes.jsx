// src/pages/Dashboard/Quotes.jsx
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Loading from '../../components/Loading/Loading';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import { QUOTE_STATUSES, listQuotes, updateQuote } from '../../api/staff';
import { useCollection } from './useCollection';
import { formatDateTime } from './format';
import {
  Banner,
  Empty,
  FilterSelect,
  Pagination,
  SearchInput,
  StatusSelect,
  Toolbar,
} from './ui';
import styles from './Dashboard.module.css';

export default function Quotes() {
  // The overview's stat cards link here with ?status=new, so the filter reads
  // its starting value from the URL rather than always opening on "all".
  const [params] = useSearchParams();

  const list = useCollection(
    listQuotes,
    { status: params.get('status') ?? '', destination: '' },
    params.get('search') ?? '',
  );

  // Which row is mid-save, and what went wrong if anything did.
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');

  // Whose request is open in the panel under the table. One at a time: this is
  // somebody reading a request, not comparing two.
  const [openId, setOpenId] = useState(null);

  async function changeStatus(quote, status) {
    setSavingId(quote.id);
    setError('');

    try {
      // The server's version of the row, not a locally patched one: it also
      // carries updated_at and status_display.
      list.replaceRow(await updateQuote(quote.id, { status }));
    } catch {
      setError('That change could not be saved. Check the connection and try again.');
    } finally {
      setSavingId(null);
    }
  }

  // Read off the rows rather than kept as a second copy, so a status change
  // shows in the panel the moment the table has it.
  const open = list.rows.find((quote) => quote.id === openId) ?? null;

  return (
    <>
      <header className={styles.head}>
        <h1 className={styles.title}>Quote requests</h1>
        <p className={styles.subtitle}>
          Submissions from the destination pages. Open a name to read the whole
          request and its document. The request itself is a record of what a
          visitor sent, so only the status can be changed.
        </p>
      </header>

      <Toolbar>
        <SearchInput
          value={list.searchInput}
          onChange={list.setSearchInput}
          label="Search quote requests"
          placeholder="Search by name, e-mail, message or destination"
        />
        <FilterSelect
          label="Status"
          value={list.filters.status}
          onChange={(value) => list.setFilter('status', value)}
          options={QUOTE_STATUSES}
          allLabel="Any status"
        />
      </Toolbar>

      <Banner tone="error">{error}</Banner>

      {list.state === 'loading' && <Loading inline />}
      {list.state === 'error' && <ConnectionError inline onRetry={list.reload} />}

      {list.state === 'ready' &&
        (list.rows.length === 0 ? (
          <Empty>No quote requests match that.</Empty>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Requested by</th>
                  <th scope="col">Destination</th>
                  <th scope="col">Message</th>
                  <th scope="col">Received</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((quote) => (
                  <tr
                    key={quote.id}
                    className={[
                      styles.rowOpens,
                      quote.status === 'new' ? styles.rowUnhandled : '',
                      openId === quote.id ? styles.rowOpen : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    // Anywhere on the row opens it, as on the bookings table.
                    // A click that landed on the mailto, the attachment link
                    // or the status select is that control's own, so those are
                    // let through rather than swallowed.
                    onClick={(event) => {
                      if (event.target.closest('a, button, select, input, label')) {
                        return;
                      }
                      setOpenId((current) =>
                        current === quote.id ? null : quote.id,
                      );
                    }}
                  >
                    <td>
                      {/* The name is also a button: on a keyboard there is no
                          row to click, and this is what is reached instead. */}
                      <button
                        type="button"
                        className={styles.rowName}
                        aria-expanded={openId === quote.id}
                        onClick={() =>
                          setOpenId((current) =>
                            current === quote.id ? null : quote.id,
                          )
                        }
                      >
                        {quote.full_name}
                      </button>
                      <div className={styles.mutedCell}>
                        {/* mailto, because replying is what happens next. */}
                        <a className={styles.link} href={`mailto:${quote.email}`}>
                          {quote.email}
                        </a>
                      </div>
                    </td>

                    <td>
                      {quote.destination}
                      {quote.language && (
                        <div className={styles.mutedCell}>
                          Wrote in {quote.language.toUpperCase()}
                        </div>
                      )}
                    </td>

                    <td>
                      <div className={styles.excerpt}>
                        {quote.message || <span className={styles.mutedCell}>—</span>}
                      </div>
                      {quote.file_url && (
                        <a
                          className={styles.link}
                          href={quote.file_url}
                          target="_blank"
                          // noreferrer as well as noopener: the attachment was
                          // uploaded by a member of the public.
                          rel="noreferrer"
                        >
                          Open attachment ↗
                        </a>
                      )}
                    </td>

                    <td className={styles.dateCell}>
                      {formatDateTime(quote.created_at)}
                    </td>

                    <td>
                      {/* The select is the status display as well as the
                          control — a badge beside it would say the same word
                          twice. The row stripe carries the urgency instead. */}
                      <StatusSelect
                        label={`Status for ${quote.full_name}`}
                        value={quote.status}
                        options={QUOTE_STATUSES}
                        busy={savingId === quote.id}
                        onChange={(value) => changeStatus(quote, value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {/* The whole request, below the table rather than inside it: the message
          is the part a cell clips, and it is the part somebody opened the row
          to read. Keyed by the row, so moving between two people rebuilds the
          panel instead of carrying one person's scroll onto the other. */}
      {open && (
        <section key={open.id} className={styles.detail}>
          <div className={styles.detailHead}>
            <h2 className={styles.detailTitle}>{open.full_name}</h2>
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => setOpenId(null)}
            >
              Close
            </button>
          </div>

          <dl className={styles.detailGrid}>
            <div>
              <dt>E-mail</dt>
              <dd>
                <a className={styles.link} href={`mailto:${open.email}`}>
                  {open.email}
                </a>
              </dd>
            </div>
            <div>
              <dt>Destination</dt>
              <dd>{open.destination}</dd>
            </div>
            <div>
              <dt>Wrote in</dt>
              <dd>{open.language ? open.language.toUpperCase() : '—'}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{open.status_display ?? open.status}</dd>
            </div>
            <div>
              <dt>Received</dt>
              <dd>{formatDateTime(open.created_at)}</dd>
            </div>
            <div>
              <dt>Last changed</dt>
              <dd>{formatDateTime(open.updated_at)}</dd>
            </div>
            <div>
              <dt>Reference</dt>
              {/* What the Django admin and a support conversation call this
                  request. Monospaced so it reads back accurately. */}
              <dd className={styles.mono}>#{open.id}</dd>
            </div>

            <div className={styles.detailWide}>
              <dt>Message</dt>
              {/* Whole and unclipped, with the visitor's own line breaks: a
                  list typed one item per line is unreadable run together. */}
              <dd className={styles.messageBody}>{open.message || '—'}</dd>
            </div>

            <div className={styles.detailWide}>
              <dt>Document</dt>
              <dd>
                {open.file_url ? (
                  <>
                    <a
                      className={styles.link}
                      href={open.file_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {open.file_name || 'Attachment'} ↓
                    </a>
                    {/* Said out loud, because the link looks like one that
                        would show the file and deliberately does not: an
                        attachment from a stranger is handed over as a download
                        rather than rendered in a tab. */}
                    <div className={styles.mutedCell}>
                      Saves to your computer rather than opening in the browser
                      — attachments come from members of the public.
                    </div>
                  </>
                ) : (
                  'Nothing attached.'
                )}
              </dd>
            </div>
          </dl>
        </section>
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
