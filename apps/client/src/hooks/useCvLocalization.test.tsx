import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureJpegFrame } from '../utils/cvFrame';
import type { NavigationGraph } from '../navigation/graph';
import { useCvLocalization } from './useCvLocalization';

vi.mock('../utils/cvFrame', () => ({ captureJpegFrame: vi.fn(() => 'jpeg') }));

const graph: NavigationGraph = new Map([
  ['a', { point: { id: 'a', x: 0, y: 0 }, edges: [{ from: 'a', to: 'b', distanceMeters: 2 }] }],
  ['b', { point: { id: 'b', x: 2, y: 0 }, edges: [{ from: 'b', to: 'a', distanceMeters: 2 }] }],
  ['isolated', { point: { id: 'isolated', x: 0, y: 1 }, edges: [] }],
]);
const catalog = {
  revision: 'v1', searchRadiusMeters: 3, updateThresholdMeters: 1,
  references: [
    { id: 'one', image: 'one.jpg', pointId: 'b', facingTarget: 'a' },
    { id: 'two', image: 'two.jpg', pointId: 'isolated', facingTarget: null },
  ],
};

describe('useCvLocalization', () => {
  const videoRef = { current: document.createElement('video') };
  let observations: Array<'matched' | 'no_match'>;
  let requests: string[][];
  let onConfirmed: ReturnType<typeof vi.fn<(reference: typeof catalog.references[number]) => void>>;

  beforeEach(() => {
    vi.useFakeTimers();
    observations = [];
    requests = [];
    onConfirmed = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/references')) return { ok: true, json: async () => catalog };
      requests.push((JSON.parse(String(init?.body)) as { reference_ids: string[] }).reference_ids);
      const status = observations.shift() ?? 'matched';
      return { ok: true, json: async () => ({
        status, reference_id: status === 'matched' ? 'one' : null,
        point_id: status === 'matched' ? 'b' : null, confidence: 0.9,
      }) };
    }));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('culls disconnected references and confirms once until absence and cooldown', async () => {
    renderHook(() => useCvLocalization(videoRef, true, graph, 'a', onConfirmed));
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(requests.length).toBeGreaterThanOrEqual(3);
    expect(requests.every((ids) => ids.join(',') === 'one')).toBe(true);
    expect(onConfirmed).toHaveBeenCalledTimes(1);
    observations.push('no_match', 'no_match', 'no_match');
    await act(() => vi.advanceTimersByTimeAsync(9000));
    expect(onConfirmed).toHaveBeenCalledTimes(2);
  });

  it('does not overlap pending requests and discards results after disabling', async () => {
    let resolve: ((response: object) => void) | undefined;
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url).endsWith('/references')) return { ok: true, json: async () => catalog } as Response;
      return await new Promise<Response>((done) => { resolve = (response) => done(response as Response); });
    });
    const { rerender } = renderHook(({ enabled }) => useCvLocalization(videoRef, enabled, graph, 'a', onConfirmed),
      { initialProps: { enabled: true } });
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    rerender({ enabled: false });
    await act(async () => resolve?.({ ok: true, json: async () => ({ status: 'matched', reference_id: 'one', point_id: 'b', confidence: 1 }) }));
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(captureJpegFrame).toHaveBeenCalledTimes(1);
  });

  it('switches the active references when the estimated graph position changes', async () => {
    const { rerender } = renderHook(({ pointId }) => useCvLocalization(videoRef, true, graph, pointId, onConfirmed),
      { initialProps: { pointId: 'a' } });
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(requests[0]).toEqual(['one']);
    rerender({ pointId: 'isolated' });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(requests[1]).toEqual(['two']);
    expect(onConfirmed).not.toHaveBeenCalled();
  });
});
