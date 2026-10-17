import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { capturePhotoRouteFrame } from '../utils/cvFrame';
import { loadPhotoRoute, sendPhotoRouteFrame, type PhotoRouteResult } from '../utils/photoRoute';
import { photoCatalog, photoMatch } from '../test/photoRouteFixtures';
import { usePhotoRoute } from './usePhotoRoute';

vi.mock('../utils/cvFrame', () => ({ capturePhotoRouteFrame: vi.fn() }));
vi.mock('../utils/photoRoute', async (original) => ({
  ...await original<typeof import('../utils/photoRoute')>(),
  loadPhotoRoute: vi.fn(), sendPhotoRouteFrame: vi.fn(),
}));

describe('usePhotoRoute', () => {
  const videoRef = { current: document.createElement('video') };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(capturePhotoRouteFrame).mockReturnValue('jpeg');
    vi.mocked(loadPhotoRoute).mockResolvedValue(photoCatalog());
    vi.mocked(sendPhotoRouteFrame).mockImplementation(async (_image, expected) => photoMatch(expected));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it('does no catalog or camera work before opening its panel', async () => {
    renderHook(() => usePhotoRoute(videoRef, true, false));
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(loadPhotoRoute).not.toHaveBeenCalled();
    expect(capturePhotoRouteFrame).not.toHaveBeenCalled();
  });

  it('loads references but never scans until explicitly started', async () => {
    const { result } = renderHook(() => usePhotoRoute(videoRef, true, true));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.catalog?.ready).toBe(true);
    expect(sendPhotoRouteFrame).not.toHaveBeenCalled();
  });

  it('advances through the expected point after stable fresh frames', async () => {
    const { result } = renderHook(() => usePhotoRoute(videoRef, true, true));
    await act(() => vi.advanceTimersByTimeAsync(0));
    act(() => result.current.start());
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(result.current.progress.index).toBe(0);
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(result.current.progress.index).toBe(1);
    expect(result.current.progress.confirmedIds).toEqual(['point-01']);
  });

  it('never overlaps requests and discards responses after pausing', async () => {
    let resolve!: (result: PhotoRouteResult) => void;
    vi.mocked(sendPhotoRouteFrame).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const { result } = renderHook(() => usePhotoRoute(videoRef, true, true));
    await act(() => vi.advanceTimersByTimeAsync(0));
    act(() => result.current.start());
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(sendPhotoRouteFrame).toHaveBeenCalledTimes(1);
    const signal = vi.mocked(sendPhotoRouteFrame).mock.calls[0][4];
    act(() => result.current.pause());
    expect(signal.aborted).toBe(true);
    await act(async () => resolve(photoMatch()));
    expect(result.current.progress.hits).toBe(0);
    expect(result.current.snapshot).toBeNull();
  });

  it('completes four enabled points, never requests point five, and stops capturing', async () => {
    const { result } = renderHook(() => usePhotoRoute(videoRef, true, true));
    await act(() => vi.advanceTimersByTimeAsync(0));
    act(() => result.current.start());
    for (let frame = 0; frame < 20; frame++) {
      await act(() => vi.advanceTimersByTimeAsync(1000));
    }
    expect(result.current.progress.index).toBe(4);
    expect(result.current.progress.confirmedIds).toEqual(photoCatalog().points.map((point) => point.id));
    expect(result.current.running).toBe(false);
    expect(result.current.finishVisible).toBe(true);
    expect(sendPhotoRouteFrame).not.toHaveBeenCalledWith(
      expect.anything(), 'point-05', expect.anything(), expect.anything(), expect.anything(),
    );
    act(() => result.current.dismissFinish());
    expect(result.current.finishVisible).toBe(false);
    expect(result.current.complete).toBe(true);
    const calls = vi.mocked(sendPhotoRouteFrame).mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(sendPhotoRouteFrame).toHaveBeenCalledTimes(calls);
    expect(result.current.finishVisible).toBe(false);
    act(() => result.current.selectPoint(0));
    expect(result.current.complete).toBe(false);
  });

  it('does not show a finish notification after an ambiguous final view', async () => {
    vi.mocked(sendPhotoRouteFrame).mockResolvedValue({
      ...photoMatch('point-04'), status: 'ambiguous', expected_matched: false, recognized_point_id: null,
    });
    const { result } = renderHook(() => usePhotoRoute(videoRef, true, true));
    await act(() => vi.advanceTimersByTimeAsync(0));
    act(() => result.current.selectPoint(3));
    act(() => result.current.start());
    for (let frame = 0; frame < 5; frame++) await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(result.current.finishVisible).toBe(false);
    expect(result.current.complete).toBe(false);
    expect(result.current.progress.index).toBe(3);
  });

  it('rejects old frames and expires the visible result', async () => {
    let resolve!: (result: PhotoRouteResult) => void;
    vi.mocked(sendPhotoRouteFrame).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const { result } = renderHook(() => usePhotoRoute(videoRef, true, true));
    await act(() => vi.advanceTimersByTimeAsync(0));
    act(() => result.current.start());
    await act(() => vi.advanceTimersByTimeAsync(4000));
    await act(async () => resolve(photoMatch()));
    expect(result.current.progress.hits).toBe(0);
    expect(result.current.error).toContain('too old');
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(result.current.snapshotExpired).toBe(true);
  });

  it('pauses when references change instead of mixing catalogs', async () => {
    vi.mocked(sendPhotoRouteFrame).mockResolvedValue({ ...photoMatch(), status: 'references_changed', revision: 'new-revision' });
    const { result } = renderHook(() => usePhotoRoute(videoRef, true, true));
    await act(() => vi.advanceTimersByTimeAsync(0));
    act(() => result.current.start());
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.running).toBe(false);
    expect(result.current.catalog?.ready).toBe(false);
    expect(result.current.error).toContain('References changed');
  });

  it('will not start with missing references or an inactive camera', async () => {
    vi.mocked(loadPhotoRoute).mockResolvedValue(photoCatalog(false));
    const { result } = renderHook(() => usePhotoRoute(videoRef, false, true));
    await act(() => vi.advanceTimersByTimeAsync(0));
    act(() => result.current.start());
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(result.current.running).toBe(false);
    expect(sendPhotoRouteFrame).not.toHaveBeenCalled();
  });

  it('keeps tracking when the panel closes and stops when the camera stops', async () => {
    const { result, rerender } = renderHook(
      ({ camera, open }) => usePhotoRoute(videoRef, camera, open),
      { initialProps: { camera: true, open: true } },
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    act(() => result.current.start());
    rerender({ camera: true, open: false });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.running).toBe(true);
    rerender({ camera: false, open: false });
    expect(result.current.running).toBe(false);
  });
});
