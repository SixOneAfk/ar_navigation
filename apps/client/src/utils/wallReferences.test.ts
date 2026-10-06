import { describe, expect, it } from 'vitest';
import type { ModelSceneFrame } from '../navigation/navigationData';
import {
  parseWallReferenceCatalog,
  selectWallReference,
  type CameraPoseSnapshot,
  type WallReference,
} from './wallReferences';

const frame: ModelSceneFrame = {
  center: { x: 0, y: 0, z: 0 },
  floorHeight: 0,
  position: { x: 0, y: 0, z: 0 },
  bounds: {
    min: { x: -10, y: 0, z: -10 },
    max: { x: 10, y: 4, z: 10 },
  },
};

const frontWall: WallReference = {
  id: 'wall-front',
  axis: 'z',
  coordinate: -5,
  bounds: {
    min: { x: -2, y: 0, z: -5 },
    max: { x: 2, y: 3, z: -5 },
  },
  width: 4,
  height: 3,
  surface_area: 12,
};

const pose: CameraPoseSnapshot = {
  position: { x: 0, y: 1.6, z: 0 },
  forward: { x: 0, y: 0, z: -1 },
  right: { x: 1, y: 0, z: 0 },
};

describe('wall references', () => {
  it('parses a generated catalog', () => {
    const catalog = parseWallReferenceCatalog({
      source_model: 'building.glb',
      coordinate_system: 'gltf_scene_y_up',
      wall_count: 1,
      walls: [frontWall],
    });

    expect(catalog.walls).toEqual([frontWall]);
  });

  it('selects a visible wall and orders corners for solvePnP', () => {
    const selected = selectWallReference(
      [
        frontWall,
        {
          ...frontWall,
          id: 'wall-behind',
          coordinate: 4,
          bounds: {
            min: { x: -2, y: 0, z: 4 },
            max: { x: 2, y: 3, z: 4 },
          },
        },
      ],
      frame,
      pose,
    );

    expect(selected?.id).toBe('wall-front');
    expect(selected?.corners).toEqual([
      { x: -2, y: 3, z: -5 },
      { x: 2, y: 3, z: -5 },
      { x: 2, y: 0, z: -5 },
      { x: -2, y: 0, z: -5 },
    ]);
    expect(selected?.confidence).toBeGreaterThan(0.7);
    expect(selected?.distanceMeters).toBeCloseTo(5);
  });

  it('returns no reference when every wall is behind the camera', () => {
    const selected = selectWallReference(
      [{
        ...frontWall,
        coordinate: 5,
        bounds: {
          min: { x: -2, y: 0, z: 5 },
          max: { x: 2, y: 3, z: 5 },
        },
      }],
      frame,
      pose,
    );

    expect(selected).toBeNull();
  });
});
