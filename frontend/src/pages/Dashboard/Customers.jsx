// src/pages/Dashboard/Customers.jsx
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Loading from '../../components/Loading/Loading';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import {
  ADDRESS_COUNTRIES,
  CUSTOMER_ROLES,
  roleLabel,
  createCustomer,
  listCustomers,
  saveCustomerAddress,
  setCustomerRole,
  updateCustomer,
} from '../../api/staff';
import { useAuth } from '../../auth/useAuth';
import { useCollection } from './useCollection';
import { formatDate, formatMoney } from './format';
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

const ERASED_OPTIONS = [
  { value: 'false', label: 'Active accounts' },
  { value: 'true', label: 'Erased accounts' },
];

/** Why the role select is fixed on this row, in the words that fit the case. */
function whyRoleIsFixed(customer, isSelf) {
  if (isSelf) return 'Your own account';
  if (customer.is_superuser) return 'Superuser — managed in the Django admin';
  if (customer.is_erased) return 'Erased account';
  return '';
}

/** "Voorbeeld Klant" becomes "VK". */
function initialsOf(name) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

/** One address on its own lines, the way it would be written on a label. */
function AddressLines({ address }) {
  return (
    <div className={styles.address}>
      {address.label && <span className={styles.addressLabel}>{address.label}</span>}
      <div>
        {address.street} {address.house_number}
      </div>
      <div className={styles.mutedCell}>
        {[address.postal_code, address.city].filter(Boolean).join(' ')}
        {address.city && ', '}
        {address.country_display}
      </div>
    </div>
  );
}

/**
 * The server's complaint about one field, if it made one.
 *
 * DRF answers a 400 with `{field: ["message", ...]}`, which the API client
 * hands over as `error.fields`. Showing it beside the input it belongs to is
 * the difference between "that change could not be saved" and "that e-mail
 * address is already in use".
 */
function FieldError({ errors, name }) {
  const message = errors?.[name];
  if (!message) return null;

  return (
    <span className={styles.officeError}>
      {Array.isArray(message) ? message.join(' ') : String(message)}
    </span>
  );
}

/**
 * One labelled input inside an office box.
 *
 * @param {{ label: string, name: string, value: string,
 *           onChange: (value: string) => void, errors?: object,
 *           type?: string, options?: {value: string, label: string}[] }} props
 */
function Field({ label, name, value, onChange, errors, type = 'text', options }) {
  return (
    <label className={styles.officeField}>
      <span className={styles.officeLabel}>{label}</span>
      {options ? (
        <select
          className={styles.officeInput}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          className={styles.officeInput}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      <FieldError errors={errors} name={name} />
    </label>
  );
}

/** An empty new-account form. Written out so a reset is one assignment. */
const BLANK_CUSTOMER = {
  first_name: '',
  last_name: '',
  email: '',
  phone_number: '',
  role: 'customer',
};

/**
 * Opening an account for somebody who is not here to open it themselves.
 *
 * There is no password field, and its absence is the feature rather than an
 * omission: the account is created unusable and its owner is e-mailed a link
 * to choose their own. Nobody in the office ever knows it, so nobody has to be
 * trusted with it and nothing has to be read out over a phone.
 */
function NewCustomerFields({ onCreate, busy, errors }) {
  const [draft, setDraft] = useState(BLANK_CUSTOMER);

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
        onCreate(draft, () => setDraft(BLANK_CUSTOMER));
      }}
    >
      <p className={styles.officeHead}>New account</p>

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
          options={CUSTOMER_ROLES}
          errors={errors}
        />
      </div>

      <p className={styles.officeNote}>
        They sign in with this e-mail address. No password is set here — they
        are e-mailed a link to choose their own. The link expires after a
        while; if it has, they can use “Forgot password” on the sign-in page to
        get another.
      </p>

      <button type="submit" className={styles.rowButton} disabled={busy}>
        {busy ? 'Creating…' : 'Create account and send the invitation'}
      </button>
    </form>
  );
}

/**
 * The customer's contact details, as the office may correct them.
 *
 * These write to the same User row the customer sees on their own profile
 * page, so a fixed phone number is the one they read next time they open it.
 * The username is not here: it is what they type to sign in.
 */
function ContactFields({ customer, onSave, busy, errors }) {
  const [draft, setDraft] = useState({
    first_name: customer.first_name ?? '',
    last_name: customer.last_name ?? '',
    email: customer.email ?? '',
    phone_number: customer.phone_number ?? '',
  });

  const dirty = Object.entries(draft).some(
    ([field, value]) => String(customer[field] ?? '') !== String(value),
  );

  const set = (field) => (value) =>
    setDraft((current) => ({ ...current, [field]: value }));

  return (
    <div className={styles.officeBox}>
      <p className={styles.officeHead}>Contact details</p>

      <div className={styles.officeGrid}>
        <Field
          label="First name"
          name="first_name"
          value={draft.first_name}
          onChange={set('first_name')}
          errors={errors}
        />
        <Field
          label="Surname"
          name="last_name"
          value={draft.last_name}
          onChange={set('last_name')}
          errors={errors}
        />
        <Field
          label="E-mail"
          name="email"
          type="email"
          value={draft.email}
          onChange={set('email')}
          errors={errors}
        />
        <Field
          label="Phone"
          name="phone_number"
          type="tel"
          value={draft.phone_number}
          onChange={set('phone_number')}
          errors={errors}
        />
      </div>

      <button
        type="button"
        className={styles.rowButton}
        disabled={!dirty || busy}
        onClick={() => onSave(draft)}
      >
        {busy ? 'Saving…' : 'Save details'}
      </button>
    </div>
  );
}

/**
 * The customer's default delivery address — the one their next order is
 * pre-filled from, and the one their profile page edits.
 *
 * Only the default: a customer may keep several addresses, and choosing
 * between them is theirs to do. What the office needs is to fix the one an
 * agent is delivering against. If they have none, this adds it.
 */
function AddressFields({ customer, onSave, busy, errors }) {
  const existing =
    customer.addresses.find((address) => address.is_default) ??
    customer.addresses[0] ??
    null;

  const [draft, setDraft] = useState({
    label: existing?.label ?? '',
    street: existing?.street ?? '',
    house_number: existing?.house_number ?? '',
    postal_code: existing?.postal_code ?? '',
    city: existing?.city ?? '',
    country: existing?.country ?? ADDRESS_COUNTRIES[0].value,
  });

  const dirty = Object.entries(draft).some(
    ([field, value]) => String(existing?.[field] ?? '') !== String(value),
  );
  // A new address has to arrive complete; the server would refuse a blank
  // street or city anyway, this just says so before the round trip.
  const complete = draft.street.trim() && draft.city.trim();

  const set = (field) => (value) =>
    setDraft((current) => ({ ...current, [field]: value }));

  return (
    <div className={styles.officeBox}>
      <p className={styles.officeHead}>
        {existing ? 'Default delivery address' : 'Delivery address — none yet'}
      </p>

      <div className={styles.officeGrid}>
        <Field
          label="Label"
          name="label"
          value={draft.label}
          onChange={set('label')}
          errors={errors}
        />
        <Field
          label="Street"
          name="street"
          value={draft.street}
          onChange={set('street')}
          errors={errors}
        />
        <Field
          label="No."
          name="house_number"
          value={draft.house_number}
          onChange={set('house_number')}
          errors={errors}
        />
        <Field
          label="Postal code"
          name="postal_code"
          value={draft.postal_code}
          onChange={set('postal_code')}
          errors={errors}
        />
        <Field
          label="City"
          name="city"
          value={draft.city}
          onChange={set('city')}
          errors={errors}
        />
        <Field
          label="Country"
          name="country"
          value={draft.country}
          onChange={set('country')}
          options={ADDRESS_COUNTRIES}
          errors={errors}
        />
      </div>

      <button
        type="button"
        className={styles.rowButton}
        disabled={!dirty || !complete || busy}
        onClick={() =>
          onSave({
            // The id is what tells the server to correct this address rather
            // than add another one beside it.
            id: existing?.id ?? null,
            ...draft,
            is_default: true,
          })
        }
      >
        {busy ? 'Saving…' : existing ? 'Save address' : 'Add address'}
      </button>
    </div>
  );
}

export default function Customers() {
  const [params] = useSearchParams();
  // `user` for two things: wording the greyed-out role, and noticing when the
  // row being edited is the account this staff member is signed in as — the
  // header renders from the same copy and would otherwise go stale.
  const { user, refreshUser } = useAuth();

  const list = useCollection(
    listCustomers,
    { erased: params.get('erased') ?? '', staff: params.get('staff') ?? '' },
    params.get('search') ?? '',
  );

  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  // Which customer's edit panel is open, and the server's last per-field
  // complaints about it.
  const [openId, setOpenId] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  // The new-account form: whether it is open, what the server said about it,
  // and what it said when the account was made. Kept apart from the edit
  // panel's own error state above, because the two forms can be on screen
  // together and a complaint about one must not appear under the other.
  const [creating, setCreating] = useState(false);
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [createErrors, setCreateErrors] = useState({});
  const [created, setCreated] = useState('');

  async function addCustomer(draft, clear) {
    setCreatingBusy(true);
    setCreateErrors({});
    setCreated('');
    setError('');

    try {
      const row = await createCustomer(draft);

      clear();
      setCreating(false);
      setCreated(
        `${row.name || row.email} now has an account. An invitation to choose ` +
          'a password has been sent to ' + row.email + '.',
      );
      // Refetched rather than spliced in: the list is sorted and paged by the
      // server, and a row pushed onto the front of page three would sit
      // somewhere it does not belong.
      list.reload();
    } catch (caught) {
      // The server names the field it refused — a duplicate address, a phone
      // number that is not one — and those go under the boxes themselves.
      if (caught?.fields) setCreateErrors(caught.fields);
      else setError('That account could not be created. Check the connection and try again.');
    } finally {
      setCreatingBusy(false);
    }
  }

  async function changeRole(customer, role) {
    setSavingId(customer.id);
    setError('');

    try {
      // The response is the whole row, including a recomputed
      // can_change_role, so the table updates without a refetch.
      list.replaceRow(await setCustomerRole(customer.id, role));
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

  /**
   * Runs one of the two saves in the edit panel.
   *
   * Both answer with the whole customer row, so the table swaps it in rather
   * than refetching the page and losing the scroll position.
   */
  async function save(customer, write) {
    setSavingId(customer.id);
    setError('');
    setFieldErrors({});

    try {
      list.replaceRow(await write());

      // Editing your own row means editing the account you are signed in as.
      // The header, and this page's own idea of who you are, come from the
      // copy <AuthProvider> holds, so it has to be re-read.
      if (user?.id === customer.id) await refreshUser();
    } catch (caught) {
      // A 400 carries the server's reasons per field; anything else has no
      // more to say than that it did not happen.
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

  function toggle(customer) {
    setFieldErrors({});
    setError('');
    setOpenId((current) => (current === customer.id ? null : customer.id));
  }

  const open = list.rows.find((customer) => customer.id === openId) ?? null;

  return (
    <>
      <header className={styles.head}>
        <h1 className={styles.title}>Customers</h1>
        <p className={styles.subtitle}>
          Everyone with an account, with their addresses and how many shipments
          they have. These are the same records customers edit on their own
          profile page, so a correction made here is what they read next time
          they open it — and a change they make there shows up on the next
          load. The role is separate: an admin can reach this dashboard and
          everything in it.
        </p>
      </header>

      <Toolbar>
        <SearchInput
          value={list.searchInput}
          onChange={list.setSearchInput}
          label="Search customers"
          placeholder="Search by name, username, e-mail, phone or address"
        />
        <FilterSelect
          label="Account"
          value={list.filters.erased}
          onChange={(value) => list.setFilter('erased', value)}
          options={ERASED_OPTIONS}
          allLabel="All accounts"
        />
        <FilterSelect
          label="Role"
          value={list.filters.staff}
          onChange={(value) => list.setFilter('staff', value)}
          options={[{ value: 'true', label: 'Staff only' }]}
          allLabel="Everyone"
        />
        <button
          type="button"
          className={styles.newButton}
          onClick={() => {
            setCreating((open) => !open);
            setCreateErrors({});
            setCreated('');
          }}
        >
          {creating ? 'Cancel' : 'New account'}
        </button>
      </Toolbar>

      <Banner tone="error">{error}</Banner>
      <Banner tone="success">{created}</Banner>

      {creating && (
        <NewCustomerFields
          onCreate={addCustomer}
          busy={creatingBusy}
          errors={createErrors}
        />
      )}

      {list.state === 'loading' && <Loading inline />}
      {list.state === 'error' && <ConnectionError inline onRetry={list.reload} />}

      {list.state === 'ready' &&
        (list.rows.length === 0 ? (
          <Empty>No customers match that.</Empty>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Username</th>
                  <th scope="col">E-mail</th>
                  <th scope="col">Phone</th>
                  <th scope="col">Addresses</th>
                  <th scope="col">Shipments</th>
                  <th scope="col">Paid</th>
                  <th scope="col">Outstanding</th>
                  <th scope="col">Joined</th>
                  <th scope="col">Role</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((customer) => (
                  <tr key={customer.id}>
                    {/* The database id, which is what the Django admin, the API
                        and a support conversation all refer to a customer by.
                        Monospaced and tabular so a column of them lines up and
                        reads back accurately over the phone. */}
                    <td className={styles.numberCell}>
                      <span className={styles.mono}>{customer.id}</span>
                    </td>

                    <td>
                      <div className={styles.person}>
                        <span className={styles.personAvatar} aria-hidden="true">
                          {initialsOf(customer.name)}
                        </span>
                        <div>
                          <div className={styles.primaryCell}>{customer.name}</div>
                          <div className={styles.tagRow}>
                            {customer.is_staff && (
                              <StatusBadge tone="progress">Staff</StatusBadge>
                            )}
                            {/* Said out loud in the table, because it is the
                                one role that looks like a customer at a
                                glance and is not one. */}
                            {customer.is_warehouse && !customer.is_staff && (
                              <StatusBadge tone="progress">Warehouse</StatusBadge>
                            )}
                            {/* An erased account is a row kept only so its
                                shipment records still hold together. Saying so
                                stops anyone trying to phone the customer. */}
                            {customer.is_erased && (
                              <StatusBadge tone="off">Erased</StatusBadge>
                            )}
                            {!customer.is_active && !customer.is_erased && (
                              <StatusBadge tone="neutral">Inactive</StatusBadge>
                            )}
                          </div>
                          {/* Nothing to correct on an erased row: it holds no
                              personal data, and putting a name back on one
                              would undo the erasure it was asked for. */}
                          {!customer.is_erased && (
                            <button
                              type="button"
                              className={styles.linkButton}
                              onClick={() => toggle(customer)}
                            >
                              {openId === customer.id ? 'Close' : 'Edit details'}
                            </button>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className={styles.mutedCell}>
                      {/* Shown as its own column because it is what the
                          customer types to log in, and it is not always the
                          same as the e-mail address — an account made with
                          createsuperuser has a different one. */}
                      <span className={styles.mono}>{customer.username}</span>
                    </td>

                    <td className={styles.contactCell}>
                      {customer.email ? (
                        <a className={styles.link} href={`mailto:${customer.email}`}>
                          {customer.email}
                        </a>
                      ) : (
                        <span className={styles.mutedCell}>—</span>
                      )}
                    </td>

                    <td className={styles.contactCell}>
                      {customer.phone_number ? (
                        // tel: so it dials from a phone and from a desktop
                        // softphone — this is a number staff actually ring.
                        <a className={styles.link} href={`tel:${customer.phone_number}`}>
                          {customer.phone_number}
                        </a>
                      ) : (
                        <span className={styles.mutedCell}>—</span>
                      )}
                    </td>

                    <td>
                      {customer.addresses.length === 0 ? (
                        <span className={styles.mutedCell}>—</span>
                      ) : (
                        customer.addresses.map((address) => (
                          <AddressLines key={address.id} address={address} />
                        ))
                      )}
                    </td>

                    <td className={styles.numberCell}>{customer.package_count}</td>

                    <td className={styles.numberCell}>
                      {formatMoney(customer.paid_eur)}
                    </td>

                    {/* Amber when there is something outstanding, plain when
                        there is not. A column of zeros in warning colour
                        would make every settled customer look like a debt. */}
                    <td className={styles.numberCell}>
                      {Number(customer.outstanding_eur) > 0 ? (
                        <span className={styles.owed}>
                          {formatMoney(customer.outstanding_eur)}
                        </span>
                      ) : (
                        <span className={styles.mutedCell}>
                          {formatMoney(customer.outstanding_eur)}
                        </span>
                      )}
                    </td>

                    <td className={styles.dateCell}>
                      {formatDate(customer.date_joined)}
                    </td>

                    <td>
                      {/* can_change_role comes from the server, which refuses
                          the same three cases itself — your own account, a
                          superuser, an erased row. Disabling the select is
                          only so nobody presses a button that was always
                          going to be refused. */}
                      {customer.can_change_role ? (
                        <StatusSelect
                          label={`Role for ${customer.name}`}
                          value={customer.role}
                          options={CUSTOMER_ROLES}
                          busy={savingId === customer.id}
                          onChange={(value) => changeRole(customer, value)}
                        />
                      ) : (
                        <div className={styles.mutedCell}>
                          <div>{roleLabel(customer.role)}</div>
                          <div className={styles.roleReason}>
                            {whyRoleIsFixed(customer, user?.id === customer.id)}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {/* The edit forms below the table rather than inside it: a form crammed
          into a table cell is unusable, and the same panel is what Bookings
          opens under its own table. Keyed by the customer, so switching rows
          rebuilds the drafts instead of carrying one person's half-typed
          e-mail onto another's row. */}
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
              stored rather than what was typed. Typing does not change these,
              so a draft survives editing; only a save resets it. */}
          <ContactFields
            key={`${open.first_name}|${open.last_name}|${open.email}|${open.phone_number}`}
            customer={open}
            busy={savingId === open.id}
            errors={fieldErrors}
            onSave={(changes) =>
              save(open, () => updateCustomer(open.id, changes))
            }
          />

          <AddressFields
            key={JSON.stringify(open.addresses)}
            customer={open}
            busy={savingId === open.id}
            errors={fieldErrors}
            onSave={(address) =>
              save(open, () => saveCustomerAddress(open.id, address))
            }
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
