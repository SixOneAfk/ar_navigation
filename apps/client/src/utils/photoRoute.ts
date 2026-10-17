import type { NormalizedPoint } from './cvFrame';

export type PhotoRoutePoint = {
  id: string;
  name: string;
  reference_count: number;
  usable_reference_count: number;
  files: string[];
};

export type PhotoRouteCatalog = {
  id: string;
  name: string;
  revision: string;
  ready: boolean;
  reference_root: string;
  points: PhotoRoutePoint[];
  disabled_points?: Array<{ id: string; name: string }>;
  warnings: string[];
};

export type PhotoRouteCandidate = {
  point_id: string;
  score: number;
  reference_file: string;
  inliers: number;
  good_matches: number;
  inlier_ratio: number;
  reference_coverage: number;
  overlap_coverage?: number;
  reference_visible_fraction?: number;
  frame_coverage: number;
  visible_fraction: number;
  reprojection_error_px: number;
  outline: NormalizedPoint[];
};

export type PhotoRouteAttempt = {
  point_id: string;
  reference_file: string;
  reference_features: number;
  good_matches: number;
  inliers: number;
  minimum_inliers: number;
  rejection_reason: 'insufficient_matches' | 'unstable_geometry' | 'insufficient_inliers'
    | 'inconsistent_matches' | 'concentrated_matches' | 'invalid_projection'
    | 'reference_mostly_outside_frame' | 'high_reprojection_error' | null;
};

export type PhotoRouteResult = {
  status: 'matched' | 'no_match' | 'ambiguous' | 'too_small' | 'low_detail' | 'busy' | 'not_ready' | 'references_changed';
  revision: string;
  expected_point_id: string;
  recognized_point_id: string | null;
  expected_matched: boolean;
  candidate: PhotoRouteCandidate | null;
  candidates: PhotoRouteCandidate[];
  attempt?: PhotoRouteAttempt | null;
  attempts?: PhotoRouteAttempt[];
  margin: number;
  query_features: number;
  processing_time_ms: number;
  diagnostic_only: boolean;
};

export type PhotoRouteOptions = {
  minimumScore: number;
  minimumMargin: number;
  minimumVisibleFraction: number;
  confirmations: number;
  intervalMs: number;
};

export const DEFAULT_PHOTO_ROUTE_OPTIONS: PhotoRouteOptions = {
  minimumScore: 0.60, minimumMargin: 0.10, minimumVisibleFraction: 0.10,
  confirmations: 3, intervalMs: 1000,
};

export type PhotoRouteProgress = {
  index: number;
  hits: number;
  firstHitAt: number | null;
  lastHitAt: number | null;
  lastFrameAt: number | null;
  confirmedIds: string[];
};

export function initialPhotoProgress(index = 0): PhotoRouteProgress {
  return { index, hits: 0, firstHitAt: null, lastHitAt: null, lastFrameAt: null, confirmedIds: [] };
}

export function clearPhotoStreak(progress: PhotoRouteProgress): PhotoRouteProgress {
  return { ...progress, hits: 0, firstHitAt: null, lastHitAt: null };
}

export function applyPhotoObservation(
  progress: PhotoRouteProgress,
  result: PhotoRouteResult,
  pointIds: string[],
  confirmations: number,
  capturedAt: number,
  maximumGapMs: number,
): PhotoRouteProgress {
  if (progress.index >= pointIds.length || !Number.isFinite(capturedAt)
    || (progress.lastFrameAt !== null && capturedAt <= progress.lastFrameAt)) return progress;
  const expected = pointIds[progress.index];
  const observed = { ...progress, lastFrameAt: capturedAt };
  if (result.status !== 'matched' || !result.expected_matched
    || result.expected_point_id !== expected || result.recognized_point_id !== expected) {
    return clearPhotoStreak(observed);
  }
  const continuing = progress.lastHitAt !== null && capturedAt - progress.lastHitAt <= maximumGapMs;
  const hits = continuing ? progress.hits + 1 : 1;
  const firstHitAt = continuing ? progress.firstHitAt ?? capturedAt : capturedAt;
  if (hits < confirmations || capturedAt - firstHitAt < 1000) {
    return { ...observed, hits, firstHitAt, lastHitAt: capturedAt };
  }
  return {
    ...clearPhotoStreak(observed), index: progress.index + 1,
    confirmedIds: [...progress.confirmedIds, expected],
  };
}

async function photoRouteResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json() as { detail?: unknown; message?: unknown };
      if (typeof body.detail === 'string') detail = body.detail;
      else if (typeof body.message === 'string') detail = body.message;
    } catch { /* The gateway may return an empty error body. */ }
    throw new Error(`Photo route HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  return await response.json() as T;
}

export async function loadPhotoRoute(force = false, signal?: AbortSignal): Promise<PhotoRouteCatalog> {
  return photoRouteResponse<PhotoRouteCatalog>(await fetch(
    `/api/v1/cv/photo-route${force ? '?reload=true' : ''}`, { signal },
  ));
}

export async function sendPhotoRouteFrame(
  imagePayload: string, expectedPointId: string, revision: string,
  options: PhotoRouteOptions, signal: AbortSignal,
): Promise<PhotoRouteResult> {
  return photoRouteResponse<PhotoRouteResult>(await fetch('/api/v1/cv/photo-route/match', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({
      image_payload: imagePayload, expected_point_id: expectedPointId, revision,
      minimum_score: options.minimumScore, minimum_margin: options.minimumMargin,
      minimum_visible_fraction: options.minimumVisibleFraction,
    }),
  }));
}
