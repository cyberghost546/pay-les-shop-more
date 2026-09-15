// src/pages/Warehouse/useLoad.js

import { useCallback, useEffect, useState } from 'react';

/**
 * Fetch something, keyed by `key`, with a retry. The answer is tagged with
 * the key it belongs to, so a slow response for an old filter never lands on
 * top of the current one.
 *
 * @template T
 * @param {() => Promise<T>} load called again whenever `key` changes
 * @param {string} key everything the request depends on, as one string
 * @returns {{ state: 'loading'|'ready'|'error', data: T|null, reload: () => void }}
 */
export function useLoad(load, key) {
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState({ key: null, status: 'loading', data: null });
  const fullKey = `${key}#${attempt}`;

  useEffect(() => {
    let cancelled = false;
    load()
      .then((data) => {
        if (!cancelled) setAnswer({ key: fullKey, status: 'ready', data });
      })
      .catch(() => {
        if (!cancelled) setAnswer({ key: fullKey, status: 'error', data: null });
      });
    return () => {
      cancelled = true;
    };
    // `fullKey` stands for everything `load` reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullKey]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const current = answer.key === fullKey;

  return {
    state: current ? answer.status : 'loading',
    data: current ? answer.data : null,
    reload,
  };
}
