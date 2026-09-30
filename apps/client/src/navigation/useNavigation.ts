import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { createDebugLogger } from '../utils/debugLogger';
import {
  createWorldNavigationPoints,
  detectNavigationPoint,
  formatNavigationLocation,
  NAVIGATION_POINT_RADIUS_M,
  navigationPointToThreePosition,
  parseBuildingNavigation,
  type BuildingNavigation,
  type ModelSceneFrame,
} from './navigationData';
import { buildNavigationGraph, findShortestPath, getNavigationGraphStats, type NavigationPath } from './graph';
import { NAVIGABLE_DESTINATIONS, getValidDestinations, type NavigableDestination } from './destinations';

export type PlayerNavigationDebug = {
  playerPosition: { x: number; y: number; z: number };
  nearestPointId: string | null;
  distanceMeters: number | null;
  detectionRadiusMeters: number;
};

const NAVIGATION_DEBUG_ENABLED = import.meta.env?.VITE_DEBUG_SENSORS === 'true';
const navigationLogger = createDebugLogger({
  enabled: true,
  minLevel: NAVIGATION_DEBUG_ENABLED ? 'DEBUG' : 'INFO',
  throttleMs: 0,
});
const ROUTE_DEVIATION_THRESHOLD_METERS = 1.75;

function distanceToSegment(point: THREE.Vector3, start: THREE.Vector3, end: THREE.Vector3) {
  const segmentX = end.x - start.x;
  const segmentZ = end.z - start.z;
  const lengthSquared = segmentX * segmentX + segmentZ * segmentZ;
  const projection = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((point.x - start.x) * segmentX + (point.z - start.z) * segmentZ) / lengthSquared));
  return Math.hypot(point.x - (start.x + projection * segmentX), point.z - (start.z + projection * segmentZ));
}

export function useNavigation(modelFrame: ModelSceneFrame | null, cameraHeight: number) {
  const [navigation, setNavigation] = useState<BuildingNavigation | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [alignmentWarning, setAlignmentWarning] = useState<string | null>(null);
  const [currentPointId, setCurrentPointId] = useState<string | null>(null);
  const [debugSnapshot, setDebugSnapshot] = useState<PlayerNavigationDebug | null>(null);
  const [destinationId, setDestinationId] = useState<string | null>(null);
  const [activeRoute, setActiveRoute] = useState<NavigationPath | null>(null);
  const [routeMessage, setRouteMessage] = useState<string | null>(null);
  const currentPointIdRef = useRef<string | null>(null);
  const routeRef = useRef<NavigationPath | null>(null);
  const navigationRef = useRef<BuildingNavigation | null>(null);
  const routeDeviationRef = useRef(false);
  const lastNearestPointIdRef = useRef<string | null>(null);
  const lastDebugUpdateAtRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const loadNavigation = async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}building_navigation.json`);
        if (!response.ok) {
          throw new Error(`Navigation JSON request failed with HTTP ${response.status}.`);
        }

        const loadedNavigation = parseBuildingNavigation(await response.text());
        if (cancelled) return;

        setNavigation(loadedNavigation);
        navigationRef.current = loadedNavigation;
        const graphStats = getNavigationGraphStats(loadedNavigation);
        navigationLogger.info(
          'NavigationGraph',
          [
            '[NAVIGATION] Graph loaded',
            `  Points: ${graphStats.points}`,
            `  Branches: ${graphStats.branches}`,
            `  Valid branches: ${graphStats.validBranches}`,
            `  Invalid branches: ${graphStats.invalidBranches}`,
            `  Diagonal branches excluded: ${graphStats.diagonalBranchesExcluded}`,
            `  Graph edges: ${graphStats.graphEdges}`,
          ].join('\n'),
        );
        if (loadedNavigation.invalidBranches?.length) {
          navigationLogger.error(
            'NavigationGraph',
            loadedNavigation.invalidBranches.map((branch) => `[NAVIGATION] Invalid branch: ${branch}`).join('\n'),
          );
        }
        const loadedPointIds = new Set(loadedNavigation.points.map((point) => point.id));
        const invalidDestinations = NAVIGABLE_DESTINATIONS.filter((destination) => !loadedPointIds.has(destination.id));
        if (invalidDestinations.length > 0) {
          navigationLogger.error(
            'NavigationDestinationConfig',
            `[NAVIGATION] Ignoring configured destinations missing from JSON: ${invalidDestinations.map((destination) => destination.id).join(', ')}`,
          );
        }
        navigationLogger.info(
          'NavigationData',
          [
            '[NAVIGATION] Navigation data loaded',
            `  Building: ${loadedNavigation.building}`,
            `  Points: ${loadedNavigation.points.length}`,
            `  Grid Cell Size: ${loadedNavigation.grid.cell_size.toFixed(2)}m`,
            `  Coordinate System: ${loadedNavigation.grid.coordinate_system.x} / ${loadedNavigation.grid.coordinate_system.y}`,
          ].join('\n'),
        );

        if (!loadedNavigation.points.some((point) => point.id === 'Entrance')) {
          const message = 'Navigation data does not contain a point with ID "Entrance"; keeping the current camera start position.';
          setLoadError(message);
          navigationLogger.error('NavigationLoadError', message);
        }
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setLoadError(message);
        navigationLogger.error('NavigationLoadError', `Navigation data could not be loaded: ${message}`);
      }

    };

    void loadNavigation();
    return () => {
      cancelled = true;
    };
  }, []);

  const entrance = useMemo(
    () => navigation?.points.find((point) => point.id === 'Entrance') ?? null,
    [navigation],
  );
  const worldPoints = useMemo(
    () => navigation && modelFrame
      ? createWorldNavigationPoints(navigation, modelFrame, cameraHeight)
      : [],
    [cameraHeight, modelFrame, navigation],
  );
  const worldPointsRef = useRef(worldPoints);
  const availableDestinations = useMemo<NavigableDestination[]>(
    () => navigation ? getValidDestinations(navigation.points) : [],
    [navigation],
  );
  const initialPosition = useMemo(
    () => entrance && modelFrame
      ? navigationPointToThreePosition(entrance, modelFrame, cameraHeight)
      : null,
    [cameraHeight, entrance, modelFrame],
  );

  useEffect(() => {
    worldPointsRef.current = worldPoints;
  }, [worldPoints]);

  const setRoute = useCallback((route: NavigationPath | null) => {
    routeRef.current = route;
    setActiveRoute(route);
  }, []);

  const navigateTo = useCallback((nextDestinationId: string) => {
    const startId = currentPointIdRef.current;
    const loadedNavigation = navigationRef.current;
    if (!startId || !loadedNavigation) {
      setRouteMessage('Current location is not detected yet.');
      return;
    }

    if (!availableDestinations.some((destination) => destination.id === nextDestinationId)) {
      setRouteMessage(`Destination is not available: ${nextDestinationId}`);
      return;
    }

    try {
      const route = findShortestPath(buildNavigationGraph(loadedNavigation), startId, nextDestinationId);
      setDestinationId(nextDestinationId);
      setRoute(route);
      setRouteMessage(null);
      routeDeviationRef.current = false;
      navigationLogger.info(
        'NavigationRoute',
        [
          '[NAVIGATION] Route calculated',
          `From: ${route.start}`,
          `To: ${route.destination}`,
          `Raw path: ${route.points.join(' -> ')}`,
          `Branch distances: ${route.directions.map((direction) => `${direction.distanceMeters.toFixed(4)}m`).join(' + ')}`,
          `Total: ${route.distanceMeters.toFixed(2)} m`,
          `Collapsed instructions: ${route.instructions.map((instruction) => `${instruction.distanceMeters.toFixed(2)}m ${instruction.direction}`).join(' | ')}`,
        ].join('\n'),
      );
    } catch (error) {
      setRoute(null);
      setRouteMessage(error instanceof Error ? error.message : String(error));
    }
  }, [availableDestinations, setRoute]);

  const cancelNavigation = useCallback(() => {
    setDestinationId(null);
    setRoute(null);
    setRouteMessage(null);
    routeDeviationRef.current = false;
  }, [setRoute]);

  useEffect(() => {
    if (!entrance || !modelFrame || !initialPosition) return;

    navigationLogger.info(
      'NavigationEntrance',
      [
        '[NAVIGATION] Entrance initialized',
        `  JSON / navigation: X=${entrance.x.toFixed(3)}m Y=${entrance.y.toFixed(4)}m`,
        `  THREE.js world: X=${initialPosition.x.toFixed(3)}m Y=${initialPosition.y.toFixed(3)}m Z=${initialPosition.z.toFixed(3)}m`,
      ].join('\n'),
    );

    const insideModelBounds =
      initialPosition.x >= modelFrame.bounds.min.x &&
      initialPosition.x <= modelFrame.bounds.max.x &&
      initialPosition.z >= modelFrame.bounds.min.z &&
      initialPosition.z <= modelFrame.bounds.max.z;
    if (!insideModelBounds) {
      const message = 'The Entrance maps outside the active GLB bounds. The navigation JSON and rendered model origins do not currently align.';
      setAlignmentWarning(message);
      navigationLogger.warn('NavigationAlignment', message);
    }
  }, [entrance, initialPosition, modelFrame]);

  const observePlayerPosition = useCallback((position: THREE.Vector3) => {
    if (worldPoints.length === 0) return;

    const detection = detectNavigationPoint(
      position,
      worldPoints,
      currentPointIdRef.current,
    );

    const previousPointId = currentPointIdRef.current;
    const pointChanged = detection.currentPointId !== previousPointId;
    const nearestPointId = detection.nearestPoint?.id ?? null;
    const nearestPointChanged = nearestPointId !== lastNearestPointIdRef.current;
    const now = performance.now();
    const debugIntervalElapsed = now - lastDebugUpdateAtRef.current >= 750;

    if (pointChanged) {
      currentPointIdRef.current = detection.currentPointId;
      setCurrentPointId(detection.currentPointId);
      navigationLogger.info(
        'NavigationPointChange',
        `[NAVIGATION] Point changed: ${previousPointId ?? 'NONE'} -> ${detection.currentPointId ?? 'NONE'}`,
      );

      if (previousPointId) {
        navigationLogger.info('NavigationPointExit', `[NAVIGATION] Point exited: ${previousPointId}`);
      }
      if (detection.currentPointId) {
        navigationLogger.info('NavigationPointEnter', `[NAVIGATION] Point entered: ${detection.currentPointId}`);
      }

      const route = routeRef.current;
      if (route && detection.currentPointId) {
        if (detection.currentPointId === route.destination) {
          setRouteMessage(`You have arrived at ${route.destination}.`);
          setDestinationId(null);
          setRoute(null);
          navigationLogger.info('NavigationArrival', `[NAVIGATION] Destination reached: ${route.destination}`);
        } else if (!route.points.includes(detection.currentPointId)) {
          const loadedNavigation = navigationRef.current;
          if (loadedNavigation && route.destination !== detection.currentPointId) {
            try {
              const recalculated = findShortestPath(buildNavigationGraph(loadedNavigation), detection.currentPointId, route.destination);
              setRoute(recalculated);
              navigationLogger.info('NavigationRoute', `[NAVIGATION] Route recalculated from ${detection.currentPointId} to ${route.destination}`);
            } catch (error) {
              setRouteMessage(error instanceof Error ? error.message : String(error));
            }
          }
        }
      }

      const reportedPoint = detection.currentPointId
        ? worldPoints.find((point) => point.id === detection.currentPointId) ?? detection.nearestPoint
        : detection.nearestPoint;
      if (reportedPoint) {
        const distanceToReportedPoint = Math.hypot(
          position.x - reportedPoint.position.x,
          position.z - reportedPoint.position.z,
        );
        navigationLogger.info(
          'NavigationPointDistance',
          `[NAVIGATION] Distance to ${reportedPoint.id}: ${distanceToReportedPoint.toFixed(2)}m (horizontal)`,
        );
      }
    }

    const route = routeRef.current;
    if (route && route.points.length > 1 && !routeMessage) {
      const routeWorldPoints = route.points
        .map((pointId) => worldPointsRef.current.find((point) => point.id === pointId)?.position ?? null)
        .filter((point): point is THREE.Vector3 => point !== null);
      const nearestRouteDistance = routeWorldPoints.slice(0, -1).reduce(
        (nearest, routePoint, index) => Math.min(nearest, distanceToSegment(position, routePoint, routeWorldPoints[index + 1])),
        Number.POSITIVE_INFINITY,
      );
      const deviated = nearestRouteDistance > ROUTE_DEVIATION_THRESHOLD_METERS;
      if (deviated && !routeDeviationRef.current && currentPointIdRef.current) {
        routeDeviationRef.current = true;
        setRouteMessage('You have left the route. Recalculating...');
        const loadedNavigation = navigationRef.current;
        if (loadedNavigation) {
          try {
            const recalculated = findShortestPath(buildNavigationGraph(loadedNavigation), currentPointIdRef.current, route.destination);
            setRoute(recalculated);
            setRouteMessage(null);
          } catch (error) {
            setRouteMessage(error instanceof Error ? error.message : String(error));
          }
        }
      } else if (!deviated) {
        routeDeviationRef.current = false;
      }
    }

    if (nearestPointChanged) {
      lastNearestPointIdRef.current = nearestPointId;
    }

    const shouldLogLocation = pointChanged || (
      NAVIGATION_DEBUG_ENABLED && (nearestPointChanged || debugIntervalElapsed)
    );
    if (shouldLogLocation) {
      navigationLogger.info(
        pointChanged ? 'NavigationLocation' : 'NavigationDebugPosition',
        formatNavigationLocation(position, detection, worldPoints),
      );
    }

    if (NAVIGATION_DEBUG_ENABLED && nearestPointChanged && detection.nearestPoint) {
      navigationLogger.debug(
        'NavigationNearest',
        `[NAVIGATION] Nearest point: ${detection.nearestPoint.id}; distance ${(detection.distanceMeters ?? 0).toFixed(2)}m`,
      );
    }

    if (NAVIGATION_DEBUG_ENABLED && debugIntervalElapsed) {
      lastDebugUpdateAtRef.current = now;
      setDebugSnapshot({
        playerPosition: { x: position.x, y: position.y, z: position.z },
        nearestPointId: detection.nearestPoint?.id ?? null,
        distanceMeters: detection.distanceMeters,
        detectionRadiusMeters: NAVIGATION_POINT_RADIUS_M,
      });
    }
  }, [routeMessage, setRoute, worldPoints]);

  return {
    buildingName: navigation?.building ?? null,
    currentPointId,
    debugSnapshot,
    debugEnabled: NAVIGATION_DEBUG_ENABLED,
    initialPosition,
    loadError,
    alignmentWarning,
    worldPoints,
    observePlayerPosition,
    navigationPoints: navigation?.points ?? [],
    availableDestinations,
    destinationId,
    activeRoute,
    routeMessage,
    navigateTo,
    cancelNavigation,
  };
}