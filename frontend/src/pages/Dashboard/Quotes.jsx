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

  return (
    <>
      <header className={styles.head}>
        <h1 className={styles.title}>Quote requests</h1>
        <p className={styles.subtitle}>
          Submissions from the destination pages. The request itself is a
          record of what a visitor sent, so only the status can be changed.
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
                    className={quote.status === 'new' ? styles.rowUnhandled : undefined}
                  >
                    <td>
                      <div className={styles.primaryCell}>{quote.full_name}</div>
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
