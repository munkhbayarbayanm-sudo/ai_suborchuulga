import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduleIdleRefresh } from './resource-polling';

afterEach(() => vi.useRealTimers());

describe('resource polling after request completion', () => {
  it('allows a response slower than the polling delay to finish before another refresh', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    // The initial response has finished; schedule the next poll.
    const cancel = scheduleIdleRefresh(true, false, refresh, 2000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(refresh).toHaveBeenCalledTimes(1);
    cancel();
    // The poll takes five seconds. An in-flight request must never be refreshed.
    const cancelSlow = scheduleIdleRefresh(true, true, refresh, 2000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(refresh).toHaveBeenCalledTimes(1);
    cancelSlow();
    // Only the completed response permits the next two-second delay to begin.
    scheduleIdleRefresh(true, false, refresh, 2000);
    await vi.advanceTimersByTimeAsync(1999);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
  it('stops polling as soon as the run is terminal', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    scheduleIdleRefresh(false, false, refresh, 2000);
    await vi.advanceTimersByTimeAsync(10000);
    expect(refresh).not.toHaveBeenCalled();
  });
  it('clears a pending timer on unmount or request-state changes', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const cancel = scheduleIdleRefresh(true, false, refresh, 10000);
    cancel();
    await vi.advanceTimersByTimeAsync(15000);
    expect(refresh).not.toHaveBeenCalled();
  });
});
