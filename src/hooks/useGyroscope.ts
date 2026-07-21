import { useEffect, useRef, useState } from 'react';

export type GyroState = 'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported';

/** Raw device orientation angles, updated every event tick. */
export type Orientation = {
  alpha: number; // compass bearing  0–360°
  beta: number;  // front/back tilt  -180–180°
  gamma: number; // left/right tilt  -90–90°
};

/** Linear acceleration in device coordinates, updated every event tick. */
export type MotionData = {
  x: number; // rightwards
  y: number; // upwards
  z: number; // out of screen toward user
  timestamp: number;
};

export type CalibrationData = {
  alphaOffset: number;
  betaOffset: number;
  gammaOffset: number;
};

export function useGyroscope() {
  const [state, setState] = useState<GyroState>('idle');
  const [calibration, setCalibration] = useState<CalibrationData>({ alphaOffset: 0, betaOffset: 0, gammaOffset: 0 });
  const orientationRef = useRef<Orientation>({ alpha: 0, beta: 0, gamma: 0 });
  const motionRef = useRef<MotionData>({ x: 0, y: 0, z: 0, timestamp: 0 });

  const orientationHandlerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);
  const motionHandlerRef = useRef<((e: DeviceMotionEvent) => void) | null>(null);

  useEffect(() => {
    return () => {
      if (orientationHandlerRef.current) {
        window.removeEventListener('deviceorientation', orientationHandlerRef.current, true);
      }
      if (motionHandlerRef.current) {
        window.removeEventListener('devicemotion', motionHandlerRef.current, true);
      }
    };
  }, []);

  function attachOrientationListener() {
    orientationHandlerRef.current = (e: DeviceOrientationEvent) => {
      orientationRef.current = {
        alpha: (e.alpha ?? 0) - calibration.alphaOffset,
        beta: (e.beta ?? 0) - calibration.betaOffset,
        gamma: (e.gamma ?? 0) - calibration.gammaOffset,
      };
    };
    window.addEventListener('deviceorientation', orientationHandlerRef.current, true);
  }

  function attachMotionListener() {
    motionHandlerRef.current = (e: DeviceMotionEvent) => {
      const acceleration = e.acceleration ?? e.accelerationIncludingGravity ?? null;
      if (!acceleration) {
        return;
      }

      motionRef.current = {
        x: acceleration.x ?? 0,
        y: acceleration.y ?? 0,
        z: acceleration.z ?? 0,
        timestamp: e.timeStamp || Date.now(),
      };
    };
    window.addEventListener('devicemotion', motionHandlerRef.current, true);
  }

  async function requestPermission() {
    const supportsOrientation = typeof window.DeviceOrientationEvent !== 'undefined';
    const supportsMotion = typeof window.DeviceMotionEvent !== 'undefined';

    if (!supportsOrientation && !supportsMotion) {
      setState('unsupported');
      return;
    }

    const needsOrientationPermission =
      typeof (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> })
        .requestPermission === 'function';
    const needsMotionPermission =
      typeof (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> })
        .requestPermission === 'function';

    setState('requesting');

    try {
      let orientationGranted = false;
      let motionGranted = false;

      if (supportsOrientation) {
        if (needsOrientationPermission) {
          const result = await (
            DeviceOrientationEvent as unknown as { requestPermission: () => Promise<string> }
          ).requestPermission();
          orientationGranted = result === 'granted';
        } else {
          orientationGranted = true;
        }
      }

      if (supportsMotion) {
        if (needsMotionPermission) {
          const result = await (
            DeviceMotionEvent as unknown as { requestPermission: () => Promise<string> }
          ).requestPermission();
          motionGranted = result === 'granted';
        } else {
          motionGranted = true;
        }
      }

      if (orientationGranted) {
        attachOrientationListener();
      }
      if (motionGranted) {
        attachMotionListener();
      }

      if (orientationGranted || motionGranted) {
        setState('granted');
      } else {
        setState('denied');
      }
    } catch {
      setState('denied');
    }
  }

  function stop() {
    if (orientationHandlerRef.current) {
      window.removeEventListener('deviceorientation', orientationHandlerRef.current, true);
      orientationHandlerRef.current = null;
    }
    if (motionHandlerRef.current) {
      window.removeEventListener('devicemotion', motionHandlerRef.current, true);
      motionHandlerRef.current = null;
    }
    setState('idle');
  }

  function calibrate() {
    const current = orientationRef.current;
    const newCalibration = {
      alphaOffset: current.alpha,
      betaOffset: current.beta,
      gammaOffset: current.gamma,
    };
    setCalibration(newCalibration);
  }

  return { state, orientationRef, motionRef, calibration, calibrate, requestPermission, stop };
}
