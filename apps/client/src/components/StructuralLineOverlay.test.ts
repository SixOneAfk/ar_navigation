import { describe, expect, it } from 'vitest';
import { mapCapturedPointToCover } from './StructuralLineOverlay';

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
