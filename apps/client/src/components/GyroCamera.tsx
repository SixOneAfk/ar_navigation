import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { MotionData, Orientation } from '../hooks/useGyroscope';
import type { JoystickValue } from './VirtualJoystick';
import { createDebugLogger } from '../utils/debugLogger';

/** One Three.js world unit represents one real-world meter. */
export const DEFAULT_MOVEMENT_SPEED_MPS = 1.5;
const CAMERA_HEIGHT_METERS = 1.2;
const GYRO_TILT_DEADZONE = 0.12;
const DEFAULT_WALK_CADENCE_HZ = 2;
const MIN_WALK_SPEED_MPS = 0.6;
const MAX_WALK_SPEED_MPS = 2.2;

/**
 * CHANGE FROM INITIAL MAIN CLONE
 *
 * What changed:
 * - The original camera only applied DeviceOrientation rotation.
 * - The current camera also translates using gyro tilt, joystick input, and detected steps.
 *
 * Why:
 * - The original clone had no complete walking/manual movement pipeline.
 *
 * Previous behavior:
 * - Orientation was converted to a smoothed quaternion; camera position was not driven by walking.
 *
 * Current behavior:
 * - Direction comes from the camera's horizontal forward/right vectors.
 * - Magnitude is expressed in meters and multiplied by frame delta.
 *
 * Impact:
 * - Affects gyro, joystick, walking, sensitivity, camera height, and movement-mode behavior.
 * - The physical-unit conversion was introduced in the Scale is good work (e72e704) and refined in 3e32350.
 */

type GyroCameraProps = {
  orientationRef: React.RefObject<Orientation>;
  motionRef: React.RefObject<MotionData>;
  active: boolean;
  moveMode?: 'off' | 'gyro' | 'buttons' | 'walk';
  joystick?: JoystickValue;
  stepCount?: number;
  stepStrideMeters?: number;
  sensitivity?: number;
  movementSpeedMetersPerSecond?: number;
  calibrationTarget?: { x: number; y: number; z: number };
  calibrationMoveActive?: boolean;
  onPoseChange?: (position: { x: number; y: number; z: number }) => void;
  onSensorChange?: (snapshot: { alpha: number; beta: number; gamma: number; x: number; y: number; z: number }) => void;
};

export function GyroCamera({
  orientationRef,
  motionRef,
  active,
  moveMode = 'off',
  sensitivity = 0.6,
  movementSpeedMetersPerSecond = DEFAULT_MOVEMENT_SPEED_MPS,
  joystick = { x: 0, y: 0 },
  stepCount = 0,
  stepStrideMeters = 0.65,
  calibrationTarget,
  calibrationMoveActive = false,
  onPoseChange,
  onSensorChange,
}: GyroCameraProps) {
  const { camera } = useThree();
  const logger = useRef(createDebugLogger({ enabled: import.meta.env?.VITE_DEBUG_SENSORS === 'true' }));
  const targetQ = useRef(new THREE.Quaternion());
  const euler = useRef(new THREE.Euler());
  const moveDirection = useRef(new THREE.Vector3());
  const strafeDirection = useRef(new THREE.Vector3());
  const walkVelocity = useRef(0);
  const walkDistanceRemaining = useRef(0);
  const lastStepCountRef = useRef(stepCount);
  const lastStepAtRef = useRef<number | null>(null);
  const calibrationVec = useRef(new THREE.Vector3());
  const baseAlphaRef = useRef<number | null>(null);
  const lastJoystickLogAtRef = useRef(0);
  const lastMovementLogAtRef = useRef(0);

  useEffect(() => {
    if (!active) {
      logger.current.info('GyroCamera', 'Camera deactivated');
      baseAlphaRef.current = null;
      walkDistanceRemaining.current = 0;
      lastStepAtRef.current = null;
      return;
    }

    logger.current.info('GyroCamera', `Camera activated with moveMode=${moveMode}`);

    if (baseAlphaRef.current === null) {
      baseAlphaRef.current = orientationRef.current?.alpha ?? 0;
      logger.current.info('GyroCamera', `Base alpha set to ${baseAlphaRef.current.toFixed(2)}`);
    }
  }, [active, moveMode, orientationRef]);

  useFrame((_, delta) => {
    if (!active) return;

    const orientation = orientationRef.current;
    if (!orientation) return;

    const baseAlpha = baseAlphaRef.current ?? orientation.alpha;
    const relativeAlpha = ((orientation.alpha - baseAlpha + 540) % 360) - 180;

    logger.current.debug('GyroCamera', `baseAlpha=${baseAlpha.toFixed(2)} relativeAlpha=${relativeAlpha.toFixed(2)}`);

    euler.current.set(0, THREE.MathUtils.degToRad(relativeAlpha), 0, 'YXZ');
    targetQ.current.setFromEuler(euler.current);
    camera.quaternion.slerp(targetQ.current, 0.12);

    moveDirection.current.set(0, 0, -1).applyQuaternion(camera.quaternion);
    moveDirection.current.y = 0;
    moveDirection.current.normalize();

    strafeDirection.current.set(1, 0, 0).applyQuaternion(camera.quaternion);
    strafeDirection.current.y = 0;
    strafeDirection.current.normalize();

    const motion = motionRef.current;

    if (calibrationMoveActive && calibrationTarget) {
      calibrationVec.current.set(calibrationTarget.x, calibrationTarget.y, calibrationTarget.z);
      camera.position.lerp(calibrationVec.current, 0.09);
    }

    const forwardTiltInput = THREE.MathUtils.clamp((orientation.beta - 16) / 40, -1, 1);
    const strafeTiltInput = THREE.MathUtils.clamp(orientation.gamma / 50, -1, 1);
    const gyroInput = new THREE.Vector2(
      Math.abs(strafeTiltInput) < GYRO_TILT_DEADZONE ? 0 : strafeTiltInput,
      Math.abs(forwardTiltInput) < GYRO_TILT_DEADZONE ? 0 : forwardTiltInput,
    );
    if (gyroInput.length() > 1) gyroInput.normalize();
    const effectiveSpeedMps = movementSpeedMetersPerSecond * sensitivity;
    const frameDistanceMeters = effectiveSpeedMps * delta;

    let moveAmount = 0;
    let strafeAmount = 0;
    let verticalAmount = 0;

    if (moveMode === 'buttons') {
      const now = performance.now();
      if (now - lastJoystickLogAtRef.current >= 250) {
        const magnitude = Math.min(1, Math.hypot(joystick.x, joystick.y));
        logger.current.debug('GyroCamera', `World scale: 1 unit = 1 meter | Joystick X: ${joystick.x.toFixed(2)} Y: ${joystick.y.toFixed(2)} magnitude: ${magnitude.toFixed(2)} Movement mode: ${moveMode} Speed: ${effectiveSpeedMps.toFixed(2)} m/s Delta: ${delta.toFixed(3)} s Distance/frame: ${frameDistanceMeters.toFixed(3)} m Camera: (${camera.position.x.toFixed(2)} m, ${camera.position.y.toFixed(2)} m, ${camera.position.z.toFixed(2)} m)`);
        lastJoystickLogAtRef.current = now;
      }
    }

    if (moveMode === 'gyro') {
      moveAmount = gyroInput.y * frameDistanceMeters;
      strafeAmount = gyroInput.x * frameDistanceMeters;
    } else if (moveMode === 'buttons') {
      const joystickInput = new THREE.Vector2(joystick.x, joystick.y);
      if (joystickInput.length() > 1) joystickInput.normalize();
      moveAmount = joystickInput.y * frameDistanceMeters;
      strafeAmount = joystickInput.x * frameDistanceMeters;
    } else if (moveMode === 'walk') {
      if (stepCount < lastStepCountRef.current) {
        lastStepCountRef.current = stepCount;
        walkDistanceRemaining.current = 0;
        lastStepAtRef.current = null;
      }

      if (stepCount > lastStepCountRef.current) {
        const newSteps = stepCount - lastStepCountRef.current;
        const now = performance.now();
        const stepIntervalSeconds = lastStepAtRef.current === null
          ? 1 / DEFAULT_WALK_CADENCE_HZ
          : Math.max((now - lastStepAtRef.current) / 1000 / newSteps, 0.25);
        walkVelocity.current = THREE.MathUtils.clamp(
          stepStrideMeters / stepIntervalSeconds,
          MIN_WALK_SPEED_MPS,
          MAX_WALK_SPEED_MPS,
        );
        walkDistanceRemaining.current += newSteps * stepStrideMeters;
        lastStepCountRef.current = stepCount;
        lastStepAtRef.current = now;
      }

      // Step stride is meters; cadence determines the physical m/s between detections.
      const effectiveWalkSpeedMps = walkVelocity.current * sensitivity;
      moveAmount = Math.min(walkDistanceRemaining.current, effectiveWalkSpeedMps * delta);
      walkDistanceRemaining.current -= moveAmount;
      const now = performance.now();
      if (now - lastMovementLogAtRef.current >= 250) {
        logger.current.debug('GyroCamera', `World scale: 1 unit = 1 meter | Walk raw acceleration=${(motion?.z ?? 0).toFixed(3)} m/s^2 steps=${stepCount} velocity=${effectiveWalkSpeedMps.toFixed(3)} m/s Delta: ${delta.toFixed(3)} s Distance/frame: ${moveAmount.toFixed(3)} m Camera: (${camera.position.x.toFixed(2)} m, ${camera.position.y.toFixed(2)} m, ${camera.position.z.toFixed(2)} m)`);
        lastMovementLogAtRef.current = now;
      }
    }

    camera.position.addScaledVector(moveDirection.current, moveAmount);
    camera.position.addScaledVector(strafeDirection.current, strafeAmount);
    camera.position.y += verticalAmount;
    camera.position.y = Math.max(camera.position.y, CAMERA_HEIGHT_METERS);

    onSensorChange?.({
      alpha: orientation.alpha,
      beta: orientation.beta,
      gamma: orientation.gamma,
      x: motion?.x ?? 0,
      y: motion?.y ?? 0,
      z: motion?.z ?? 0,
    });

    onPoseChange?.({ x: camera.position.x, y: camera.position.y, z: camera.position.z });
  });

  return null;
}
