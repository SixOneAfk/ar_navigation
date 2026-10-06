import { useEffect, useRef, useState } from 'react';

export type CompassState =
  | 'idle'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'unsupported'
  | 'insecure';

export type CompassSource = 'webkitCompassHeading' | 'absolute-alpha' | null;

export type CompassHeadingData = {
  headingDeg: number | null;
  source: CompassSource;
  rawAlphaDeg: number | null;
  webkitCompassHeadingDeg: number | null;
  webkitCompassAccuracyDeg: number | null;
  orientationAbsolute: boolean;
  screenOrientationAngleDeg: number | null;
  screenOrientationType: string | null;
  timestamp: number;
};

function normalizeHeadingDeg(value: number) {
  return ((value % 360) + 360) % 360;
}

function getScreenOrientation() {
  const legacyAngle = (window as Window & { orientation?: number }).orientation;
  return {
    angle:
      typeof window.screen.orientation?.angle === 'number'
        ? window.screen.orientation.angle
        : typeof legacyAngle === 'number'
          ? legacyAngle
          : null,
    type: window.screen.orientation?.type ?? null,
  };
}

function shouldTraceCompassLogs() {
  if (import.meta.env?.DEV === true) {
    return true;
  }

  if (import.meta.env?.VITE_DEBUG_SENSORS === 'true') {
    return true;
  }

  const traceFlag = (window as Window & { __NAV_TRACE_COMPASS__?: boolean }).__NAV_TRACE_COMPASS__;
  return traceFlag === true;
}

function parseCompassHeading(event: DeviceOrientationEvent): {
  headingDeg: number | null;
  source: CompassSource;
  webkitCompassHeadingDeg: number | null;
  webkitCompassAccuracyDeg: number | null;
} {
  const webkitCompassHeading = (
    event as DeviceOrientationEvent & { webkitCompassHeading?: number }
  ).webkitCompassHeading;
  const webkitCompassAccuracy = (
    event as DeviceOrientationEvent & { webkitCompassAccuracy?: number }
  ).webkitCompassAccuracy;

  const normalizedWebkitHeading =
    typeof webkitCompassHeading === 'number' && Number.isFinite(webkitCompassHeading)
      ? normalizeHeadingDeg(webkitCompassHeading)
      : null;

  if (normalizedWebkitHeading !== null) {
    return {
      headingDeg: normalizedWebkitHeading,
      source: 'webkitCompassHeading',
      webkitCompassHeadingDeg: normalizedWebkitHeading,
      webkitCompassAccuracyDeg:
        typeof webkitCompassAccuracy === 'number' && Number.isFinite(webkitCompassAccuracy)
          ? webkitCompassAccuracy
          : null,
    };
  }

  if (event.absolute && typeof event.alpha === 'number' && Number.isFinite(event.alpha)) {
    return {
      headingDeg: normalizeHeadingDeg(event.alpha),
      source: 'absolute-alpha',
      webkitCompassHeadingDeg: null,
      webkitCompassAccuracyDeg: null,
    };
  }

  return {
    headingDeg: null,
    source: null,
    webkitCompassHeadingDeg: null,
    webkitCompassAccuracyDeg: null,
  };
}

export function useCompass() {
  const [state, setState] = useState<CompassState>('idle');
  const headingRef = useRef<CompassHeadingData>({
    headingDeg: null,
    source: null,
    rawAlphaDeg: null,
    webkitCompassHeadingDeg: null,
    webkitCompassAccuracyDeg: null,
    orientationAbsolute: false,
    screenOrientationAngleDeg: null,
    screenOrientationType: null,
    timestamp: 0,
  });

  const orientationHandlerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);
  const eventCountRef = useRef(0);
  const lastTraceAtRef = useRef(0);

  useEffect(() => {
    return () => {
      if (orientationHandlerRef.current) {
        window.removeEventListener('deviceorientation', orientationHandlerRef.current, true);
      }
    };
  }, []);

  function attachCompassListener() {
    if (orientationHandlerRef.current) {
      window.removeEventListener('deviceorientation', orientationHandlerRef.current, true);
      orientationHandlerRef.current = null;
    }

    orientationHandlerRef.current = (event: DeviceOrientationEvent) => {
      eventCountRef.current += 1;

      const parsed = parseCompassHeading(event);
      const screenOrientation = getScreenOrientation();
      headingRef.current = {
        headingDeg: parsed.headingDeg,
        source: parsed.source,
        rawAlphaDeg:
          typeof event.alpha === 'number' && Number.isFinite(event.alpha) ? event.alpha : null,
        webkitCompassHeadingDeg: parsed.webkitCompassHeadingDeg,
        webkitCompassAccuracyDeg: parsed.webkitCompassAccuracyDeg,
        orientationAbsolute: event.absolute,
        screenOrientationAngleDeg: screenOrientation.angle,
        screenOrientationType: screenOrientation.type,
        timestamp: event.timeStamp ?? Date.now(),
      };

      const now = Date.now();
      const shouldTrace =
        shouldTraceCompassLogs()
        && (eventCountRef.current <= 3 || now - lastTraceAtRef.current >= 1200);
      if (shouldTrace) {
        lastTraceAtRef.current = now;
        console.info(
          `[CompassTrace][Service] source=${parsed.source ?? 'none'}`
            + ` event#=${eventCountRef.current}`
            + ` heading=${parsed.headingDeg ?? 'n/a'}`
            + ` alphaRaw=${headingRef.current.rawAlphaDeg ?? 'n/a'}`
            + ` webkitCompass=${headingRef.current.webkitCompassHeadingDeg ?? 'n/a'}`
            + ` webkitAccuracy=${headingRef.current.webkitCompassAccuracyDeg ?? 'n/a'}`
            + ` absolute=${String(event.absolute)}`
            + ` screenOrientation=${screenOrientation.type ?? 'unknown'}:${screenOrientation.angle ?? 'n/a'}`,
        );
      }
    };

    window.addEventListener('deviceorientation', orientationHandlerRef.current, true);
  }

  async function requestPermission() {
    if (!window.isSecureContext) {
      setState('insecure');
      return;
    }

    if (typeof window.DeviceOrientationEvent === 'undefined') {
      setState('unsupported');
      return;
    }

    const needsOrientationPermission =
      typeof (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> })
        .requestPermission === 'function';

    setState('requesting');

    try {
      let orientationGranted = false;
      if (needsOrientationPermission) {
        const result = await (
          DeviceOrientationEvent as unknown as { requestPermission: () => Promise<string> }
        ).requestPermission();
        orientationGranted = result === 'granted';
      } else {
        orientationGranted = true;
      }

      if (!orientationGranted) {
        setState('denied');
        return;
      }

      attachCompassListener();
      setState('granted');
    } catch {
      setState('denied');
    }
  }

  function stop() {
    if (orientationHandlerRef.current) {
      window.removeEventListener('deviceorientation', orientationHandlerRef.current, true);
      orientationHandlerRef.current = null;
    }
    setState('idle');
  }

  return {
    state,
    headingRef,
    requestPermission,
    stop,
  };
}
