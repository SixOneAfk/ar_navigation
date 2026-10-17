import { describe, expect, it } from 'vitest';
import { BUILDING_MODEL_NAME, BUILDING_MODEL_URL, WALL_POSE_ENABLED } from './modelAssets';

describe('active model assets', () => {
  it('loads the current model with URL-safe spaces', () => {
    expect(BUILDING_MODEL_NAME).toBe('Floor 1_Rotated_Points.glb');
    expect(decodeURIComponent(BUILDING_MODEL_URL)).toContain(BUILDING_MODEL_NAME);
    expect(BUILDING_MODEL_URL).toContain('Floor%201_Rotated_Points.glb');
  });

  it('does not enable a legacy wall catalog for the new model', () => {
    expect(WALL_POSE_ENABLED).toBe(false);
  });
});
