import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SceneAnalysisResult } from '../utils/sceneAnalysis';
import { SceneAnalysisOverlay } from './SceneAnalysisOverlay';

const result: SceneAnalysisResult = {
  status: 'ready', detector_status: 'ready', text_status: 'disabled',
  model_name: 'test', vocabulary_size: 4585,
  detections: [{
    kind: 'object', label: 'door', confidence: 0.85,
    polygon: [{ x: 0.25, y: 0.2 }, { x: 0.75, y: 0.2 }, { x: 0.75, y: 0.9 }, { x: 0.25, y: 0.9 }],
  }],
  messages: [], image_width: 640, image_height: 480,
  object_time_ms: 70, text_time_ms: 0, processing_time_ms: 70, diagnostic_only: true,
};

describe('SceneAnalysisOverlay', () => {
  const context = {
    setTransform: vi.fn(), clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(),
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
    fill: vi.fn(), stroke: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 70 })),
  };
  let frame: FrameRequestCallback;

  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  function setup(active = true) {
    const video = document.createElement('video');
    Object.defineProperties(video, { videoWidth: { value: 640 }, videoHeight: { value: 480 } });
    const view = render(<SceneAnalysisOverlay videoRef={{ current: video }} result={result} capturedAt={1000} active={active} />);
    const canvas = view.container.querySelector('canvas');
    if (canvas) {
      Object.defineProperties(canvas, { clientWidth: { value: 640 }, clientHeight: { value: 480 } });
    }
    return view;
  }

  it('has no canvas or animation work when disabled', () => {
    const view = setup(false);
    expect(view.container.querySelector('canvas')).toBeNull();
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('draws mapped contours and labels then clears stale detections', () => {
    setup();
    frame(1100);
    expect(context.moveTo).toHaveBeenCalledWith(160, 96);
    expect(context.closePath).toHaveBeenCalled();
    expect(context.fillText).toHaveBeenCalledWith('door 85%', expect.any(Number), expect.any(Number), expect.any(Number));
    const draws = context.fillText.mock.calls.length;
    frame(1200);
    expect(context.fillText.mock.calls.length).toBe(draws);
    frame(4100);
    expect(context.clearRect).toHaveBeenCalledTimes(2);
    expect(context.fillText.mock.calls.length).toBe(draws);
  });

  it('cancels drawing on unmount', () => {
    const view = setup();
    view.unmount();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
  });
});
