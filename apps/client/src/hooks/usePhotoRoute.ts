import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { capturePhotoRouteFrame } from '../utils/cvFrame';
import {
  applyPhotoObservation, clearPhotoStreak, DEFAULT_PHOTO_ROUTE_OPTIONS,
  initialPhotoProgress, loadPhotoRoute, sendPhotoRouteFrame,
  type PhotoRouteCatalog, type PhotoRouteOptions, type PhotoRouteResult,
} from '../utils/photoRoute';

export function usePhotoRoute(
  videoRef: RefObject<HTMLVideoElement | null>, cameraActive: boolean, isOpen: boolean,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const catalogRef = useRef<PhotoRouteCatalog | null>(null);
  const catalogAbortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const [catalog, setCatalog] = useState<PhotoRouteCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [options, setOptions] = useState<PhotoRouteOptions>(DEFAULT_PHOTO_ROUTE_OPTIONS);
  const [progress, setProgress] = useState(initialPhotoProgress);
  const [snapshotExpired, setSnapshotExpired] = useState(false);
  const [finishDismissed, setFinishDismissed] = useState(false);
  const [snapshot, setSnapshot] = useState<{
    result: PhotoRouteResult; image: string; capturedAt: number; roundTripMs: number;
    frameWidth: number; frameHeight: number;
  } | null>(null);

  useEffect(() => {
    setSnapshotExpired(false);
    if (!snapshot) return;
    const timer = window.setTimeout(() => setSnapshotExpired(true),
      Math.max(0, 3000 - (performance.now() - snapshot.capturedAt)));
    return () => window.clearTimeout(timer);
  }, [snapshot]);

  const reload = useCallback(async (force = true) => {
    const generation = ++generationRef.current;
    catalogAbortRef.current?.abort();
    const controller = new AbortController();
    catalogAbortRef.current = controller;
    setRunning(false);
    setLoading(true);
    setError('');
    setSnapshot(null);
    setProgress(initialPhotoProgress());
    setFinishDismissed(false);
    try {
      const next = await loadPhotoRoute(force, controller.signal);
      if (generation !== generationRef.current || controller.signal.aborted) return;
      catalogRef.current = next;
      setCatalog(next);
    } catch (caught) {
      if (generation === generationRef.current && !controller.signal.aborted) {
        setError(caught instanceof Error ? caught.message : 'Cannot load photo references');
      }
    } finally {
      if (catalogAbortRef.current === controller) {
        catalogAbortRef.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (isOpen && !catalogRef.current) void reload(false);
  }, [isOpen, reload]);

  useEffect(() => () => {
    generationRef.current++;
    catalogAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!cameraActive) {
      setRunning(false);
      setProgress(clearPhotoStreak);
      setSnapshot(null);
    }
  }, [cameraActive]);

  const expected = catalog?.points[progress.index];
  const finalPoint = catalog?.points[catalog.points.length - 1];
  const complete = Boolean(catalog && finalPoint && progress.index >= catalog.points.length
    && progress.confirmedIds.includes(finalPoint.id));
  useEffect(() => {
    if (catalog && progress.index >= catalog.points.length) setRunning(false);
  }, [catalog, progress.index]);

  useEffect(() => {
    if (!running || !cameraActive || !catalog?.ready || !expected) return;
    let disposed = false;
    let timer: number | undefined;
    let timeout: number | undefined;
    let controller: AbortController | null = null;
    const generation = generationRef.current;
    const scan = async () => {
      try {
        const video = videoRef.current;
        const canvas = canvasRef.current ?? document.createElement('canvas');
        canvasRef.current = canvas;
        if (!video) return;
        const capturedAt = performance.now();
        const image = capturePhotoRouteFrame(video, canvas);
        if (!image) return;
        const frameWidth = canvas.width;
        const frameHeight = canvas.height;
        controller = new AbortController();
        timeout = window.setTimeout(() => controller?.abort(), 18_000);
        setProcessing(true);
        const result = await sendPhotoRouteFrame(image, expected.id, catalog.revision, options, controller.signal);
        if (disposed || generation !== generationRef.current) return;
        const roundTripMs = Math.round(performance.now() - capturedAt);
        setSnapshot({ result, image, capturedAt, roundTripMs, frameWidth, frameHeight });
        if (result.revision !== catalog.revision || result.status === 'references_changed') {
          setRunning(false);
          setCatalog((previous) => previous ? { ...previous, ready: false } : previous);
          setError('References changed. Reload references and restart the route.');
          return;
        }
        if (roundTripMs > 3000) {
          setProgress(clearPhotoStreak);
          setError('Frame is too old to confirm a point. Check latency or increase the capture interval.');
          return;
        }
        setError('');
        setProgress((previous) => applyPhotoObservation(
          previous, result, catalog.points.map((point) => point.id), options.confirmations,
          capturedAt, options.intervalMs * 3 + 1000,
        ));
      } catch (caught) {
        if (!disposed && generation === generationRef.current) {
          setProgress(clearPhotoStreak);
          setSnapshot(null);
          setError(caught instanceof Error && caught.name !== 'AbortError'
            ? caught.message : 'Photo route request timed out');
        }
      } finally {
        window.clearTimeout(timeout);
        if (!disposed) {
          setProcessing(false);
          // Wait after completion; never queue camera frames.
          timer = window.setTimeout(() => void scan(), options.intervalMs);
        }
      }
    };
    timer = window.setTimeout(() => void scan(), 0);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      window.clearTimeout(timeout);
      controller?.abort();
      setProcessing(false);
    };
  }, [running, cameraActive, catalog, expected, options, videoRef]);

  function pause() {
    generationRef.current++;
    setRunning(false);
    setProgress(clearPhotoStreak);
  }

  function start() {
    if (!cameraActive || !catalog?.ready || !expected || loading) return;
    setError('');
    setSnapshot(null);
    setProgress(clearPhotoStreak);
    setRunning(true);
  }

  function selectPoint(index: number) {
    if (!catalog || !Number.isInteger(index) || index < 0 || index >= catalog.points.length) return;
    pause();
    setProgress(initialPhotoProgress(index));
    setSnapshot(null);
    setFinishDismissed(false);
  }

  const dismissFinish = useCallback(() => setFinishDismissed(true), []);

  function updateOptions(next: PhotoRouteOptions) {
    pause();
    setOptions(next);
    setSnapshot(null);
  }

  return {
    catalog, loading, error, running, processing, options, progress, snapshot, snapshotExpired, expected,
    reload, start, pause, selectPoint, updateOptions, complete,
    finishVisible: complete && !finishDismissed, dismissFinish,
  };
}
