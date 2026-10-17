import { afterEach, describe, expect, it, vi } from 'vitest';
import { photoCatalog, photoMatch } from '../test/photoRouteFixtures';
import {
  applyPhotoObservation, DEFAULT_PHOTO_ROUTE_OPTIONS, initialPhotoProgress,
  loadPhotoRoute, sendPhotoRouteFrame,
} from './photoRoute';

const ids = photoCatalog().points.map((point) => point.id);

describe('ordered photo route confirmation', () => {
  it('advances one point only after three stable observations', () => {
    let progress = initialPhotoProgress();
    for (const time of [1000, 2000]) {
      progress = applyPhotoObservation(progress, photoMatch(), ids, 3, time, 4000);
      expect(progress.index).toBe(0);
    }
    progress = applyPhotoObservation(progress, photoMatch(), ids, 3, 3000, 4000);
    expect(progress.index).toBe(1);
    expect(progress.confirmedIds).toEqual(['point-01']);
    expect(progress.hits).toBe(0);
  });

  it('does not advance for out-of-order matches', () => {
    const progress = applyPhotoObservation(initialPhotoProgress(), photoMatch('point-03', 'point-01'), ids, 3, 1000, 4000);
    expect(progress.index).toBe(0);
    expect(progress.hits).toBe(0);
  });

  it('resets confirmations on ambiguous or missing evidence', () => {
    const first = applyPhotoObservation(initialPhotoProgress(), photoMatch(), ids, 3, 1000, 4000);
    const ambiguous = { ...photoMatch(), status: 'ambiguous' as const, expected_matched: false, recognized_point_id: null };
    expect(applyPhotoObservation(first, ambiguous, ids, 3, 2000, 4000).hits).toBe(0);
  });

  it('does not count duplicate timestamps or stale target responses', () => {
    const first = applyPhotoObservation(initialPhotoProgress(), photoMatch(), ids, 3, 1000, 4000);
    expect(applyPhotoObservation(first, photoMatch(), ids, 3, 1000, 4000)).toBe(first);
    const next = { ...initialPhotoProgress(1), confirmedIds: ['point-01'] };
    expect(applyPhotoObservation(next, photoMatch(), ids, 3, 2000, 4000).index).toBe(1);
  });

  it('requires a minimum observation duration and rejects long gaps', () => {
    let progress = initialPhotoProgress();
    for (const time of [0, 100, 200]) progress = applyPhotoObservation(progress, photoMatch(), ids, 3, time, 4000);
    expect(progress.index).toBe(0);
    progress = applyPhotoObservation(progress, photoMatch(), ids, 3, 6000, 4000);
    expect(progress.hits).toBe(1);
  });

  it('finishes all four enabled points without wrapping around', () => {
    let progress = initialPhotoProgress();
    let time = 1000;
    for (const id of ids) {
      for (let hit = 0; hit < 3; hit++) {
        progress = applyPhotoObservation(progress, photoMatch(id), ids, 3, time, 4000);
        time += 1000;
      }
    }
    expect(progress.index).toBe(4);
    expect(progress.confirmedIds).toEqual(ids);
    expect(applyPhotoObservation(progress, photoMatch(), ids, 3, time, 4000)).toBe(progress);
  });
});

describe('photo route HTTP contract', () => {
  afterEach(() => vi.restoreAllMocks());

  it('supports explicit reference reload', async () => {
    const catalog = photoCatalog();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(catalog)));
    expect(await loadPhotoRoute(true)).toEqual(catalog);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/cv/photo-route?reload=true');
  });

  it('sends image, expected point, revision, thresholds, and cancellation', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(photoMatch())));
    const signal = new AbortController().signal;
    await sendPhotoRouteFrame('jpeg', 'point-01', 'revision', DEFAULT_PHOTO_ROUTE_OPTIONS, signal);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/cv/photo-route/match');
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(signal);
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toMatchObject({
      image_payload: 'jpeg', expected_point_id: 'point-01', revision: 'revision',
      minimum_score: 0.6, minimum_margin: 0.1, minimum_visible_fraction: 0.1,
    });
  });

  it('reports backend configuration errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ detail: 'Invalid route configuration' }), { status: 400 }));
    await expect(loadPhotoRoute()).rejects.toThrow('Invalid route configuration');
  });
});
