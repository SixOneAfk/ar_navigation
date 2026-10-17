import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSceneResultFresh, sceneDetectionLabel, sendSceneAnalysisFrame } from './sceneAnalysis';

describe('scene analysis transport', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses the diagnostic endpoint and passes settings and cancellation', async () => {
    const result = { status: 'ready', diagnostic_only: true, detections: [] };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ sceneAnalysis: result }), { status: 200 }),
    );
    const controller = new AbortController();

    expect(await sendSceneAnalysisFrame('jpeg', 7, 0.4, false, controller.signal)).toEqual(result);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/cv/scene-analysis');
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal);
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      image_payload: 'jpeg', sequence_number: 7, minimum_confidence: 0.4, include_text: false,
    });
  });

  it('reports gateway errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 502 }));
    await expect(sendSceneAnalysisFrame('jpeg', 1, 0.25, true, new AbortController().signal))
      .rejects.toThrow('HTTP 502');
  });
});

describe('scene overlay helpers', () => {
  it('expires using frame capture time, not response receipt time', () => {
    expect(isSceneResultFresh(1000, 3999)).toBe(true);
    expect(isSceneResultFresh(1000, 4001)).toBe(false);
    expect(isSceneResultFresh(1000, 900)).toBe(false);
    expect(isSceneResultFresh(Number.NaN, 1000)).toBe(false);
  });

  it('labels text separately and preserves model confidence', () => {
    expect(sceneDetectionLabel({
      kind: 'object', label: 'door', confidence: 0.856, polygon: [],
    })).toBe('door 86%');
    expect(sceneDetectionLabel({
      kind: 'text', label: 'ROOM 101', confidence: 0.96, polygon: [],
    })).toBe('Text: ROOM 101 96%');
  });
});
