import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { graphPointsWithinDistance, type NavigationGraph } from '../navigation/graph';
import { captureJpegFrame } from '../utils/cvFrame';

type Reference = { id: string; image: string; pointId: string; facingTarget: string | null };
type Catalog = {
  revision: string;
  searchRadiusMeters: number;
  updateThresholdMeters: number;
  references: Reference[];
};
type Match = {
  status: 'matched' | 'no_match' | 'busy' | 'references_changed';
  reference_id: string | null;
  point_id: string | null;
  confidence: number;
};
const poseKey = (reference: Reference) => JSON.stringify([reference.pointId, reference.facingTarget]);

const INTERVAL_MS = 1000;
const COOLDOWN_MS = 8000;
const CONFIRMATIONS = 3;
const ABSENCE_FRAMES = 3;
const MAX_FRAME_AGE_MS = 3000;

export function useCvLocalization(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  graph: NavigationGraph | null,
  pointId: string | null,
  onConfirmed: (reference: Reference) => void,
) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState('');
  const activeRef = useRef<Reference[]>([]);
  const confirmedRef = useRef(onConfirmed);
  confirmedRef.current = onConfirmed;
  const anchorRef = useRef<string | null>(null);
  const catalogRef = useRef<Catalog | null>(null);
  const streakRef = useRef<{ id: string | null; hits: number; lastAt: number }>({ id: null, hits: 0, lastAt: 0 });
  const latchRef = useRef<{ id: string | null; absent: number; appliedAt: number }>({ id: null, absent: 0, appliedAt: 0 });
  const index = useMemo(() => {
    const byPoint = new Map<string, Reference[]>();
    let invalid: Reference | undefined;
    if (catalog && graph) {
      for (const reference of catalog.references) {
        if (!graph.has(reference.pointId) || (reference.facingTarget && !graph.has(reference.facingTarget))) {
          invalid ??= reference;
        }
        const entries = byPoint.get(reference.pointId) ?? [];
        entries.push(reference);
        byPoint.set(reference.pointId, entries);
      }
    }
    return { byPoint, invalid };
  }, [catalog, graph]);

  useEffect(() => {
    if (!catalog || !graph || !pointId || !graph.has(pointId)) {
      activeRef.current = [];
      anchorRef.current = null;
      return;
    }
    const invalid = index.invalid;
    if (invalid) {
      activeRef.current = [];
      setError(`Localization reference ${invalid.id} has a missing graph point: ${
        !graph.has(invalid.pointId) ? invalid.pointId : invalid.facingTarget
      }.`);
      return;
    }
    setError('');
    if (anchorRef.current && catalogRef.current === catalog
      && graphPointsWithinDistance(graph, anchorRef.current, catalog.updateThresholdMeters).has(pointId)) return;
    const points = graphPointsWithinDistance(graph, pointId, catalog.searchRadiusMeters);
    activeRef.current = Array.from(points).flatMap((point) => index.byPoint.get(point) ?? []);
    if (!activeRef.current.some((reference) => poseKey(reference) === latchRef.current.id)) {
      latchRef.current.id = null;
      latchRef.current.absent = 0;
    }
    anchorRef.current = pointId;
    catalogRef.current = catalog;
  }, [catalog, graph, pointId, index]);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let timer: number | undefined;
    let controller: AbortController | null = null;
    let currentCatalog: Catalog | null = null;
    let lastCatalogAt = 0;
    const canvas = document.createElement('canvas');

    const scan = async () => {
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 18_000);
      try {
        if (!currentCatalog || Date.now() - lastCatalogAt > 30_000) {
          const response = await fetch('/api/v1/cv/localization/references', { signal: controller.signal });
          if (!response.ok) {
            throw new Error(`Localization catalog returned HTTP ${response.status}: ${(await response.text()).slice(0, 240)}`);
          }
          const next = await response.json() as Catalog;
          if (disposed) return;
          if (!currentCatalog || currentCatalog.revision !== next.revision) {
            currentCatalog = next;
            setCatalog(next);
            activeRef.current = [];
            anchorRef.current = null;
            streakRef.current = { id: null, hits: 0, lastAt: 0 };
          }
          lastCatalogAt = Date.now();
        }
        const refs = activeRef.current;
        if (refs.length > 256) throw new Error('More than 256 localization references are active; reduce the search radius.');
        const video = videoRef.current;
        if (!video || !refs.length) return;
        const capturedAt = performance.now();
        const image = captureJpegFrame(video, canvas);
        if (!image) return;
        const response = await fetch('/api/v1/cv/localization/match', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({ image_payload: image, reference_ids: refs.map((ref) => ref.id), revision: currentCatalog.revision }),
        });
        if (!response.ok) throw new Error(`Localization match returned HTTP ${response.status}: ${(await response.text()).slice(0, 240)}`);
        const result = await response.json() as Match;
        if (disposed || performance.now() - capturedAt > MAX_FRAME_AGE_MS) return;
        if (result.status === 'references_changed') {
          currentCatalog = null;
          activeRef.current = [];
          return;
        }
        if (result.status === 'busy') return;
        const reference = result.status === 'matched' && result.confidence >= 0.6
          ? activeRef.current.find((item) => item.id === result.reference_id && item.pointId === result.point_id)
          : undefined;
        if (!reference) {
          streakRef.current = { id: null, hits: 0, lastAt: 0 };
          if (++latchRef.current.absent >= ABSENCE_FRAMES) latchRef.current.id = null;
          setError('');
          return;
        }
        if (latchRef.current.id === poseKey(reference)) {
          latchRef.current.absent = 0;
          streakRef.current = { id: null, hits: 0, lastAt: 0 };
          setError('');
          return;
        }
        const now = performance.now();
        const previous = streakRef.current;
        const key = poseKey(reference);
        const hits = previous.id === key && now - previous.lastAt <= 4000 ? previous.hits + 1 : 1;
        streakRef.current = { id: key, hits, lastAt: now };
        if (hits >= CONFIRMATIONS && (latchRef.current.appliedAt === 0 || now - latchRef.current.appliedAt >= COOLDOWN_MS)) {
          confirmedRef.current(reference);
          latchRef.current = { id: key, absent: 0, appliedAt: now };
          streakRef.current = { id: null, hits: 0, lastAt: 0 };
        }
        setError('');
      } catch (caught) {
        if (!disposed) {
          streakRef.current = { id: null, hits: 0, lastAt: 0 };
          setError(caught instanceof Error ? caught.message : 'Localization request failed.');
        }
      } finally {
        window.clearTimeout(timeout);
        if (!disposed) timer = window.setTimeout(() => void scan(), INTERVAL_MS);
      }
    };
    void scan();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      controller?.abort();
      streakRef.current = { id: null, hits: 0, lastAt: 0 };
    };
  }, [enabled, videoRef]);

  return { error, catalog };
}
