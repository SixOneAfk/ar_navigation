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

export type MotionCalibration = {
  xOffset: number;
  yOffset: number;
  zOffset: number;
};

/**
 * Hook that bridges the browser's motion APIs to the AR experience.
 * It collects orientation and motion data, handles sensor permission requests,
 * and provides calibration helpers for both orientation and acceleration.
 */
export function useGyroscope() {
  const [state, setState] = useState<GyroState>('idle');
  const [calibration, setCalibration] = useState<CalibrationData>({ alphaOffset: 0, betaOffset: 0, gammaOffset: 0 });
  const [motionCalibration, setMotionCalibration] = useState<MotionCalibration>({ xOffset: 0, yOffset: 0, zOffset: 0 });
  const [motionCalibrating, setMotionCalibrating] = useState(false);
  const orientationRef = useRef<Orientation>({ alpha: 0, beta: 0, gamma: 0 });
  const motionRef = useRef<MotionData>({ x: 0, y: 0, z: 0, timestamp: 0 });

  const orientationHandlerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);
  const motionHandlerRef = useRef<((e: DeviceMotionEvent) => void) | null>(null);
  const motionSampleRef = useRef<{ count: number; sumX: number; sumY: number; sumZ: number } | null>(null);
  const motionCalibrationTimerRef = useRef<number | null>(null);

  // Clean up listeners when the hook is unmounted.
  useEffect(() => {
    return () => {
      if (orientationHandlerRef.current) {
        window.removeEventListener('deviceorientation', orientationHandlerRef.current, true);
      }
      if (motionHandlerRef.current) {
        window.removeEventListener('devicemotion', motionHandlerRef.current, true);
      }
      if (motionCalibrationTimerRef.current !== null) {
        window.clearTimeout(motionCalibrationTimerRef.current);
      }
    };
  }, []);

  // Attach a listener that stores the device's orientation and applies the current calibration offsets.
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

  // Attach a listener that stores the device's acceleration after subtracting the bias calibration.
  function attachMotionListener() {
    motionHandlerRef.current = (e: DeviceMotionEvent) => {
      const acceleration = e.acceleration ?? e.accelerationIncludingGravity ?? null;
      if (!acceleration) {
        return;
      }

      const rawX = acceleration.x ?? 0;
      const rawY = acceleration.y ?? 0;
      const rawZ = acceleration.z ?? 0;

      if (motionCalibrating && motionSampleRef.current) {
        const stationaryLimit = 2.0;
        if (Math.abs(rawX) < stationaryLimit && Math.abs(rawY) < stationaryLimit && Math.abs(rawZ) < stationaryLimit) {
          motionSampleRef.current.count += 1;
          motionSampleRef.current.sumX += rawX;
          motionSampleRef.current.sumY += rawY;
          motionSampleRef.current.sumZ += rawZ;
        }
      }

      motionRef.current = {
        x: rawX - motionCalibration.xOffset,
        y: rawY - motionCalibration.yOffset,
        z: rawZ - motionCalibration.zOffset,
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

  // Save the current orientation as the baseline for later calibration.
  function calibrate() {
    const current = orientationRef.current;
    const newCalibration = {
      alphaOffset: current.alpha,
      betaOffset: current.beta,
      gammaOffset: current.gamma,
    };
    setCalibration(newCalibration);
  }

  function resetMotionCalibration() {
    setMotionCalibration({ xOffset: 0, yOffset: 0, zOffset: 0 });
  }

  // Average the stationary samples gathered during accelerometer calibration.
  function finishMotionCalibration() {
    if (!motionSampleRef.current || motionSampleRef.current.count === 0) {
      motionSampleRef.current = null;
      setMotionCalibrating(false);
      motionCalibrationTimerRef.current = null;
      return;
    }

    const { count, sumX, sumY, sumZ } = motionSampleRef.current;
    setMotionCalibration({
      xOffset: sumX / count,
      yOffset: sumY / count,
      zOffset: sumZ / count,
    });

    motionSampleRef.current = null;
    setMotionCalibrating(false);
    motionCalibrationTimerRef.current = null;
  }

  // Collect a short burst of motion samples while the device is held still.
  function calibrateMotion() {
    if (motionCalibrating) {
      return;
    }

    motionSampleRef.current = { count: 0, sumX: 0, sumY: 0, sumZ: 0 };
    setMotionCalibrating(true);
    motionCalibrationTimerRef.current = window.setTimeout(() => {
      finishMotionCalibration();
    }, 1200);
  }

  return {
    state,
    orientationRef,
    motionRef,
    calibration,
    motionCalibration,
    motionCalibrating,
    calibrate,
    calibrateMotion,
    requestPermission,
    resetMotionCalibration,
    stop,
  };
}
