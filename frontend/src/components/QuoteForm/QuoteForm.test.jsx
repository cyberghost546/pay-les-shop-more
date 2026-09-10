// The quote form. It is the site's main way of turning a visitor into a
// customer, and the only public form that accepts a file, so the checks worth
// having are about what reaches the server and what the sender is told when
// something is wrong.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import QuoteForm from './QuoteForm';
import { MAX_FILE_BYTES, requestQuote } from '../../api/quote';
import { API_ERRORS } from '../../api/client';

vi.mock('../../api/quote', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, requestQuote: vi.fn() };
});

/** A File of a given type and size, without allocating the bytes. */
function fakeFile(name, type, size = 1024) {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

async function fillRequiredFields(user) {
  await user.type(screen.getByLabelText(/First name/), 'Ana');
  await user.type(screen.getByLabelText(/Last name/), 'Martis');
  await user.type(screen.getByLabelText(/Email address/), 'ana@example.com');
}

describe('QuoteForm', () => {
  beforeEach(() => {
    requestQuote.mockReset();
    requestQuote.mockResolvedValue({});
  });

  it('sends the request with the island it was asked about', async () => {
    const user = userEvent.setup();
    renderWithProviders(<QuoteForm destination="Curaçao" />);

    await fillRequiredFields(user);
    await user.type(screen.getByLabelText(/Your message/), 'Two boxes of tools');
    await user.click(screen.getByRole('button', { name: 'Send request' }));

    await waitFor(() => expect(requestQuote).toHaveBeenCalledTimes(1));
    expect(requestQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        destination: 'Curaçao',
        firstName: 'Ana',
        lastName: 'Martis',
        email: 'ana@example.com',
        message: 'Two boxes of tools',
        // The active language travels with the request, so the reply can be
        // written in the language the request was made in.
        language: 'en',
      }),
    );
  });

  it('trims whitespace off what was typed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<QuoteForm destination="Aruba" />);

    await user.type(screen.getByLabelText(/First name/), '  Ana  ');
    await user.type(screen.getByLabelText(/Last name/), 'Martis');
    await user.type(screen.getByLabelText(/Email address/), ' ana@example.com ');
    await user.click(screen.getByRole('button', { name: 'Send request' }));

    await waitFor(() =>
      expect(requestQuote).toHaveBeenCalledWith(
        expect.objectContaining({ firstName: 'Ana', email: 'ana@example.com' }),
      ),
    );
  });

  it('will not send an empty form, and says which fields are missing', async () => {
    const user = userEvent.setup();
    renderWithProviders(<QuoteForm destination="Bonaire" />);

    await user.click(screen.getByRole('button', { name: 'Send request' }));

    expect(
      await screen.findByText('Please enter your first name.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Please enter your last name.')).toBeInTheDocument();
    expect(
      screen.getByText('Please enter your email address.'),
    ).toBeInTheDocument();
    expect(requestQuote).not.toHaveBeenCalled();
  });

  it('rejects an address that is not one', async () => {
    const user = userEvent.setup();
    renderWithProviders(<QuoteForm destination="Bonaire" />);

    await user.type(screen.getByLabelText(/First name/), 'Ana');
    await user.type(screen.getByLabelText(/Last name/), 'Martis');
    await user.type(screen.getByLabelText(/Email address/), 'ana@example');
    await user.click(screen.getByRole('button', { name: 'Send request' }));

    // The address is where the quote goes. A typo here means the work is done
    // and the answer never arrives.
    expect(
      await screen.findByText('That email address does not look right.'),
    ).toBeInTheDocument();
    expect(requestQuote).not.toHaveBeenCalled();
  });

  it('clears the error on a field as soon as it is corrected', async () => {
    const user = userEvent.setup();
    renderWithProviders(<QuoteForm destination="Bonaire" />);

    await user.click(screen.getByRole('button', { name: 'Send request' }));
    expect(
      await screen.findByText('Please enter your first name.'),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/First name/), 'Ana');

    expect(
      screen.queryByText('Please enter your first name.'),
    ).not.toBeInTheDocument();
  });

  it('refuses a file of the wrong type before it costs an upload', async () => {
    // applyAccept off, because the input's accept attribute is what stops
    // this in the file picker and the test would be checking the browser
    // rather than the form. The path that has to be defended is dropping a
    // file onto the zone, which accept does not filter at all.
    const user = userEvent.setup({ applyAccept: false });
    const { container } = renderWithProviders(<QuoteForm destination="Aruba" />);

    // The visible control is a label; the input itself is hidden by design,
    // so the file is handed to the input directly.
    const input = container.querySelector('input[type="file"]');
    await user.upload(input, fakeFile('list.exe', 'application/x-msdownload'));
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Send request' }));

    expect(
      await screen.findByText('Please choose a PDF, JPG or PNG file.'),
    ).toBeInTheDocument();
    expect(requestQuote).not.toHaveBeenCalled();
  });

  it('refuses a file over the size limit', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<QuoteForm destination="Aruba" />);

    const input = container.querySelector('input[type="file"]');
    await user.upload(
      input,
      fakeFile('list.pdf', 'application/pdf', MAX_FILE_BYTES + 1),
    );
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Send request' }));

    // Caught here rather than by the server, which would take the whole
    // upload first and reject it after.
    expect(
      await screen.findByText('That file is larger than 10 MB.'),
    ).toBeInTheDocument();
    expect(requestQuote).not.toHaveBeenCalled();
  });

  it('confirms in words when the request has gone', async () => {
    const user = userEvent.setup();
    renderWithProviders(<QuoteForm destination="Suriname" />);

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Send request' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/Thank you/);
    // Cleared, so a second request does not resend the first one's details.
    expect(screen.getByLabelText(/First name/)).toHaveValue('');
  });

  it('keeps what was typed when the send fails', async () => {
    const user = userEvent.setup();
    const failure = new Error(API_ERRORS.UNAVAILABLE);
    failure.code = API_ERRORS.UNAVAILABLE;
    requestQuote.mockRejectedValue(failure);

    renderWithProviders(<QuoteForm destination="Aruba" />);
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Send request' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    // The worst version of this bug is a form that empties itself on a
    // network error and makes the sender type everything again.
    expect(screen.getByLabelText(/First name/)).toHaveValue('Ana');
  });
});
