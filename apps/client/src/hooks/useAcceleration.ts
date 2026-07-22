import { useEffect, useRef, useState } from 'react';

export type AccelState = 'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported' | 'insecure';

export type Vec3 = { x: number; y: number; z: number };

export type AccelSample = {
  intervalMs: number;
  raw: Vec3;
  withGravity: Vec3;
  verticalAcceleration: number;
  velocity: Vec3;
  position: Vec3;
};

const ZERO_VEC: Vec3 = { x: 0, y: 0, z: 0 };

function sanitize(value: number | null | undefined) {
  return Number.isFinite(value) ? (value as number) : 0;
}

function withDeadband(value: number, threshold = 0.12) {
  return Math.abs(value) < threshold ? 0 : value;
}

export function useAcceleration() {
  const [state, setState] = useState<AccelState>('idle');
  const [sample, setSample] = useState<AccelSample>({
    intervalMs: 0,
    raw: { ...ZERO_VEC },
    withGravity: { ...ZERO_VEC },
    verticalAcceleration: 0,
    velocity: { ...ZERO_VEC },
    position: { ...ZERO_VEC },
  });
  const [stepCount, setStepCount] = useState(0);
  const handlerRef = useRef<((event: DeviceMotionEvent) => void) | null>(null);
  const lastLogRef = useRef(0);
  const lastEventAtRef = useRef<number | null>(null);
  const lastStepAtRef = useRef(0);
  const gravityMagnitudeRef = useRef(9.81);
  const velocityRef = useRef<Vec3>({ ...ZERO_VEC });
  const positionRef = useRef<Vec3>({ ...ZERO_VEC });

  const STEP_THRESHOLD = 1.15;
  const STEP_DEBOUNCE_MS = 350;
  const GRAVITY_LP_ALPHA = 0.08;

  useEffect(() => {
    return () => {
      if (handlerRef.current) {
        window.removeEventListener('devicemotion', handlerRef.current);
      }
    };
  }, []);

  function attachListener() {
    handlerRef.current = (event: DeviceMotionEvent) => {
      const now = performance.now();
      const fallbackInterval = lastEventAtRef.current == null ? 0.016 : (now - lastEventAtRef.current) / 1000;
      lastEventAtRef.current = now;
      const intervalSec = Math.max((event.interval || 16) / 1000, fallbackInterval, 0.01);

      const raw = {
        x: withDeadband(sanitize(event.acceleration?.x)),
        y: withDeadband(sanitize(event.acceleration?.y)),
        z: withDeadband(sanitize(event.acceleration?.z)),
      };
      const withGravity = {
        x: sanitize(event.accelerationIncludingGravity?.x),
        y: sanitize(event.accelerationIncludingGravity?.y),
        z: sanitize(event.accelerationIncludingGravity?.z),
      };
      const gravityMagnitude = Math.sqrt(
        withGravity.x * withGravity.x +
          withGravity.y * withGravity.y +
          withGravity.z * withGravity.z,
      );

      gravityMagnitudeRef.current =
        gravityMagnitudeRef.current * (1 - GRAVITY_LP_ALPHA) +
        gravityMagnitude * GRAVITY_LP_ALPHA;

      // High-pass the acceleration magnitude: this isolates vertical walking oscillation.
      const verticalAcceleration = gravityMagnitude - gravityMagnitudeRef.current;
      const verticalAmplitude = Math.abs(verticalAcceleration);
      const msSinceLastStep = now - lastStepAtRef.current;

      if (verticalAmplitude > STEP_THRESHOLD && msSinceLastStep >= STEP_DEBOUNCE_MS) {
        lastStepAtRef.current = now;
        setStepCount((prev) => prev + 1);
      }

      velocityRef.current = {
        x: (velocityRef.current.x + raw.x * intervalSec) * 0.9,
        y: (velocityRef.current.y + raw.y * intervalSec) * 0.9,
        z: (velocityRef.current.z + raw.z * intervalSec) * 0.9,
      };

      positionRef.current = {
        x: positionRef.current.x + velocityRef.current.x * intervalSec,
        y: positionRef.current.y + velocityRef.current.y * intervalSec,
        z: positionRef.current.z + velocityRef.current.z * intervalSec,
      };

      setSample({
        intervalMs: event.interval || intervalSec * 1000,
        raw,
        withGravity,
        verticalAcceleration,
        velocity: { ...velocityRef.current },
        position: { ...positionRef.current },
      });

      const logNow = performance.now();
      // Throttle logs to keep the console usable during walking tests.
      if (logNow - lastLogRef.current < 200) return;
      lastLogRef.current = logNow;

      console.log('[acceleration]', {
        timestamp: Date.now(),
        intervalMs: event.interval || intervalSec * 1000,
        raw,
        withGravity,
        verticalAcceleration,
        stepCount,
        velocity: velocityRef.current,
        position: positionRef.current,
      });
    };

    window.addEventListener('devicemotion', handlerRef.current, true);
  }

  async function requestPermission() {
    if (!window.isSecureContext) {
      setState('insecure');
      return;
    }

    if (typeof window.DeviceMotionEvent === 'undefined') {
      setState('unsupported');
      return;
    }

    const needsExplicitPermission =
      typeof (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> })
        .requestPermission === 'function';

    if (needsExplicitPermission) {
      setState('requesting');
      try {
        const result = await (
          DeviceMotionEvent as unknown as { requestPermission: () => Promise<string> }
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
      attachListener();
      setState('granted');
    }
  }

  function stop() {
    if (handlerRef.current) {
      window.removeEventListener('devicemotion', handlerRef.current, true);
      handlerRef.current = null;
    }
    setState('idle');
  }

  function reset() {
    velocityRef.current = { ...ZERO_VEC };
    positionRef.current = { ...ZERO_VEC };
    gravityMagnitudeRef.current = 9.81;
    lastStepAtRef.current = 0;
    setStepCount(0);
    setSample((prev) => ({
      ...prev,
      verticalAcceleration: 0,
      velocity: { ...ZERO_VEC },
      position: { ...ZERO_VEC },
    }));
  }

  return { state, sample, stepCount, requestPermission, stop, reset };
}
