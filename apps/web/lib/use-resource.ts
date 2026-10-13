'use client';

import { useCallback, useEffect, useState } from 'react';
import { errorText, request, type Parser } from './api';

export function useResource<T>(path: string, schema: Parser<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    request(path, schema, { signal: controller.signal }).then(setData).catch(error => {
      if (!controller.signal.aborted) setError(errorText(error));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [path, schema, version]);
  return { data, error, loading, refresh, setData };
}
