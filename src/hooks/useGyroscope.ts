import { useEffect, useRef, useState } from 'react';
import { createDebugLogger } from '../utils/debugLogger';

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
  const logger = useRef(createDebugLogger({ enabled: import.meta.env?.VITE_DEBUG_SENSORS === 'true' }));
  const [state, setState] = useState<GyroState>('idle');
  const [calibration, setCalibration] = useState<CalibrationData>({ alphaOffset: 0, betaOffset: 0, gammaOffset: 0 });
  const [motionCalibration, setMotionCalibration] = useState<MotionCalibration>({ xOffset: 0, yOffset: 0, zOffset: 0 });
  const calibrationRef = useRef<CalibrationData>({ alphaOffset: 0, betaOffset: 0, gammaOffset: 0 });
  const motionCalibrationRef = useRef<MotionCalibration>({ xOffset: 0, yOffset: 0, zOffset: 0 });
  const [motionCalibrating, setMotionCalibrating] = useState(false);
  const orientationRef = useRef<Orientation>({ alpha: 0, beta: 0, gamma: 0 });
  const motionRef = useRef<MotionData>({ x: 0, y: 0, z: 0, timestamp: 0 });

  const orientationHandlerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);
  const motionHandlerRef = useRef<((e: DeviceMotionEvent) => void) | null>(null);
  const motionSampleRef = useRef<{ count: number; sumX: number; sumY: number; sumZ: number } | null>(null);
  const motionCalibratingRef = useRef(false);
  const motionCalibrationTimerRef = useRef<number | null>(null);
  const orientationEventCountRef = useRef(0);
  const motionEventCountRef = useRef(0);
  const lastOrientationTsRef = useRef<number | null>(null);
  const lastMotionTsRef = useRef<number | null>(null);
  const lastOrientationValuesRef = useRef<Orientation | null>(null);
  const lastMotionValuesRef = useRef<MotionData | null>(null);

  useEffect(() => {
    calibrationRef.current = calibration;
  }, [calibration]);

  useEffect(() => {
    motionCalibrationRef.current = motionCalibration;
  }, [motionCalibration]);

  // Clean up listeners when the hook is unmounted.
  useEffect(() => {
    logger.current.info('Gyroscope', `Hook initialized. Orientation API: ${typeof window.DeviceOrientationEvent !== 'undefined'}, Motion API: ${typeof window.DeviceMotionEvent !== 'undefined'}`);

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
      orientationEventCountRef.current += 1;
      lastOrientationTsRef.current = e.timeStamp ?? Date.now();

      const nextOrientation = {
        alpha: (e.alpha ?? 0) - calibrationRef.current.alphaOffset,
        beta: (e.beta ?? 0) - calibrationRef.current.betaOffset,
        gamma: (e.gamma ?? 0) - calibrationRef.current.gammaOffset,
      };

      if ([nextOrientation.alpha, nextOrientation.beta, nextOrientation.gamma].some((value) => value === null || value === undefined || Number.isNaN(value))) {
        logger.current.error('Gyroscope', 'Invalid orientation values detected');
      }

      orientationRef.current = nextOrientation;
      lastOrientationValuesRef.current = nextOrientation;

      if (orientationEventCountRef.current === 1) {
        logger.current.info('Gyroscope', `First orientation reading received: alpha=${nextOrientation.alpha.toFixed(2)}, beta=${nextOrientation.beta.toFixed(2)}, gamma=${nextOrientation.gamma.toFixed(2)}`);
      }

      if (orientationEventCountRef.current % 40 === 0) {
        logger.current.info('Gyroscope', `Orientation update #${orientationEventCountRef.current}: alpha=${nextOrientation.alpha.toFixed(2)}, beta=${nextOrientation.beta.toFixed(2)}, gamma=${nextOrientation.gamma.toFixed(2)}`);
      }
    };
    window.addEventListener('deviceorientation', orientationHandlerRef.current, true);
  }

  // Attach a listener that stores the device's acceleration after subtracting the bias calibration.
  function attachMotionListener() {
    motionHandlerRef.current = (e: DeviceMotionEvent) => {
      motionEventCountRef.current += 1;
      lastMotionTsRef.current = e.timeStamp ?? Date.now();

      const acceleration = e.acceleration ?? e.accelerationIncludingGravity ?? null;
      if (!acceleration) {
        logger.current.warn('Gyroscope', 'No accelerometer data object received');
        return;
      }

      const rawX = acceleration.x ?? 0;
      const rawY = acceleration.y ?? 0;
      const rawZ = acceleration.z ?? 0;

      if (motionCalibratingRef.current && motionSampleRef.current) {
        const stationaryLimit = 2.0;
        if (Math.abs(rawX) < stationaryLimit && Math.abs(rawY) < stationaryLimit && Math.abs(rawZ) < stationaryLimit) {
          motionSampleRef.current.count += 1;
          motionSampleRef.current.sumX += rawX;
          motionSampleRef.current.sumY += rawY;
          motionSampleRef.current.sumZ += rawZ;
        }
      }

      const calibrated = {
        x: rawX - motionCalibrationRef.current.xOffset,
        y: rawY - motionCalibrationRef.current.yOffset,
        z: rawZ - motionCalibrationRef.current.zOffset,
        timestamp: e.timeStamp || Date.now(),
      };

      motionRef.current = calibrated;
      lastMotionValuesRef.current = calibrated;

      if (motionEventCountRef.current === 1) {
        logger.current.info('Gyroscope', `First motion reading received: raw=(${rawX.toFixed(2)}, ${rawY.toFixed(2)}, ${rawZ.toFixed(2)}) calibrated=(${calibrated.x.toFixed(2)}, ${calibrated.y.toFixed(2)}, ${calibrated.z.toFixed(2)})`);
      }

      if (motionEventCountRef.current % 40 === 0) {
        logger.current.info('Gyroscope', `Motion update #${motionEventCountRef.current}: raw=(${rawX.toFixed(2)}, ${rawY.toFixed(2)}, ${rawZ.toFixed(2)}) calibrated=(${calibrated.x.toFixed(2)}, ${calibrated.y.toFixed(2)}, ${calibrated.z.toFixed(2)})`);
      }

      if (rawX === 0 && rawY === 0 && rawZ === 0) {
        logger.current.warn('Gyroscope', 'Accelerometer values are always zero');
      }

      if (Math.abs(rawX) > 2 || Math.abs(rawY) > 2 || Math.abs(rawZ) > 2) {
        logger.current.warn('Gyroscope', 'High sensor noise detected');
      }
    };
    window.addEventListener('devicemotion', motionHandlerRef.current, true);
  }

  async function requestPermission() {
    logger.current.info('Gyroscope', 'Permission request started');
    const supportsOrientation = typeof window.DeviceOrientationEvent !== 'undefined';
    const supportsMotion = typeof window.DeviceMotionEvent !== 'undefined';

    logger.current.info('Gyroscope', `DeviceOrientation support=${supportsOrientation}; DeviceMotion support=${supportsMotion}`);

    if (!supportsOrientation && !supportsMotion) {
      logger.current.warn('Gyroscope', 'Device sensors are unsupported in this browser');
      setState('unsupported');
      return;
    }

    const needsOrientationPermission =
      typeof (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> })
        .requestPermission === 'function';
    const needsMotionPermission =
      typeof (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> })
        .requestPermission === 'function';

    logger.current.info('Gyroscope', `Orientation permission required=${needsOrientationPermission}; Motion permission required=${needsMotionPermission}`);
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
          logger.current.info('Gyroscope', `Orientation permission ${orientationGranted ? 'granted' : 'denied'}`);
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
          logger.current.info('Gyroscope', `Motion permission ${motionGranted ? 'granted' : 'denied'}`);
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
        logger.current.info('Gyroscope', 'Sensor permission request completed successfully');
        setState('granted');
      } else {
        logger.current.warn('Gyroscope', 'Sensor permission denied');
        setState('denied');
      }
    } catch (error) {
      logger.current.error('Gyroscope', `Sensor permission request failed: ${error instanceof Error ? error.message : String(error)}`);
      setState('denied');
    }
  }

  function stop() {
    logger.current.info('Gyroscope', 'Stopping sensor listeners');
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
    logger.current.info('Gyroscope', `Applying orientation calibration: alphaOffset=${newCalibration.alphaOffset.toFixed(2)}, betaOffset=${newCalibration.betaOffset.toFixed(2)}, gammaOffset=${newCalibration.gammaOffset.toFixed(2)}`);
    calibrationRef.current = newCalibration;
    setCalibration(newCalibration);
  }

  function resetMotionCalibration() {
    logger.current.info('Gyroscope', 'Resetting motion calibration offsets');
    motionCalibrationRef.current = { xOffset: 0, yOffset: 0, zOffset: 0 };
    setMotionCalibration({ xOffset: 0, yOffset: 0, zOffset: 0 });
  }

  // Average the stationary samples gathered during accelerometer calibration.
  function finishMotionCalibration() {
    if (!motionSampleRef.current || motionSampleRef.current.count === 0) {
      logger.current.error('Gyroscope', 'No valid accelerometer samples collected');
      motionSampleRef.current = null;
      motionCalibratingRef.current = false;
      setMotionCalibrating(false);
      motionCalibrationTimerRef.current = null;
      return;
    }

    const { count, sumX, sumY, sumZ } = motionSampleRef.current;
    const nextMotionCalibration = {
      xOffset: sumX / count,
      yOffset: sumY / count,
      zOffset: sumZ / count,
    };
    logger.current.info('Gyroscope', `Motion calibration finished: xOffset=${nextMotionCalibration.xOffset.toFixed(2)}, yOffset=${nextMotionCalibration.yOffset.toFixed(2)}, zOffset=${nextMotionCalibration.zOffset.toFixed(2)}`);
    motionCalibrationRef.current = nextMotionCalibration;
    setMotionCalibration(nextMotionCalibration);

    motionSampleRef.current = null;
    motionCalibratingRef.current = false;
    setMotionCalibrating(false);
    motionCalibrationTimerRef.current = null;
  }

  // Collect a short burst of motion samples while the device is held still.
  function calibrateMotion() {
    if (motionCalibrating) {
      return;
    }

    logger.current.info('Gyroscope', 'Motion calibration started');
    motionSampleRef.current = { count: 0, sumX: 0, sumY: 0, sumZ: 0 };
    motionCalibratingRef.current = true;
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
    orientationEventCount: orientationEventCountRef,
    motionEventCount: motionEventCountRef,
    lastOrientationTs: lastOrientationTsRef,
    lastMotionTs: lastMotionTsRef,
    lastOrientationValues: lastOrientationValuesRef,
    lastMotionValues: lastMotionValuesRef,
  };
}
