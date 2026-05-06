import { useEffect, useRef, useState } from 'react';

export type GyroState = 'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported';

/** Raw device orientation angles, updated every event tick. */
export type Orientation = {
  alpha: number; // compass bearing  0–360°
  beta: number;  // front/back tilt  -180–180°
  gamma: number; // left/right tilt  -90–90°
};

export function useGyroscope() {
  const [state, setState] = useState<GyroState>('idle');
  // Use a ref so GyroCamera can read the latest value inside useFrame
  // without triggering re-renders on every sensor tick.
  const orientationRef = useRef<Orientation>({ alpha: 0, beta: 0, gamma: 0 });

  // Keep a stable reference to the handler so we can remove it on cleanup.
  const handlerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);

  useEffect(() => {
    return () => {
      if (handlerRef.current) {
        window.removeEventListener('deviceorientation', handlerRef.current);
      }
    };
  }, []);

  function attachListener() {
    handlerRef.current = (e: DeviceOrientationEvent) => {
      orientationRef.current = {
        alpha: e.alpha ?? 0,
        beta: e.beta ?? 0,
        gamma: e.gamma ?? 0,
      };
    };
    window.addEventListener('deviceorientation', handlerRef.current, true);
  }

  async function requestPermission() {
    if (typeof window.DeviceOrientationEvent === 'undefined') {
      setState('unsupported');
      return;
    }

    // iOS 13+ requires an explicit user-gesture permission call.
    const needsExplicitPermission =
      typeof (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> })
        .requestPermission === 'function';

    if (needsExplicitPermission) {
      setState('requesting');
      try {
        const result = await (
          DeviceOrientationEvent as unknown as { requestPermission: () => Promise<string> }
        ).requestPermission();

        if (result === 'granted') {
          attachListener();
          setState('granted');
        } else {
          setState('denied');
        }
      } catch {
        setState('denied');
      }
    } else {
      // Android / desktop — no permission prompt required.
      attachListener();
      setState('granted');
    }
  }

  function stop() {
    if (handlerRef.current) {
      window.removeEventListener('deviceorientation', handlerRef.current, true);
      handlerRef.current = null;
    }
    setState('idle');
  }

  return { state, orientationRef, requestPermission, stop };
}
