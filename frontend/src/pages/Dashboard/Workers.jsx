// src/pages/Dashboard/Workers.jsx
//
// The people who work here: admins, office staff, the warehouse floor and the
// drivers. The same User rows the Customers page lists, from the same
// endpoint — an account is one record whichever page it is opened from — but
// asked for by role, which is the one question that separates a colleague
// from a customer.
//
// Why by role and not by a flag: `is_staff` is the office and Django's own
// /admin/, `is_warehouse` is the floor. A driver carries neither, so a list
// built from the flags would quietly leave the drivers out. The role is the
// single word the two flags are set from, and it is what this page filters,
// groups and sorts by.

import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Loading from '../../components/Loading/Loading';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import {
  WORKER_ROLES,
  roleLabel,
  createCustomer,
  listWorkers,
  setCustomerRole,
  updateCustomer,
} from '../../api/staff';
import { useAuth } from '../../auth/useAuth';
import { useCollection } from './useCollection';
import { ContactFields, Field } from './PeopleFields';
import { initialsOf, whyRoleIsFixed } from './people';
import { formatDate } from './format';
import {
  Banner,
  Empty,
  FilterSelect,
  Pagination,
  SearchInput,
  StatusBadge,
  StatusSelect,
  Toolbar,
} from './ui';
import styles from './Dashboard.module.css';

/** What each role may open, said once beside the group it heads. */
const ROLE_REACH = {
  admin: 'The whole back office, roles included, and Django’s own admin.',
  office: 'The back office and the warehouse screens. Not roles.',
  warehouse: 'The scanner and the intake sheets. Nothing else.',
  driver: 'No dashboard — a driver is a name on a delivery, not an account with screens.',
};

/** An empty new-colleague form. Office worker is the common case. */
const BLANK_WORKER = {
  first_name: '',
  last_name: '',
  email: '',
  phone_number: '',
  role: 'office',
};

/**
 * Opening an account for a new colleague.
 *
 * As on the Customers page there is no password field, and its absence is the
 * feature: the account is created unusable and its owner is e-mailed a link
 * to choose their own, so nobody hands a colleague a password over a desk.
 *
 * Only an admin may hand out a staff role — the server refuses the rest — so
 * the form is not offered to anybody else rather than being offered and
 * refused.
 */
function NewWorkerFields({ onCreate, busy, errors }) {
  const [draft, setDraft] = useState(BLANK_WORKER);

  function set(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  return (
    <form
      className={styles.officeBox}
      onSubmit={(event) => {
        event.preventDefault();
        // Cleared only on success, which is the caller's business: a failed
        // save must not throw away what somebody just typed.
        onCreate(draft, () => setDraft(BLANK_WORKER));
      }}
    >
      <p className={styles.officeHead}>New colleague</p>

      <div className={styles.officeGrid}>
        <Field
          label="First name"
          name="first_name"
          value={draft.first_name}
          onChange={(value) => set('first_name', value)}
          errors={errors}
        />
        <Field
          label="Last name"
          name="last_name"
          value={draft.last_name}
          onChange={(value) => set('last_name', value)}
          errors={errors}
        />
        <Field
          label="E-mail"
          name="email"
          type="email"
          value={draft.email}
          onChange={(value) => set('email', value)}
          errors={errors}
        />
        <Field
          label="Phone"
          name="phone_number"
          type="tel"
          value={draft.phone_number}
          onChange={(value) => set('phone_number', value)}
          errors={errors}
        />
        <Field
          label="Role"
          name="role"
          value={draft.role}
          onChange={(value) => set('role', value)}
          options={WORKER_ROLES}
          errors={errors}
        />
      </div>

      <p className={styles.officeNote}>
        {ROLE_REACH[draft.role]} They sign in with this e-mail address. No
        password is set here — they are e-mailed a link to choose their own.
      </p>

      <button type="submit" className={styles.rowButton} disabled={busy}>
        {busy ? 'Creating…' : 'Create account and send the invitation'}
      </button>
    </form>
  );
}

export default function Workers() {
  const [params] = useSearchParams();
  // `user` for two things: wording the greyed-out role, and noticing when the
  // row being edited is the account this staff member is signed in as — the
  // header renders from the same copy and would otherwise go stale.
  const { user, refreshUser } = useAuth();

  // `role` empty means every worker role; the filter narrows it to one.
  // listWorkers turns an empty value into the server's `worker` set, so a
  // customer never appears on this page whatever the URL says.
  const list = useCollection(
    listWorkers,
    { role: params.get('role') ?? '' },
    params.get('search') ?? '',
  );

  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const [creating, setCreating] = useState(false);
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [createErrors, setCreateErrors] = useState({});
  const [created, setCreated] = useState('');

  async function addWorker(draft, clear) {
    setCreatingBusy(true);
    setCreateErrors({});
    setCreated('');
    setError('');

    try {
      const row = await createCustomer(draft);

      clear();
      setCreating(false);
      setCreated(
        `${row.name || row.email} now has a ${roleLabel(row.role).toLowerCase()} ` +
          `account. An invitation to choose a password has been sent to ${row.email}.`,
      );
      // Refetched rather than spliced in: the list is sorted and paged by the
      // server, and a row pushed onto the front of page three would sit
      // somewhere it does not belong.
      list.reload();
    } catch (caught) {
      if (caught?.fields) setCreateErrors(caught.fields);
      else if (caught?.status === 403)
        setError('Only an admin can open an account with a staff role.');
      else setError('That account could not be created. Check the connection and try again.');
    } finally {
      setCreatingBusy(false);
    }
  }

  async function changeRole(worker, role) {
    setSavingId(worker.id);
    setError('');

    try {
      const row = await setCustomerRole(worker.id, role);

      // Moving somebody to Customer takes them off this page altogether, so
      // the list is refetched rather than the row swapped in — leaving a
      // customer sitting in a table of colleagues is the one thing this page
      // exists to prevent.
      if (row.role === 'customer') list.reload();
      else list.replaceRow(row);
    } catch (caught) {
      setError(
        caught?.status === 403
          ? 'That account’s role cannot be changed from here.'
          : 'That change could not be saved. Check the connection and try again.',
      );
    } finally {
      setSavingId(null);
    }
  }

  /** Saves the contact details, and answers with the whole row. */
  async function save(worker, write) {
    setSavingId(worker.id);
    setError('');
    setFieldErrors({});

    try {
      list.replaceRow(await write());

      // Editing your own row means editing the account you are signed in as.
      if (user?.id === worker.id) await refreshUser();
    } catch (caught) {
      if (caught?.fields) setFieldErrors(caught.fields);

      setError(
        caught?.fields
          ? 'That change was refused — see the fields below.'
          : 'That change could not be saved. Check the connection and try again.',
      );
    } finally {
      setSavingId(null);
    }
  }

  function toggle(worker) {
    setFieldErrors({});
    setError('');
    setOpenId((current) => (current === worker.id ? null : worker.id));
  }

  const open = list.rows.find((worker) => worker.id === openId) ?? null;

  // The rows in role order, widest access first, with an empty role dropped
  // rather than left as a heading over nothing. The server pages the list, so
  // this groups the page it sent rather than the whole table — which is the
  // honest thing to show: a count here is a count of what is on screen.
  const groups = WORKER_ROLES.map((role) => ({
    ...role,
    rows: list.rows.filter((worker) => worker.role === role.value),
  })).filter((group) => group.rows.length > 0);

  return (
    <>
      <header className={styles.head}>
        <h1 className={styles.title}>Workers</h1>
        <p className={styles.subtitle}>
          Everyone who works here, grouped by what their account can open. The
          role is the whole of it: it sets who reaches this dashboard, who
          reaches the warehouse scanner, and who reaches neither. Customers are
          on{' '}
          <Link className={styles.link} to="/dashboard/customers">
            Customers
          </Link>
          . Only an admin can move an account between roles.
        </p>
      </header>

      <Toolbar>
        <SearchInput
          value={list.searchInput}
          onChange={list.setSearchInput}
          label="Search workers"
          placeholder="Search by name, username, e-mail or phone"
        />
        <FilterSelect
          label="Role"
          value={list.filters.role}
          onChange={(value) => list.setFilter('role', value)}
          options={WORKER_ROLES}
          allLabel="All workers"
        />
        {user?.role === 'admin' && (
          <button
            type="button"
            className={styles.newButton}
            onClick={() => {
              setCreating((isOpen) => !isOpen);
              setCreateErrors({});
              setCreated('');
            }}
          >
            {creating ? 'Cancel' : 'New colleague'}
          </button>
        )}
      </Toolbar>

      <Banner tone="error">{error}</Banner>
      <Banner tone="success">{created}</Banner>

      {creating && (
        <NewWorkerFields onCreate={addWorker} busy={creatingBusy} errors={createErrors} />
      )}

      {list.state === 'loading' && <Loading inline />}
      {list.state === 'error' && <ConnectionError inline onRetry={list.reload} />}

      {list.state === 'ready' &&
        (list.rows.length === 0 ? (
          <Empty>No workers match that.</Empty>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Worker</th>
                  <th scope="col">Username</th>
                  <th scope="col">E-mail</th>
                  <th scope="col">Phone</th>
                  <th scope="col">Joined</th>
                  <th scope="col">Role</th>
                </tr>
              </thead>

              {/* One tbody per role rather than one table per role: the
                  columns stay lined up down the whole page, which is what
                  makes four groups readable as one list. */}
              {groups.map((group) => (
                <tbody key={group.value}>
                  <tr className={styles.groupRow}>
                    <td colSpan={7}>
                      <span className={styles.groupLabel}>
                        {group.label}
                        <span className={styles.groupCount}>
                          {group.rows.length} — {ROLE_REACH[group.value]}
                        </span>
                      </span>
                    </td>
                  </tr>

                  {group.rows.map((worker) => (
                    <tr key={worker.id}>
                      {/* The database id: what the Django admin, the API and a
                          support conversation all refer to an account by. */}
                      <td className={styles.numberCell}>
                        <span className={styles.mono}>{worker.id}</span>
                      </td>

                      <td>
                        <div className={styles.person}>
                          <span className={styles.personAvatar} aria-hidden="true">
                            {initialsOf(worker.name)}
                          </span>
                          <div>
                            <div className={styles.primaryCell}>{worker.name}</div>
                            <div className={styles.tagRow}>
                              {worker.is_superuser && (
                                <StatusBadge tone="progress">Superuser</StatusBadge>
                              )}
                              {user?.id === worker.id && (
                                <StatusBadge tone="neutral">You</StatusBadge>
                              )}
                              {worker.is_erased && <StatusBadge tone="off">Erased</StatusBadge>}
                              {/* An account that still holds a role but can no
                                  longer sign in. Worth saying out loud here:
                                  it looks like a working colleague in every
                                  other column. */}
                              {!worker.is_active && !worker.is_erased && (
                                <StatusBadge tone="off">Cannot sign in</StatusBadge>
                              )}
                            </div>
                            {!worker.is_erased && (
                              <button
                                type="button"
                                className={styles.linkButton}
                                onClick={() => toggle(worker)}
                              >
                                {openId === worker.id ? 'Close' : 'Edit details'}
                              </button>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className={styles.mutedCell}>
                        <span className={styles.mono}>{worker.username}</span>
                      </td>

                      <td className={styles.contactCell}>
                        {worker.email ? (
                          <a className={styles.link} href={`mailto:${worker.email}`}>
                            {worker.email}
                          </a>
                        ) : (
                          <span className={styles.mutedCell}>—</span>
                        )}
                      </td>

                      <td className={styles.contactCell}>
                        {worker.phone_number ? (
                          <a className={styles.link} href={`tel:${worker.phone_number}`}>
                            {worker.phone_number}
                          </a>
                        ) : (
                          <span className={styles.mutedCell}>—</span>
                        )}
                      </td>

                      <td className={styles.dateCell}>{formatDate(worker.date_joined)}</td>

                      <td>
                        {/* can_change_role comes from the server, which
                            refuses the same cases itself — your own account, a
                            superuser, an erased row, a caller who is not an
                            admin. Disabling the select is only so nobody
                            presses a control that was always going to be
                            refused. Moving somebody to Customer here is how
                            they leave this page. */}
                        {worker.can_change_role ? (
                          <StatusSelect
                            label={`Role for ${worker.name}`}
                            value={worker.role}
                            options={[...WORKER_ROLES, { value: 'customer', label: 'Customer' }]}
                            busy={savingId === worker.id}
                            onChange={(value) => changeRole(worker, value)}
                          />
                        ) : (
                          <div className={styles.mutedCell}>
                            <div>{roleLabel(worker.role)}</div>
                            <div className={styles.roleReason}>
                              {whyRoleIsFixed(worker, user?.id === worker.id)}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        ))}

      {/* The edit form below the table rather than inside it: a form crammed
          into a table cell is unusable. Keyed by the worker, so switching rows
          rebuilds the draft instead of carrying one person's half-typed
          e-mail onto another's row.

          No address box here, unlike Customers: a colleague's delivery
          address is not something the office has any business editing from a
          staff list. If they also ship with us, that is their own profile. */}
      {open && (
        <section key={open.id} className={styles.detail}>
          <h2 className={styles.detailTitle}>
            {open.name}
            {user?.id === open.id && (
              <span className={styles.roleReason}> — your own account</span>
            )}
          </h2>

          {/* Keyed on the stored values, so a save the server tidied — a
              lowercased e-mail — leaves the form showing what was actually
              stored rather than what was typed. */}
          <ContactFields
            key={`${open.first_name}|${open.last_name}|${open.email}|${open.phone_number}`}
            customer={open}
            busy={savingId === open.id}
            errors={fieldErrors}
            onSave={(changes) => save(open, () => updateCustomer(open.id, changes))}
          />
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
