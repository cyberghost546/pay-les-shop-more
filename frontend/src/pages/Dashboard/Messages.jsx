// src/pages/Dashboard/Messages.jsx
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Loading from '../../components/Loading/Loading';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import { listMessages, updateMessage } from '../../api/staff';
import { useCollection } from './useCollection';
import { formatDateTime } from './format';
import {
  Banner,
  Empty,
  FilterSelect,
  Pagination,
  SearchInput,
  Toolbar,
} from './ui';
import styles from './Dashboard.module.css';

// Sent as strings, because a URL parameter is a string either way and the
// server reads "true"/"false" rather than guessing at "1" or "on".
const HANDLED_OPTIONS = [
  { value: 'false', label: 'Not yet handled' },
  { value: 'true', label: 'Handled' },
];

export default function Messages() {
  // The sidebar's quick views and the overview's stat cards link in with a
  // filter already applied, so the page opens on it rather than on "all".
  const [params] = useSearchParams();

  const list = useCollection(
    listMessages,
    { handled: params.get('handled') ?? '' },
    params.get('search') ?? '',
  );

  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  // Which messages are expanded. A set rather than one open id: staff compare
  // two messages side by side more often than they read one at a time.
  const [expanded, setExpanded] = useState(() => new Set());

  function toggle(id) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function setHandled(message, handled) {
    setSavingId(message.id);
    setError('');

    try {
      list.replaceRow(await updateMessage(message.id, { handled }));
    } catch {
      setError('That change could not be saved. Check the connection and try again.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <header className={styles.head}>
        <h1 className={styles.title}>Messages</h1>
        <p className={styles.subtitle}>
          Everything sent through the contact form. Marking one handled is a
          note to the rest of the team, not a reply — that goes by e-mail.
        </p>
      </header>

      <Toolbar>
        <SearchInput
          value={list.searchInput}
          onChange={list.setSearchInput}
          label="Search messages"
          placeholder="Search by name, e-mail, subject or message"
        />
        <FilterSelect
          label="Handled"
          value={list.filters.handled}
          onChange={(value) => list.setFilter('handled', value)}
          options={HANDLED_OPTIONS}
          allLabel="All messages"
        />
      </Toolbar>

      <Banner tone="error">{error}</Banner>

      {list.state === 'loading' && <Loading inline />}
      {list.state === 'error' && <ConnectionError inline onRetry={list.reload} />}

      {list.state === 'ready' &&
        (list.rows.length === 0 ? (
          <Empty>No messages match that.</Empty>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">From</th>
                  <th scope="col">Subject</th>
                  <th scope="col">Message</th>
                  <th scope="col">Received</th>
                  <th scope="col">
                    <span className={styles.srOnly}>Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((message) => {
                  const isOpen = expanded.has(message.id);

                  return (
                    <tr
                      key={message.id}
                      className={message.handled ? undefined : styles.rowUnhandled}
                    >
                      <td>
                        <div className={styles.primaryCell}>{message.name}</div>
                        <div className={styles.mutedCell}>
                          <a className={styles.link} href={`mailto:${message.email}`}>
                            {message.email}
                          </a>
                        </div>
                      </td>

                      <td>
                        {message.subject}
                        {message.language && (
                          <div className={styles.mutedCell}>
                            Wrote in {message.language.toUpperCase()}
                          </div>
                        )}
                      </td>

                      <td>
                        {/* Clamped to two lines by default; the whole thing is
                            one click away. Never dangerouslySetInnerHTML — a
                            stranger wrote this text. */}
                        <div className={isOpen ? undefined : styles.excerpt}>
                          {message.message}
                        </div>
                        <button
                          type="button"
                          className={styles.linkButton}
                          onClick={() => toggle(message.id)}
                        >
                          {isOpen ? 'Show less' : 'Read all'}
                        </button>
                      </td>

                      <td className={styles.dateCell}>
                        {formatDateTime(message.created_at)}
                      </td>

                      <td>
                        <button
                          type="button"
                          className={
                            message.handled
                              ? `${styles.rowButton} ${styles.rowButtonDone}`
                              : styles.rowButton
                          }
                          disabled={savingId === message.id}
                          onClick={() => setHandled(message, !message.handled)}
                        >
                          {message.handled ? '✓ Handled' : 'Mark handled'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
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
