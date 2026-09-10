// The Add invoice form.
//
// What is worth testing here is the pairing, from the form's side. The server
// is what makes an invoice on the wrong customer's shipment impossible — see
// invoicing/test_manual_invoices.py — and these tests cover the half that
// makes it hard to do by accident in the first place: shipments are never
// listed until a customer is chosen, they are asked for by that customer's
// id, and changing the customer takes the shipment with it rather than
// leaving a stale one selected under a new name.
//
// The rest is what the office sees when something is refused: a duplicate
// offering the invoice that already exists, a file too big to be worth
// uploading, and the server's own words when it turns the pairing down.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import AddInvoice from './AddInvoice';
import { createInvoice, listCustomers, listPackages } from '../../api/staff';

vi.mock('../../api/staff', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    listCustomers: vi.fn(),
    listPackages: vi.fn(),
    createInvoice: vi.fn(),
  };
});

const JOHN = {
  id: 12,
  name: 'John Smith',
  username: 'john@example.com',
  email: 'john@example.com',
  phone_number: '+599 9 123 4567',
  package_count: 2,
};

const MARY = {
  id: 34,
  name: 'Mary Jones',
  username: 'mary@example.com',
  email: 'mary@example.com',
  phone_number: '+599 9 765 4321',
  package_count: 1,
};

const JOHNS_SHIPMENT = {
  id: 100,
  tracking_number: 'PLSM-1001',
  status_display: 'Paid',
  destination: 'Curaçao',
  description: 'Een televisie',
  value_eur: '899.00',
  created_at: '2026-09-01T00:00:00Z',
  shipped_at: null,
  invoice: null,
};

const MARYS_SHIPMENT = {
  ...JOHNS_SHIPMENT,
  id: 200,
  tracking_number: 'PLSM-2001',
  description: 'Een koelkast',
};

function page(results) {
  return { results, count: results.length, hasNext: false, hasPrevious: false };
}

/** A file the browser would hand over for a real PDF pick. */
function pdf(name = 'invoice.pdf', type = 'application/pdf') {
  return new File(['%PDF-1.4 hello'], name, { type });
}

function renderForm(props = {}) {
  return renderWithProviders(
    <AddInvoice
      onClose={vi.fn()}
      onCreated={vi.fn()}
      onOpenExisting={vi.fn()}
      {...props}
    />,
  );
}

/** Picks John out of the customer list and waits for his shipments. */
async function chooseJohn(user) {
  await user.click(await screen.findByRole('button', { name: /John Smith/ }));
  return screen.findByRole('button', { name: /PLSM-1001/ });
}

describe('AddInvoice', () => {
  beforeEach(() => {
    listCustomers.mockReset();
    listPackages.mockReset();
    createInvoice.mockReset();

    listCustomers.mockResolvedValue(page([JOHN, MARY]));
    listPackages.mockResolvedValue(page([JOHNS_SHIPMENT]));
    createInvoice.mockResolvedValue({
      id: 7,
      number: 'INV-2026-00007',
      customer: 'John Smith',
      tracking_number: 'PLSM-1001',
      status: 'sent',
      status_display: 'Sent',
    });
  });

  it('shows enough about a customer to tell two of them apart', async () => {
    renderForm();

    const row = await screen.findByRole('button', { name: /John Smith/ });

    expect(within(row).getByText('john@example.com')).toBeInTheDocument();
    expect(within(row).getByText(/Customer ID: 12/)).toBeInTheDocument();
  });

  it('asks for no shipments at all until a customer is chosen', async () => {
    renderForm();
    await screen.findByRole('button', { name: /John Smith/ });

    expect(listPackages).not.toHaveBeenCalled();
    // Twice: once as the hint under the label, once as the empty list.
    expect(screen.getAllByText('Choose a customer first.').length).toBeGreaterThan(0);
  });

  it('asks only for the chosen customer’s shipments', async () => {
    const user = userEvent.setup();
    renderForm();

    await chooseJohn(user);

    // By id, not by name: the server narrows on it and then checks the pairing
    // again on save.
    await waitFor(() =>
      expect(listPackages).toHaveBeenCalledWith(
        expect.objectContaining({ user: JOHN.id }),
      ),
    );
  });

  it('drops the chosen shipment when the customer is changed', async () => {
    const user = userEvent.setup();
    renderForm();

    await chooseJohn(user);
    await user.click(screen.getByRole('button', { name: /PLSM-1001/ }));
    expect(screen.getByText('PLSM-1001')).toBeInTheDocument();

    // "Change" on the customer picker, which is the first of the two.
    await user.click(screen.getAllByRole('button', { name: 'Change' })[0]);
    listPackages.mockResolvedValue(page([MARYS_SHIPMENT]));
    await user.click(await screen.findByRole('button', { name: /Mary Jones/ }));

    // The shipment that belonged to John cannot still be selected under Mary.
    // Leaving it is exactly how an invoice lands on the wrong parcel.
    await waitFor(() =>
      expect(screen.queryByText('PLSM-1001')).not.toBeInTheDocument(),
    );
  });

  it('will not submit until all three are in hand', async () => {
    const user = userEvent.setup();
    renderForm();

    const submit = await screen.findByRole('button', { name: 'Create invoice' });
    expect(submit).toBeDisabled();
    expect(screen.getByText('Choose the customer this invoice is for.')).toBeInTheDocument();

    await chooseJohn(user);
    expect(
      screen.getByText('Choose which of their shipments it is for.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /PLSM-1001/ }));
    expect(screen.getByText('Attach the invoice PDF.')).toBeInTheDocument();
    expect(submit).toBeDisabled();
  });

  it('refuses a file over the size limit before uploading it', async () => {
    // The size check is the one that earns its keep on this side. A file of
    // the wrong type is already filtered by the input's own accept list, and
    // caught again by the server's signature check either way — but a 40 MB
    // scan would otherwise be uploaded in full only to be refused on arrival,
    // which on an island connection is a long wait for a no.
    const user = userEvent.setup();
    renderForm();

    const tooBig = new File(
      [new Uint8Array(11 * 1024 * 1024)],
      'invoice.pdf',
      { type: 'application/pdf' },
    );

    await chooseJohn(user);
    await user.click(screen.getByRole('button', { name: /PLSM-1001/ }));
    await user.upload(screen.getByLabelText(/Invoice PDF/), tooBig);

    expect(await screen.findByRole('alert')).toHaveTextContent(/over the 10 MB limit/);
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it('sends both ids and confirms what was created', async () => {
    const user = userEvent.setup();
    renderForm();

    await chooseJohn(user);
    await user.click(screen.getByRole('button', { name: /PLSM-1001/ }));
    await user.upload(screen.getByLabelText(/Invoice PDF/), pdf());
    await user.click(screen.getByRole('button', { name: 'Create invoice' }));

    await waitFor(() =>
      expect(createInvoice).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: JOHN.id, packageId: JOHNS_SHIPMENT.id }),
      ),
    );

    // The three things somebody checks before believing it worked.
    expect(
      await screen.findByText('Invoice created successfully.'),
    ).toBeInTheDocument();
    expect(screen.getByText('INV-2026-00007')).toBeInTheDocument();
    expect(screen.getByText('John Smith')).toBeInTheDocument();
    expect(screen.getByText('PLSM-1001')).toBeInTheDocument();
  });

  it('offers the invoice that already exists rather than a second one', async () => {
    const user = userEvent.setup();
    const onOpenExisting = vi.fn();

    const conflict = new Error('UNAVAILABLE');
    conflict.status = 409;
    conflict.fields = { existing_invoice: 3, tracking_number: 'PLSM-1001' };
    createInvoice.mockRejectedValue(conflict);

    renderForm({ onOpenExisting });

    await chooseJohn(user);
    await user.click(screen.getByRole('button', { name: /PLSM-1001/ }));
    await user.upload(screen.getByLabelText(/Invoice PDF/), pdf());
    await user.click(screen.getByRole('button', { name: 'Create invoice' }));

    expect(
      await screen.findByText('An invoice already exists for this shipment.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'View existing invoice' }));
    expect(onOpenExisting).toHaveBeenCalledWith(3);
  });

  it('shows the server’s own words when it refuses the pairing', async () => {
    const user = userEvent.setup();

    const refusal = new Error('VALIDATION');
    refusal.status = 400;
    refusal.fields = {
      package: ['PLSM-2001 does not belong to John Smith.'],
    };
    createInvoice.mockRejectedValue(refusal);

    renderForm();

    await chooseJohn(user);
    await user.click(screen.getByRole('button', { name: /PLSM-1001/ }));
    await user.upload(screen.getByLabelText(/Invoice PDF/), pdf());
    await user.click(screen.getByRole('button', { name: 'Create invoice' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'PLSM-2001 does not belong to John Smith.',
    );
  });
});
