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

export function useNavigation(modelFrame: ModelSceneFrame | null, cameraHeight: number) {
  const [navigation, setNavigation] = useState<BuildingNavigation | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [alignmentWarning, setAlignmentWarning] = useState<string | null>(null);
  const [currentPointId, setCurrentPointId] = useState<string | null>(null);
  const [debugSnapshot, setDebugSnapshot] = useState<PlayerNavigationDebug | null>(null);
  const currentPointIdRef = useRef<string | null>(null);
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
  const initialPosition = useMemo(
    () => entrance && modelFrame
      ? navigationPointToThreePosition(entrance, modelFrame, cameraHeight)
      : null,
    [cameraHeight, entrance, modelFrame],
  );

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
  }, [worldPoints]);

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
  };
}