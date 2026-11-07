// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useNavigation } from './useNavigation';
import {
  navigationPointToThreePosition,
  parseBuildingNavigation,
  type ModelSceneFrame,
} from './navigationData';
import navigationJson from '../../public/building_navigation.json?raw';

// Exercises the real hook end-to-end (JSON fetch -> parse -> graph -> Dijkstra)
// instead of re-implementing its logic, so wiring regressions are caught here.

const modelFrame: ModelSceneFrame = {
  center: { x: 0, y: 0, z: 0 },
  floorHeight: 0,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  bounds: {
    min: { x: -1000, y: -1000, z: -1000 },
    max: { x: 1000, y: 1000, z: 1000 },
  },
};
const CAMERA_HEIGHT = 1.6;

function stubFetchWithRealNavigationJson() {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => navigationJson,
  })));
}

describe('useNavigation (real JSON wiring)', () => {
  it('loads named locations and starts at the mapped Entrance point', async () => {
    stubFetchWithRealNavigationJson();
    const navigation = parseBuildingNavigation(navigationJson);
    const entranceId = navigation.namedLocations?.Entrance;
    const studentDepId = navigation.namedLocations?.Student_Dep;
    const entrance = navigation.points.find((point) => point.id === entranceId);
    const studentDep = navigation.points.find((point) => point.id === studentDepId);
    expect(entrance).toBeDefined();
    expect(studentDep).toBeDefined();

    const { result } = renderHook(() => useNavigation(modelFrame, CAMERA_HEIGHT));

    await waitFor(() => expect(result.current.loadError).toBeNull());
    await waitFor(() => expect(result.current.currentPointId).toBe('x5y52'));

    expect(result.current.availableDestinations).toEqual([
      { id: 'x5y52', name: 'Entrance' },
      { id: 'x31y35', name: 'Student Department' },
    ]);

    const expectedInitialPosition = navigationPointToThreePosition(entrance!, modelFrame, CAMERA_HEIGHT);
    expect(result.current.initialPosition?.x).toBeCloseTo(expectedInitialPosition.x);
    expect(result.current.initialPosition?.y).toBeCloseTo(expectedInitialPosition.y);
    expect(result.current.initialPosition?.z).toBeCloseTo(expectedInitialPosition.z);
  });

  it('routes the mapped Entrance to Student Department using branches[]', async () => {
    stubFetchWithRealNavigationJson();
    const { result } = renderHook(() => useNavigation(modelFrame, CAMERA_HEIGHT));
    await waitFor(() => expect(result.current.currentPointId).toBe('x5y52'));

    act(() => {
      result.current.navigateTo('x31y35');
    });

    expect(result.current.routeMessage).toBeNull();
    expect(result.current.activeRoute).not.toBeNull();
    expect(result.current.activeRoute?.start).toBe('x5y52');
    expect(result.current.activeRoute?.destination).toBe('x31y35');
    expect(result.current.activeRoute?.points[0]).toBe('x5y52');
    expect(result.current.activeRoute?.points[result.current.activeRoute.points.length - 1]).toBe('x31y35');
    expect(result.current.activeRoute!.points.length).toBeGreaterThan(2);
  });

  it('routes from the mapped Student Department back to Entrance', async () => {
    stubFetchWithRealNavigationJson();
    const navigation = parseBuildingNavigation(navigationJson);
    const studentDep = navigation.points.find((point) => point.id === 'x31y35')!;
    const studentDepWorldPosition = navigationPointToThreePosition(studentDep, modelFrame, CAMERA_HEIGHT);

    const { result } = renderHook(() => useNavigation(modelFrame, CAMERA_HEIGHT));
    await waitFor(() => expect(result.current.currentPointId).toBe('x5y52'));

    act(() => {
      result.current.observePlayerPosition(studentDepWorldPosition);
    });
    await waitFor(() => expect(result.current.currentPointId).toBe('x31y35'));

    act(() => {
      result.current.navigateTo('x5y52');
    });

    expect(result.current.routeMessage).toBeNull();
    expect(result.current.activeRoute?.start).toBe('x31y35');
    expect(result.current.activeRoute?.destination).toBe('x5y52');
    expect(result.current.activeRoute?.points[0]).toBe('x31y35');
    expect(result.current.activeRoute?.points[result.current.activeRoute.points.length - 1]).toBe('x5y52');
  });
});
