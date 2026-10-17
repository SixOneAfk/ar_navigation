import { useEffect, useState, type RefObject } from 'react';
import { captureJpegFrame } from '../utils/cvFrame';
import {
  SCENE_FRAME_INTERVAL_MS,
  sendSceneAnalysisFrame,
  type SceneAnalysisResult,
} from '../utils/sceneAnalysis';

type SceneSnapshot = {
  result: SceneAnalysisResult;
  capturedAt: number;
  roundTripMs: number;
};

export function useSceneAnalysis(
  videoRef: RefObject<HTMLVideoElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  active: boolean,
  minimumConfidence: number,
  includeText: boolean,
) {
  const [snapshot, setSnapshot] = useState<SceneSnapshot | null>(null);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;
    let timeout: number | undefined;
    let controller: AbortController | null = null;
    let sequence = 0;
    setSnapshot(null);
    setError('');
    setProcessing(false);
    if (!active) return;

    const scan = async () => {
      try {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;
        const capturedAt = performance.now();
        const image = captureJpegFrame(video, canvas);
        if (!image) return;
        controller = new AbortController();
        timeout = window.setTimeout(() => controller?.abort(), 35_000);
        setProcessing(true);
        const result = await sendSceneAnalysisFrame(
          image, ++sequence, minimumConfidence, includeText, controller.signal,
        );
        if (disposed) return;
        setSnapshot({ result, capturedAt, roundTripMs: Math.round(performance.now() - capturedAt) });
        setError('');
      } catch (caught) {
        if (disposed) return;
        setSnapshot(null);
        setError(caught instanceof Error && caught.name !== 'AbortError'
          ? caught.message
          : 'Scene analysis timed out. Try disabling text recognition.');
      } finally {
        window.clearTimeout(timeout);
        if (!disposed) {
          setProcessing(false);
          // Schedule after completion; never queue video frames.
          timer = window.setTimeout(() => void scan(), SCENE_FRAME_INTERVAL_MS);
        }
      }
    };
    timer = window.setTimeout(() => void scan(), 0);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      window.clearTimeout(timeout);
      controller?.abort();
    };
  }, [active, minimumConfidence, includeText, videoRef, canvasRef]);

  return { snapshot, error, processing };
}
