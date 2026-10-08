import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachRefreshTriggers, type RefreshEnvironment } from './useTransitData';

function environment() {
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
  const window = new EventTarget();
  const navigator = { onLine: true };
  return { document, window, navigator } satisfies RefreshEnvironment;
}

afterEach(() => vi.useRealTimers());

describe('foreground refresh lifecycle', () => {
  it('polls only while visible and online, and refreshes immediately when visible again', async () => {
    vi.useFakeTimers();
    const events = environment();
    const refresh = vi.fn(async () => {}), suspend = vi.fn();
    const dispose = attachRefreshTriggers(refresh, suspend, events);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    events.document.visibilityState = 'hidden';
    events.document.dispatchEvent(new Event('visibilitychange'));
    expect(suspend).toHaveBeenLastCalledWith(false);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    events.document.visibilityState = 'visible';
    events.document.dispatchEvent(new Event('visibilitychange'));
    expect(refresh).toHaveBeenCalledTimes(2);
    dispose();
  });

  it('suspends requests offline and resumes immediately online without an extra user action', async () => {
    vi.useFakeTimers();
    const events = environment();
    const refresh = vi.fn(async () => {}), suspend = vi.fn();
    const dispose = attachRefreshTriggers(refresh, suspend, events);
    events.navigator.onLine = false;
    events.window.dispatchEvent(new Event('offline'));
    expect(suspend).toHaveBeenLastCalledWith(true);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(refresh).not.toHaveBeenCalled();
    events.navigator.onLine = true;
    events.window.dispatchEvent(new Event('online'));
    expect(refresh).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('waits for visibility after reconnection and cleans up every timer and listener', async () => {
    vi.useFakeTimers();
    const events = environment();
    events.document.visibilityState = 'hidden';
    events.navigator.onLine = false;
    const refresh = vi.fn(async () => {});
    const dispose = attachRefreshTriggers(refresh, vi.fn(), events);
    events.navigator.onLine = true;
    events.window.dispatchEvent(new Event('online'));
    expect(refresh).not.toHaveBeenCalled();
    dispose();
    events.document.visibilityState = 'visible';
    events.document.dispatchEvent(new Event('visibilitychange'));
    events.window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(120_000);
    expect(refresh).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
