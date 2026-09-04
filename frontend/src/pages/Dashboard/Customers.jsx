// src/pages/Dashboard/Customers.jsx
import { useSearchParams } from 'react-router-dom';
import Loading from '../../components/Loading/Loading';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import { listCustomers } from '../../api/staff';
import { useCollection } from './useCollection';
import { formatDate } from './format';
import {
  Empty,
  FilterSelect,
  Pagination,
  SearchInput,
  StatusBadge,
  Toolbar,
} from './ui';
import styles from './Dashboard.module.css';

const ERASED_OPTIONS = [
  { value: 'false', label: 'Active accounts' },
  { value: 'true', label: 'Erased accounts' },
];

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

export default function Customers() {
  const [params] = useSearchParams();

  const list = useCollection(
    listCustomers,
    { erased: params.get('erased') ?? '', staff: params.get('staff') ?? '' },
    params.get('search') ?? '',
  );

  return (
    <>
      <header className={styles.head}>
        <h1 className={styles.title}>Customers</h1>
        <p className={styles.subtitle}>
          Everyone with an account, with their addresses and how many shipments
          they have. Read-only — personal data is changed in the Django admin,
          or by the customer on their own profile.
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
      </Toolbar>

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
                  <th scope="col">Customer</th>
                  <th scope="col">Username</th>
                  <th scope="col">E-mail</th>
                  <th scope="col">Phone</th>
                  <th scope="col">Addresses</th>
                  <th scope="col">Shipments</th>
                  <th scope="col">Joined</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((customer) => (
                  <tr key={customer.id}>
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

                    <td className={styles.dateCell}>
                      {formatDate(customer.date_joined)}
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
