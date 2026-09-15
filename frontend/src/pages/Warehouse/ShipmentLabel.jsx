// src/pages/Warehouse/ShipmentLabel.jsx
//
// A printable label for one shipment: a QR code of the order number, the
// number itself large enough to read and type if the code is torn, and where
// it is going. Sized for a 100 × 150 mm label printer, and fine on A4.
//
// The QR code holds the tracking number and nothing else, so the scanner's
// lookup finds it and a phone's own camera app shows nothing private.

import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getWarehouseShipment } from '../../api/staff';
import ConnectionError from '../../components/ConnectionError/ConnectionError';
import Loading from '../../components/Loading/Loading';
import styles from './Warehouse.module.css';

export default function ShipmentLabel() {
  const { id } = useParams();
  const qrRef = useRef(null);
  const [answer, setAnswer] = useState({ id: null, status: 'loading', data: null });

  useEffect(() => {
    let cancelled = false;
    getWarehouseShipment(id)
      .then((data) => !cancelled && setAnswer({ id, status: 'ready', data }))
      .catch(() => !cancelled && setAnswer({ id, status: 'error', data: null }));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const state = answer.id === id ? answer.status : 'loading';
  const shipment = answer.data;
  const code = state === 'ready' ? shipment.tracking_number : null;

  // Drawn into the DOM rather than rendered by React: zxing hands back an SVG
  // element, and the library is loaded only on this page.
  useEffect(() => {
    if (!code || !qrRef.current) return undefined;
    let cancelled = false;
    const target = qrRef.current;

    import('@zxing/browser').then(({ BrowserQRCodeSvgWriter }) => {
      if (cancelled) return;
      const svg = new BrowserQRCodeSvgWriter().write(code, 300, 300);
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', `QR code for ${code}`);
      target.replaceChildren(svg);
    });

    return () => {
      cancelled = true;
    };
  }, [code]);

  if (state === 'loading') return <Loading />;
  if (state === 'error') return <ConnectionError />;

  const colli = shipment.intake?.colli;

  return (
    <div className={styles.labelPage}>
      <div className={styles.labelToolbar}>
        <Link to={`/warehouse/packages/${shipment.id}`} className={styles.plainButton}>
          ← Back
        </Link>
        <button type="button" className={styles.printButton} onClick={() => window.print()}>
          Print label
        </button>
      </div>

      <section className={styles.label} aria-label="Shipping label">
        <p className={styles.labelBrand}>PayLesShopMore.com</p>
        <div ref={qrRef} className={styles.labelQr} />
        <p className={styles.labelCode}>{shipment.tracking_number}</p>

        <dl className={styles.labelFacts}>
          <div>
            <dt>To</dt>
            <dd>
              {shipment.customer}
              {shipment.delivery_address_text && <br />}
              {shipment.delivery_address_text}
            </dd>
          </div>
          <div>
            <dt>Destination</dt>
            <dd className={styles.labelBig}>{shipment.destination || '—'}</dd>
          </div>
          {(shipment.freight_display || shipment.intake?.freight_display) && (
            <div>
              <dt>Method</dt>
              <dd>{shipment.freight_display || shipment.intake.freight_display}</dd>
            </div>
          )}
          {colli ? (
            <div>
              <dt>Colli</dt>
              <dd>{colli}</dd>
            </div>
          ) : null}
        </dl>
      </section>
    </div>
  );
}
