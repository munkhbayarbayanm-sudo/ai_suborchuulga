/** Schedule one refresh only after the previous resource request has settled. */
export function scheduleIdleRefresh(enabled: boolean, loading: boolean, refresh: () => void, delayMs: number): () => void {
  if (!enabled || loading) return () => {};
  const timer = setTimeout(refresh, delayMs);
  return () => clearTimeout(timer);
}
