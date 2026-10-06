import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  detectNavigationPoint,
  formatNavigationLocation,
  navigationPointToThreePosition,
  parseBuildingNavigation,
  type ModelSceneFrame,
  type WorldNavigationPoint,
} from './navigationData';

const navigationFixture = {
  building: 'Test Building',
  grid: {
    cell_size: 1,
    margin: 5,
    wall_clearance: 0.2,
    movement: { diagonal: true },
    coordinate_system: {
      type: 'building_local',
      reference_object: 'Plane',
      x: 'Building local X',
      y: 'Building local Y',
    },
  },
  points: [{ id: 'test-node', row: 0, column: 0, x: 1.25, y: -2 }],
  branches: [],
};

const modelFrame: ModelSceneFrame = {
  center: { x: -83.336, y: 3.005, z: 14.008 },
  floorHeight: 0.9225,
  position: { x: 0, y: -0.5, z: -4 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  bounds: {
    min: { x: -20.741, y: -2.003, z: -23.636 },
    max: { x: 20.741, y: 2.003, z: 15.636 },
  },
};

describe('navigation data', () => {
  it('parses the documented structure and grid configuration', () => {
    const navigation = parseBuildingNavigation(JSON.stringify(navigationFixture));

    expect(navigation.building).toBe('Test Building');
    expect(navigation.grid.cell_size).toBe(1);
    expect(navigation.grid.coordinate_system).toEqual({
      type: 'building_local',
      reference_object: 'Plane',
      x: 'Building local X',
      y: 'Building local Y',
    });
    expect(navigation.points).toHaveLength(1);
  });

  it('ignores a leading exporter note without accepting malformed JSON', () => {
    const navigation = parseBuildingNavigation(`// export note\n${JSON.stringify(navigationFixture)}`);
    expect(navigation.building).toBe('Test Building');
  });

  it('rejects malformed JSON and duplicate point IDs', () => {
    expect(() => parseBuildingNavigation('{')).toThrow('could not be parsed');

    const duplicateFixture = {
      ...navigationFixture,
      points: [...navigationFixture.points, { ...navigationFixture.points[0] }],
    };
    expect(() => parseBuildingNavigation(JSON.stringify(duplicateFixture))).toThrow('Duplicate navigation point ID');
  });

  it('requires branches and reports invalid branch references and duplicate branch IDs', () => {
    expect(() => parseBuildingNavigation(JSON.stringify({
      building: 'Test Building',
      grid: navigationFixture.grid,
      points: navigationFixture.points,
    }))).toThrow('missing the branches array');

    expect(() => parseBuildingNavigation(JSON.stringify({
      ...navigationFixture,
      branches: [
        { id: 'B0', from: 'missing', to: 'test-node', distance: 1 },
      ],
    }))).toThrow('B0) references nonexistent point "missing"');

    expect(() => parseBuildingNavigation(JSON.stringify({
      ...navigationFixture,
      branches: [
        { id: 'B0', from: 'test-node', to: 'test-node', distance: 1 },
        { id: 'B0', from: 'test-node', to: 'test-node', distance: 1 },
      ],
    }))).toThrow('Duplicate navigation branch ID: B0');
  });

  it('rotates Blender vertex coordinates into the GLB baked orientation before centering', () => {
    const position = navigationPointToThreePosition(
      navigationFixture.points[0],
      modelFrame,
      1.6,
    );

    expect(position.x).toBeCloseTo(116.876169);
    expect(position.y).toBe(1.1);
    expect(position.z).toBeCloseTo(-29.435019);
  });

  it('uses horizontal distance and retains the current point while it remains in range', () => {
    const points: WorldNavigationPoint[] = [
      { id: 'west-door', position: new THREE.Vector3(0, 1.6, 0) },
      { id: 'east-door', position: new THREE.Vector3(1, 1.6, 0) },
    ];

    const detection = detectNavigationPoint({ x: 0.6, z: 0 }, points, 'west-door');
    expect(detection.nearestPoint?.id).toBe('east-door');
    expect(detection.distanceMeters).toBeCloseTo(0.4);
    expect(detection.currentPointId).toBe('west-door');

    expect(detectNavigationPoint({ x: 2, z: 0 }, points, 'west-door').currentPointId).toBeNull();
  });

  it('formats current and outside-radius locations with explicit world-coordinate labels', () => {
    const points: WorldNavigationPoint[] = [
      { id: 'Entrance', position: new THREE.Vector3(-5.143, 1.2, -29.5637) },
    ];
    const atEntrance = detectNavigationPoint({ x: -5.143, z: -29.5637 }, points, null);
    const atEntranceLog = formatNavigationLocation(
      { x: -5.143, y: 1.2, z: -29.5637 },
      atEntrance,
      points,
    );
    expect(atEntranceLog).toContain('Current Point: Entrance');
    expect(atEntranceLog).toContain('Status: AT POINT');
    expect(atEntranceLog).toContain('Player Position (THREE.js world): X=-5.14m Y=1.20m Z=-29.56m');

    const away = detectNavigationPoint({ x: -3.21, z: -27.84 }, points, null);
    const awayLog = formatNavigationLocation(
      { x: -3.21, y: 1.2, z: -27.84 },
      away,
      points,
    );
    expect(awayLog).toContain('Current Point: NONE');
    expect(awayLog).toContain('Nearest Point: Entrance');
    expect(awayLog).toContain('Status: OUTSIDE RADIUS');
  });

  it('detects entering, switching between, and leaving navigation points', () => {
    const points: WorldNavigationPoint[] = [
      { id: 'Entrance', position: new THREE.Vector3(0, 1.2, 0) },
      { id: 'P1', position: new THREE.Vector3(1, 1.2, 0) },
    ];

    const atEntrance = detectNavigationPoint({ x: 0, z: 0 }, points, null);
    const atP1 = detectNavigationPoint({ x: 1, z: 0 }, points, atEntrance.currentPointId);
    const outside = detectNavigationPoint({ x: 3, z: 0 }, points, atP1.currentPointId);

    expect(atEntrance.currentPointId).toBe('Entrance');
    expect(atP1.currentPointId).toBe('P1');
    expect(outside.currentPointId).toBeNull();
    expect(outside.distanceMeters).toBe(2);
  });
});