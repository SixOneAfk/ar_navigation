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
import { getValidDestinations, NAVIGABLE_DESTINATIONS, type NavigableDestination } from './destinations';

const ENTRANCE_POINT_ID = 'Entrance';

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
        navigationLogger.info(
          'NavigationData',
          [
            '[NAVIGATION] JSON Loaded',
            `  Points: ${loadedNavigation.points.length}`,
            `  Branches: ${loadedNavigation.branches.length}`,
          ].join('\n'),
        );

        const graphStats = getNavigationGraphStats(loadedNavigation, (branch) => {
          navigationLogger.warn(
            'NavigationGraph',
            `[NAVIGATION] Ignoring diagonal edge: ${branch.from} -> ${branch.to}`,
          );
        });
        navigationLogger.info(
          'NavigationGraph',
          [
            '[NAVIGATION] Graph',
            `  Nodes: ${graphStats.points}`,
            `  Edges: ${graphStats.graphEdges}`,
            `  Rejected Diagonal Edges: ${graphStats.diagonalBranchesExcluded}`,
          ].join('\n'),
        );
        if (loadedNavigation.invalidBranches?.length) {
          navigationLogger.error(
            'NavigationGraph',
            loadedNavigation.invalidBranches.map((branch) => `[NAVIGATION] Invalid branch: ${branch}`).join('\n'),
          );
        }

        const namedDestinations = getValidDestinations(loadedNavigation.points);
        navigationLogger.info(
          'NavigationDestinations',
          ['[NAVIGATION] Named Destinations', ...namedDestinations.map((destination) => `  ${destination.id}`)].join('\n'),
        );
        const missingDestinations = NAVIGABLE_DESTINATIONS.filter(
          (destination) => !namedDestinations.some((valid) => valid.id === destination.id),
        );
        if (missingDestinations.length > 0) {
          navigationLogger.error(
            'NavigationDestinations',
            `[NAVIGATION] Configured destinations missing from JSON: ${missingDestinations.map((destination) => destination.id).join(', ')}`,
          );
        }

        if (!loadedNavigation.points.some((point) => point.id === ENTRANCE_POINT_ID)) {
          const message = `Navigation data does not contain a point with ID "${ENTRANCE_POINT_ID}".`;
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
  const entrancePoint = useMemo(
    () => navigation?.points.find((point) => point.id === ENTRANCE_POINT_ID) ?? null,
    [navigation],
  );
  const initialPosition = useMemo(
    () => entrancePoint && modelFrame
      ? navigationPointToThreePosition(entrancePoint, modelFrame, cameraHeight)
      : null,
    [cameraHeight, entrancePoint, modelFrame],
  );
  const initialPointAppliedRef = useRef(false);

  useEffect(() => {
    if (initialPointAppliedRef.current || !entrancePoint || !initialPosition || !modelFrame) return;
    initialPointAppliedRef.current = true;
    currentPointIdRef.current = ENTRANCE_POINT_ID;
    setCurrentPointId(ENTRANCE_POINT_ID);
    // Player initial position is set to the same converted value NavigationTracker will apply to the camera.
    const distanceMeters = 0;
    navigationLogger.info(
      'NavigationInitialPosition',
      [
        '[NAVIGATION] ENTRANCE INITIALIZATION',
        '',
        'JSON Entrance:',
        `  X = ${entrancePoint.x.toFixed(4)}`,
        `  Y = ${entrancePoint.y.toFixed(4)}`,
        '',
        'Rotation Correction:',
        '  Angle = 305.00 deg',
        '  Direction = counter-clockwise (standard rotation of JSON x,y around the origin)',
        '',
        'Converted Three.js Entrance:',
        `  X = ${initialPosition.x.toFixed(4)}`,
        `  Y = ${initialPosition.y.toFixed(4)}`,
        `  Z = ${initialPosition.z.toFixed(4)}`,
        '',
        'Player Initial Position:',
        `  X = ${initialPosition.x.toFixed(4)}`,
        `  Y = ${initialPosition.y.toFixed(4)}`,
        `  Z = ${initialPosition.z.toFixed(4)}`,
        '',
        `Distance (converted Entrance <-> player initial position): ${distanceMeters.toFixed(4)} m`,
      ].join('\n'),
    );
  }, [entrancePoint, initialPosition, modelFrame]);

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

    navigationLogger.info('NavigationRoute', `[NAVIGATION] Start Node: ${startId}`);
    navigationLogger.info('NavigationRoute', `[NAVIGATION] Destination Node: ${nextDestinationId}`);

    const graph = buildNavigationGraph(loadedNavigation);
    try {
      const route = findShortestPath(graph, startId, nextDestinationId);
      setDestinationId(nextDestinationId);
      setRoute(route);
      setRouteMessage(null);
      routeDeviationRef.current = false;
      navigationLogger.info(
        'NavigationRoute',
        [
          '[NAVIGATION] Route Found',
          `  From: ${route.start}`,
          `  To: ${route.destination}`,
          `  Nodes: ${route.points.join(' \u2192 ')}`,
          `  Distance: ${route.distanceMeters.toFixed(2)} m`,
        ].join('\n'),
      );
    } catch (error) {
      setRoute(null);
      const message = error instanceof Error ? error.message : String(error);
      setRouteMessage(message);
      navigationLogger.error(
        'NavigationRoute',
        [
          '[NAVIGATION] ROUTE FAILED',
          `  From: ${startId}`,
          `  To: ${nextDestinationId}`,
          `  ${startId} exists in graph: ${graph.has(startId)}`,
          `  ${nextDestinationId} exists in graph: ${graph.has(nextDestinationId)}`,
        ].join('\n'),
      );
    }
  }, [availableDestinations, setRoute]);

  const cancelNavigation = useCallback(() => {
    setDestinationId(null);
    setRoute(null);
    setRouteMessage(null);
    routeDeviationRef.current = false;
  }, [setRoute]);

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
    alignmentWarning: null,
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