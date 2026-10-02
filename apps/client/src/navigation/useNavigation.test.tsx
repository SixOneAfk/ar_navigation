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
  it('loads building_navigation.json, finds Entrance/Student_Dep, and starts the player at Entrance', async () => {
    stubFetchWithRealNavigationJson();
    const navigation = parseBuildingNavigation(navigationJson);
    const entrance = navigation.points.find((point) => point.id === 'Entrance');
    const studentDep = navigation.points.find((point) => point.id === 'Student_Dep');
    expect(entrance).toBeDefined();
    expect(studentDep).toBeDefined();

    const { result } = renderHook(() => useNavigation(modelFrame, CAMERA_HEIGHT));

    await waitFor(() => expect(result.current.loadError).toBeNull());
    await waitFor(() => expect(result.current.currentPointId).toBe('Entrance'));

    expect(result.current.availableDestinations).toEqual([
      { id: 'Entrance', name: 'Entrance' },
      { id: 'Student_Dep', name: 'Student Department' },
    ]);

    const expectedInitialPosition = navigationPointToThreePosition(entrance!, modelFrame, CAMERA_HEIGHT);
    expect(result.current.initialPosition?.x).toBeCloseTo(expectedInitialPosition.x);
    expect(result.current.initialPosition?.y).toBeCloseTo(expectedInitialPosition.y);
    expect(result.current.initialPosition?.z).toBeCloseTo(expectedInitialPosition.z);
  });

  it('routes Entrance -> Student_Dep through branches[] without a direct edge', async () => {
    stubFetchWithRealNavigationJson();
    const { result } = renderHook(() => useNavigation(modelFrame, CAMERA_HEIGHT));
    await waitFor(() => expect(result.current.currentPointId).toBe('Entrance'));

    act(() => {
      result.current.navigateTo('Student_Dep');
    });

    expect(result.current.routeMessage).toBeNull();
    expect(result.current.activeRoute).not.toBeNull();
    expect(result.current.activeRoute?.start).toBe('Entrance');
    expect(result.current.activeRoute?.destination).toBe('Student_Dep');
    expect(result.current.activeRoute?.points[0]).toBe('Entrance');
    expect(result.current.activeRoute?.points[result.current.activeRoute.points.length - 1]).toBe('Student_Dep');
    expect(result.current.activeRoute!.points.length).toBeGreaterThan(2);
  });

  it('routes Student_Dep -> Entrance once the player is detected at Student_Dep', async () => {
    stubFetchWithRealNavigationJson();
    const navigation = parseBuildingNavigation(navigationJson);
    const studentDep = navigation.points.find((point) => point.id === 'Student_Dep')!;
    const studentDepWorldPosition = navigationPointToThreePosition(studentDep, modelFrame, CAMERA_HEIGHT);

    const { result } = renderHook(() => useNavigation(modelFrame, CAMERA_HEIGHT));
    await waitFor(() => expect(result.current.currentPointId).toBe('Entrance'));

    act(() => {
      result.current.observePlayerPosition(studentDepWorldPosition);
    });
    await waitFor(() => expect(result.current.currentPointId).toBe('Student_Dep'));

    act(() => {
      result.current.navigateTo('Entrance');
    });

    expect(result.current.routeMessage).toBeNull();
    expect(result.current.activeRoute?.start).toBe('Student_Dep');
    expect(result.current.activeRoute?.destination).toBe('Entrance');
    expect(result.current.activeRoute?.points[0]).toBe('Student_Dep');
    expect(result.current.activeRoute?.points[result.current.activeRoute.points.length - 1]).toBe('Entrance');
  });
});
