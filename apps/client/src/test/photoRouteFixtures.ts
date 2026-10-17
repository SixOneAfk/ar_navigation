import type { PhotoRouteCatalog, PhotoRouteResult } from '../utils/photoRoute';

export function photoCatalog(ready = true): PhotoRouteCatalog {
  return {
    id: 'pilot-route', name: 'Four-point test route', revision: 'test-revision', ready,
    reference_root: 'apps/cv-service/route_photos', warnings: [],
    disabled_points: [{ id: 'point-05', name: 'Point 5' }],
    points: Array.from({ length: 4 }, (_, index) => ({
      id: `point-0${index + 1}`, name: `Point ${index + 1}`,
      reference_count: ready ? 2 : 0, usable_reference_count: ready ? 2 : 0,
      files: ready ? ['front.jpg', 'side.jpg'] : [],
    })),
  };
}

export function photoMatch(pointId = 'point-01', expectedPointId = pointId): PhotoRouteResult {
  const candidate = {
    point_id: pointId, score: 0.88, reference_file: 'front.jpg', inliers: 42,
    good_matches: 50, inlier_ratio: 0.84, reference_coverage: 0.4,
    frame_coverage: 0.3, visible_fraction: 0.8, reprojection_error_px: 0.7,
    outline: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }],
  };
  return {
    status: 'matched', revision: 'test-revision', expected_point_id: expectedPointId,
    recognized_point_id: pointId, expected_matched: pointId === expectedPointId,
    candidate, candidates: [candidate], margin: 0.3, query_features: 800,
    processing_time_ms: 42, diagnostic_only: true,
  };
}
