import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureJpegFrame } from '../utils/cvFrame';
import { sendSceneAnalysisFrame, type SceneAnalysisResult } from '../utils/sceneAnalysis';
import { useSceneAnalysis } from './useSceneAnalysis';

vi.mock('../utils/cvFrame', () => ({ captureJpegFrame: vi.fn() }));
vi.mock('../utils/sceneAnalysis', async (importOriginal) => ({
  ...await importOriginal<typeof import('../utils/sceneAnalysis')>(),
  sendSceneAnalysisFrame: vi.fn(),
}));

const sceneResult: SceneAnalysisResult = {
  status: 'ready', detector_status: 'ready', text_status: 'ready',
  model_name: 'yoloe-26n-seg-pf.pt', vocabulary_size: 4585,
  detections: [], messages: [], image_width: 640, image_height: 480,
  object_time_ms: 70, text_time_ms: 120, processing_time_ms: 190, diagnostic_only: true,
};

describe('useSceneAnalysis', () => {
  const videoRef = { current: document.createElement('video') };
  const canvasRef = { current: document.createElement('canvas') };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(captureJpegFrame).mockReturnValue('jpeg');
    vi.mocked(sendSceneAnalysisFrame).mockResolvedValue(sceneResult);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it('does not capture or send frames when disabled', async () => {
    renderHook(() => useSceneAnalysis(videoRef, canvasRef, false, 0.25, true));
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(captureJpegFrame).not.toHaveBeenCalled();
    expect(sendSceneAnalysisFrame).not.toHaveBeenCalled();
  });

  it('never overlaps requests and waits after completion', async () => {
    let resolve: (result: SceneAnalysisResult) => void = () => {};
    vi.mocked(sendSceneAnalysisFrame).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const { result } = renderHook(() => useSceneAnalysis(videoRef, canvasRef, true, 0.4, false));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(sendSceneAnalysisFrame).toHaveBeenCalledTimes(1);
    expect(sendSceneAnalysisFrame).toHaveBeenLastCalledWith('jpeg', 1, 0.4, false, expect.any(AbortSignal));
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(sendSceneAnalysisFrame).toHaveBeenCalledTimes(1);
    await act(async () => resolve(sceneResult));
    expect(result.current.snapshot?.result).toEqual(sceneResult);
    await act(() => vi.advanceTimersByTimeAsync(999));
    expect(sendSceneAnalysisFrame).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(sendSceneAnalysisFrame).toHaveBeenCalledTimes(2);
  });

  it('aborts and discards late results after disabling', async () => {
    let resolve: (result: SceneAnalysisResult) => void = () => {};
    vi.mocked(sendSceneAnalysisFrame).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const { result, rerender } = renderHook(
      ({ active }) => useSceneAnalysis(videoRef, canvasRef, active, 0.25, true),
      { initialProps: { active: true } },
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    const signal = vi.mocked(sendSceneAnalysisFrame).mock.calls[0][4];
    rerender({ active: false });
    expect(signal.aborted).toBe(true);
    await act(async () => resolve(sceneResult));
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(result.current.snapshot).toBeNull();
    expect(sendSceneAnalysisFrame).toHaveBeenCalledTimes(1);
  });

  it('waits for a video frame without issuing an empty request', async () => {
    vi.mocked(captureJpegFrame).mockReturnValue(null);
    renderHook(() => useSceneAnalysis(videoRef, canvasRef, true, 0.25, true));
    await act(() => vi.advanceTimersByTimeAsync(2500));
    expect(sendSceneAnalysisFrame).not.toHaveBeenCalled();
    expect(captureJpegFrame).toHaveBeenCalledTimes(3);
  });

  it('recovers from errors on the next fresh frame', async () => {
    vi.mocked(sendSceneAnalysisFrame).mockRejectedValueOnce(new Error('unavailable'));
    const { result } = renderHook(() => useSceneAnalysis(videoRef, canvasRef, true, 0.25, true));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.error).toBe('unavailable');
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(result.current.error).toBe('');
    expect(result.current.snapshot?.result.status).toBe('ready');
  });
});
