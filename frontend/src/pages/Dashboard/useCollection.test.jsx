// The hook every dashboard table runs on: fetch, filter, search, page, and
// swap one row after an edit.
//
// Worth testing because its bugs are the kind nobody reports as bugs. A stale
// response landing last shows the office the wrong rows under the right
// filter, and it looks like the data is wrong rather than the table. A search
// that does not reset the page shows an empty table for a term that has
// plenty of matches, on page four of a two-page result.

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCollection } from './useCollection';

/** What src/api/staff.js resolves to, in the shape toPage() produces. */
function page(results, extra = {}) {
  return { results, count: results.length, hasNext: false, hasPrevious: false, ...extra };
}

const ROW = { id: 1, status: 'new' };

describe('useCollection', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches once on mount and reports the rows', async () => {
    const fetcher = vi.fn().mockResolvedValue(page([ROW]));

    const { result } = renderHook(() => useCollection(fetcher));

    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current.rows).toEqual([ROW]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('carries the filters, the search term and the page in one request', async () => {
    const fetcher = vi.fn().mockResolvedValue(page([]));

    renderHook(() => useCollection(fetcher, { status: 'new' }, 'PLSM-0001'));

    // Seeded search, so the first request already carries the term instead of
    // firing once empty and again when the debounce catches up.
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(fetcher).toHaveBeenCalledWith({
      status: 'new',
      search: 'PLSM-0001',
      page: 1,
    });
  });

  it('waits for typing to stop before searching', async () => {
    const fetcher = vi.fn().mockResolvedValue(page([]));
    const { result } = renderHook(() => useCollection(fetcher));

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

    // Someone typing a tracking number, one keystroke at a time.
    for (const term of ['P', 'PL', 'PLS', 'PLSM']) {
      act(() => result.current.setSearchInput(term));
    }

    // One request for the whole word, not four.
    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(fetcher).toHaveBeenLastCalledWith({ search: 'PLSM', page: 1 });
  });

  it('goes back to the first page when the search or a filter changes', async () => {
    const fetcher = vi.fn().mockResolvedValue(page([ROW], { hasNext: true }));
    const { result } = renderHook(() => useCollection(fetcher));

    await waitFor(() => expect(result.current.state).toBe('ready'));

    act(() => result.current.setPage(4));
    await waitFor(() => expect(result.current.page).toBe(4));

    act(() => result.current.setFilter('status', 'paid'));

    // Page four of the old result set is almost never page four of the new
    // one, and is usually past the end of it.
    await waitFor(() => expect(result.current.page).toBe(1));
    expect(fetcher).toHaveBeenLastCalledWith({ status: 'paid', search: '', page: 1 });
  });

  it('ignores a slow answer to a question that has been replaced', async () => {
    const slow = page([{ id: 99, status: 'stale' }]);
    const fresh = page([ROW]);

    let releaseSlow;
    const fetcher = vi
      .fn()
      // The first request hangs; the second overtakes it.
      .mockImplementationOnce(
        () => new Promise((resolve) => {
          releaseSlow = () => resolve(slow);
        }),
      )
      .mockResolvedValue(fresh);

    const { result } = renderHook(() => useCollection(fetcher));

    act(() => result.current.setFilter('status', 'paid'));
    await waitFor(() => expect(result.current.rows).toEqual([ROW]));

    // The old request finally lands. Its rows belong to a filter nobody is
    // looking at any more.
    act(() => releaseSlow());

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(result.current.rows).toEqual([ROW]);
  });

  it('reports a failure without leaving stale rows on screen', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('UNAVAILABLE'));

    const { result } = renderHook(() => useCollection(fetcher));

    await waitFor(() => expect(result.current.state).toBe('error'));
    expect(result.current.rows).toEqual([]);
  });

  it('retries the same question when asked again', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('UNAVAILABLE'))
      .mockResolvedValue(page([ROW]));

    const { result } = renderHook(() => useCollection(fetcher));
    await waitFor(() => expect(result.current.state).toBe('error'));

    // Nothing about the request has changed, so only an explicit retry can
    // re-run it.
    act(() => result.current.reload());

    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current.rows).toEqual([ROW]);
  });

  it('swaps one edited row in place instead of refetching the page', async () => {
    const fetcher = vi.fn().mockResolvedValue(page([ROW, { id: 2, status: 'new' }]));
    const { result } = renderHook(() => useCollection(fetcher));

    await waitFor(() => expect(result.current.state).toBe('ready'));

    // What every status control does with the row the server answers with.
    act(() => result.current.replaceRow({ id: 1, status: 'paid' }));

    expect(result.current.rows).toEqual([
      { id: 1, status: 'paid' },
      { id: 2, status: 'new' },
    ]);
    // Keeps the table from flashing and the reader from losing their place.
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('leaves the other rows alone when one is replaced', async () => {
    const fetcher = vi.fn().mockResolvedValue(page([ROW, { id: 2, status: 'new' }]));
    const { result } = renderHook(() => useCollection(fetcher));
    await waitFor(() => expect(result.current.state).toBe('ready'));

    act(() => result.current.replaceRow({ id: 3, status: 'paid' }));

    // A row that is not on this page is not an error and must not appear.
    expect(result.current.rows.map((row) => row.id)).toEqual([1, 2]);
  });

  it('passes the pager what the server said about neighbouring pages', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(page([ROW], { count: 90, hasNext: true, hasPrevious: true }));

    const { result } = renderHook(() => useCollection(fetcher));

    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current.count).toBe(90);
    expect(result.current.hasNext).toBe(true);
    expect(result.current.hasPrevious).toBe(true);
  });
});
