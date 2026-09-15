import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { MotionData, Orientation } from '../hooks/useGyroscope';
import type { JoystickValue } from './VirtualJoystick';
import { createDebugLogger } from '../utils/debugLogger';

type GyroCameraProps = {
  orientationRef: React.RefObject<Orientation>;
  motionRef: React.RefObject<MotionData>;
  active: boolean;
  moveMode?: 'off' | 'gyro' | 'buttons' | 'walk';
  joystick?: JoystickValue;
  sensitivity?: number;
  walkSpeed?: number;
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
  walkSpeed = 1,
  joystick = { x: 0, y: 0 },
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
  const filteredAccel = useRef(0);
  const walkVelocity = useRef(0);
  const calibrationVec = useRef(new THREE.Vector3());
  const baseAlphaRef = useRef<number | null>(null);
  const lastJoystickLogAtRef = useRef(0);

  useEffect(() => {
    if (!active) {
      logger.current.info('GyroCamera', 'Camera deactivated');
      baseAlphaRef.current = null;
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
    const gyroMoveAmount = Math.abs(forwardTiltInput) < 0.12 ? 0 : forwardTiltInput * 0.0035 * sensitivity;
    const gyroStrafeAmount = Math.abs(strafeTiltInput) < 0.12 ? 0 : strafeTiltInput * 0.0035 * sensitivity;

    logger.current.debug('GyroCamera', `gyro inputs: forwardTilt=${forwardTiltInput.toFixed(3)} strafeTilt=${strafeTiltInput.toFixed(3)} move=${gyroMoveAmount.toFixed(4)} strafe=${gyroStrafeAmount.toFixed(4)}`);

    let moveAmount = 0;
    let strafeAmount = 0;
    let verticalAmount = 0;

    if (moveMode === 'buttons') {
      const now = performance.now();
      if (now - lastJoystickLogAtRef.current >= 250) {
        const magnitude = Math.min(1, Math.hypot(joystick.x, joystick.y));
        logger.current.debug('GyroCamera', `Joystick X: ${joystick.x.toFixed(2)} Y: ${joystick.y.toFixed(2)} magnitude: ${magnitude.toFixed(2)} Movement mode: ${moveMode}`);
        lastJoystickLogAtRef.current = now;
      }
    }

    if (moveMode === 'gyro') {
      moveAmount = gyroMoveAmount;
      strafeAmount = gyroStrafeAmount;
    } else if (moveMode === 'buttons') {
      moveAmount = joystick.y * 0.02 * sensitivity;
      strafeAmount = joystick.x * 0.02 * sensitivity;
    } else if (moveMode === 'walk') {
      const rawZAcceleration = motion?.z ?? 0;
      const lowPassAlpha = 0.16;
      const filteredZ = filteredAccel.current + lowPassAlpha * (rawZAcceleration - filteredAccel.current);
      filteredAccel.current = filteredZ;

      const threshold = 0.12;
      const smoothedAccel = Math.abs(filteredZ) > threshold ? filteredZ : 0;
      const dt = Math.max(delta, 0.016);

      walkVelocity.current += smoothedAccel * dt * 0.9;
      walkVelocity.current *= 0.84;
      walkVelocity.current = THREE.MathUtils.clamp(walkVelocity.current, -1.2, 1.2);

      moveAmount = walkVelocity.current * dt * 0.7 * sensitivity * walkSpeed;
      logger.current.debug('GyroCamera', `walk inputs: rawAccel=${rawZAcceleration.toFixed(3)} filtered=${filteredZ.toFixed(3)} velocity=${walkVelocity.current.toFixed(3)} move=${moveAmount.toFixed(4)}`);
    }

    camera.position.addScaledVector(moveDirection.current, moveAmount);
    camera.position.addScaledVector(strafeDirection.current, strafeAmount);
    camera.position.y += verticalAmount;
    camera.position.y = Math.max(camera.position.y, 1.2);

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
