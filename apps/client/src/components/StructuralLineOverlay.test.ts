import { describe, expect, it } from 'vitest';
import {
  mapCapturedPointToCover,
  shouldDisplayWallOutline,
  wallOutlineSegments,
} from './StructuralLineOverlay';

describe('mapCapturedPointToCover', () => {
  it('maps the 4:3 capture crop back onto a 16:9 video', () => {
    const topLeft = mapCapturedPointToCover(
      { x: 0, y: 0 },
      { width: 1280, height: 720 },
      { width: 1280, height: 720 },
    );
    const bottomRight = mapCapturedPointToCover(
      { x: 1, y: 1 },
      { width: 1280, height: 720 },
      { width: 1280, height: 720 },
    );

    expect(topLeft.x).toBeCloseTo(160);
    expect(topLeft.y).toBeCloseTo(0);
    expect(bottomRight.x).toBeCloseTo(1120);
    expect(bottomRight.y).toBeCloseTo(720);
  });

  it('maps the centered crop of a portrait source', () => {
    const topLeft = mapCapturedPointToCover(
      { x: 0, y: 0 },
      { width: 720, height: 1280 },
      { width: 360, height: 640 },
    );
    const bottomRight = mapCapturedPointToCover(
      { x: 1, y: 1 },
      { width: 720, height: 1280 },
      { width: 360, height: 640 },
    );

    expect(topLeft.x).toBeCloseTo(0);
    expect(topLeft.y).toBeCloseTo(185);
    expect(bottomRight.x).toBeCloseTo(360);
    expect(bottomRight.y).toBeCloseTo(455);
  });

  it('accounts for object-fit cover clipping', () => {
    const left = mapCapturedPointToCover(
      { x: 0, y: 0.5 },
      { width: 640, height: 480 },
      { width: 400, height: 400 },
    );
    const right = mapCapturedPointToCover(
      { x: 1, y: 0.5 },
      { width: 640, height: 480 },
      { width: 400, height: 400 },
    );

    expect(left.x).toBeCloseTo(-66.667, 2);
    expect(right.x).toBeCloseTo(466.667, 2);
    expect(left.y).toBeCloseTo(200);
  });
});
describe('wallOutlineSegments', () => {
  it('returns only the top, left, and right wall edges', () => {
    const outline = {
      top_left: { x: 0.2, y: 0.2 },
      top_right: { x: 0.8, y: 0.2 },
      bottom_right: { x: 0.9, y: 0.8 },
      bottom_left: { x: 0.1, y: 0.8 },
    };

    expect(wallOutlineSegments(outline)).toEqual([
      [outline.top_left, outline.top_right],
      [outline.top_left, outline.bottom_left],
      [outline.top_right, outline.bottom_right],
    ]);
  });
});

describe('shouldDisplayWallOutline', () => {
  it('hides wall outlines below two percent confidence', () => {
    expect(shouldDisplayWallOutline(0)).toBe(false);
    expect(shouldDisplayWallOutline(0.0199)).toBe(false);
  });

  it('keeps wall outlines at or above two percent confidence', () => {
    expect(shouldDisplayWallOutline(0.02)).toBe(true);
    expect(shouldDisplayWallOutline(0.8)).toBe(true);
  });
});
