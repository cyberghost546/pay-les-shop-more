// src/pages/Warehouse/ShipmentPage.jsx
//
// One shipment, at /warehouse/shipments/:id - where the board's lists link.

import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getWarehouseShipment } from '../../api/staff';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import Loading from '../../components/Loading/Loading';
import { Empty } from '../Dashboard/ui';
import dashboard from '../Dashboard/Dashboard.module.css';
import ShipmentCard from './ShipmentCard';

export default function ShipmentPage() {
  const { id } = useParams();
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState({ key: null, status: 'loading', data: null });
  const key = `${id}#${attempt}`;

  useEffect(() => {
    let cancelled = false;

    getWarehouseShipment(id)
      .then((data) => {
        if (!cancelled) setAnswer({ key, status: 'ready', data });
      })
      .catch((error) => {
        if (!cancelled) {
          setAnswer({ key, status: error?.status === 404 ? 'missing' : 'error', data: null });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id, key]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const state = answer.key === key ? answer.status : 'loading';

  return (
    <>
      <p>
        <Link to="/warehouse" className={dashboard.sectionLink}>
          ← Warehouse board
        </Link>
      </p>

      {state === 'loading' && <Loading inline />}
      {state === 'error' && <ConnectionError inline onRetry={reload} />}
      {state === 'missing' && <Empty>There is no shipment with this number.</Empty>}
      {state === 'ready' && (
        <ShipmentCard
          shipment={answer.data}
          onChange={(data) => setAnswer({ key, status: 'ready', data })}
        />
      )}
    </>
  );
}
