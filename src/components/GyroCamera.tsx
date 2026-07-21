import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { MotionData, Orientation } from '../hooks/useGyroscope';

type GyroCameraProps = {
  orientationRef: React.RefObject<Orientation>;
  motionRef: React.RefObject<MotionData>;
  active: boolean;
  moveMode?: 'off' | 'gyro' | 'buttons' | 'walk';
  buttonState?: { forward: boolean; backward: boolean; left: boolean; right: boolean; up: boolean; down: boolean };
  sensitivity?: number;
  walkSpeed?: number;
  calibrationTarget?: { x: number; y: number; z: number };
  calibrationMoveActive?: boolean;
  onPoseChange?: (position: { x: number; y: number; z: number }) => void;
  onSensorChange?: (snapshot: { alpha: number; beta: number; gamma: number; x: number; y: number; z: number }) => void;
};

// Use a simpler, more stable mapping from device orientation to a camera rotation.
// This avoids the extra frame conversions that were causing the scene to tilt.

export function GyroCamera({ orientationRef, motionRef, active, moveMode = 'off', sensitivity = 0.6, walkSpeed = 1, buttonState, calibrationTarget, calibrationMoveActive = false, onPoseChange, onSensorChange }: GyroCameraProps) {
  const { camera } = useThree();
  const targetQ = useRef(new THREE.Quaternion());
  const euler = useRef(new THREE.Euler());
  const moveDirection = useRef(new THREE.Vector3());
  const strafeDirection = useRef(new THREE.Vector3());
  const filteredAccel = useRef(0);
  const walkVelocity = useRef(0);
  const calibrationVec = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    if (!active) return;

    const orientation = orientationRef.current;
    if (!orientation) return;
    const { alpha, beta, gamma } = orientation;

    // Keep the view level and only use yaw from the device.
    // Pitch and roll are disabled so the world does not rotate around you.
    euler.current.set(0, THREE.MathUtils.degToRad(alpha), 0, 'YXZ');

    targetQ.current.setFromEuler(euler.current);
    camera.quaternion.slerp(targetQ.current, 0.12);

    // Forward/back movement uses only explicit mode selection.
    moveDirection.current.set(0, 0, -1).applyQuaternion(camera.quaternion);
    moveDirection.current.y = 0;
    moveDirection.current.normalize();

    // Left/right strafe uses only explicit mode selection.
    strafeDirection.current.set(1, 0, 0).applyQuaternion(camera.quaternion);
    strafeDirection.current.y = 0;
    strafeDirection.current.normalize();

    const motion = motionRef.current;

    if (calibrationMoveActive && calibrationTarget) {
      calibrationVec.current.set(calibrationTarget.x, calibrationTarget.y, calibrationTarget.z);
      camera.position.lerp(calibrationVec.current, 0.09);
    }

    const forwardTiltInput = THREE.MathUtils.clamp((beta - 16) / 40, -1, 1);
    const strafeTiltInput = THREE.MathUtils.clamp(gamma / 50, -1, 1);

    const forwardInput = forwardTiltInput;
    const strafeInput = strafeTiltInput;

    const gyroMoveAmount = Math.abs(forwardInput) < 0.12 ? 0 : forwardInput * 0.0035 * sensitivity;
    const gyroStrafeAmount = Math.abs(strafeInput) < 0.12 ? 0 : strafeInput * 0.0035 * sensitivity;

    let moveAmount = 0;
    let strafeAmount = 0;
    let verticalAmount = 0;

    if (moveMode === 'gyro') {
      moveAmount = gyroMoveAmount;
      strafeAmount = gyroStrafeAmount;
    } else if (moveMode === 'buttons') {
      if (buttonState?.forward) moveAmount += 0.02;
      if (buttonState?.backward) moveAmount -= 0.02;
      if (buttonState?.left) strafeAmount -= 0.02;
      if (buttonState?.right) strafeAmount += 0.02;
      if (buttonState?.up) verticalAmount += 0.02;
      if (buttonState?.down) verticalAmount -= 0.02;
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
    }

    camera.position.addScaledVector(moveDirection.current, moveAmount);
    camera.position.addScaledVector(strafeDirection.current, strafeAmount);
    camera.position.y += verticalAmount;

    onSensorChange?.({
      alpha,
      beta,
      gamma,
      x: motion?.x ?? 0,
      y: motion?.y ?? 0,
      z: motion?.z ?? 0,
    });

    camera.position.y = Math.max(camera.position.y, 1.2);

    onPoseChange?.({
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    });
  });

  return null;
}
