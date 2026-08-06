import { useEffect, useRef } from 'react';
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

/**
 * Updates the scene camera from the device's motion sensors.
 * It converts orientation and acceleration into a first-person-like movement experience.
 */
export function GyroCamera({ orientationRef, motionRef, active, moveMode = 'off', sensitivity = 0.6, walkSpeed = 1, buttonState, calibrationTarget, calibrationMoveActive = false, onPoseChange, onSensorChange }: GyroCameraProps) {
  const { camera } = useThree();
  const targetQ = useRef(new THREE.Quaternion());
  const euler = useRef(new THREE.Euler());
  const moveDirection = useRef(new THREE.Vector3());
  const strafeDirection = useRef(new THREE.Vector3());
  const filteredAccel = useRef(0);
  const walkVelocity = useRef(0);
  const calibrationVec = useRef(new THREE.Vector3());
  const baseAlphaRef = useRef<number | null>(null);

  // Store the initial heading once the camera becomes active so later updates are relative.
  useEffect(() => {
    if (!active) {
      baseAlphaRef.current = null;
      return;
    }

    if (baseAlphaRef.current === null) {
      baseAlphaRef.current = orientationRef.current?.alpha ?? 0;
    }
  }, [active, orientationRef]);

  useFrame((_, delta) => {
    if (!active) return;

    const orientation = orientationRef.current;
    if (!orientation) return;

    // Calculate the camera yaw from the device heading relative to the initial orientation.
    const baseAlpha = baseAlphaRef.current ?? orientation.alpha;
    const relativeAlpha = ((orientation.alpha - baseAlpha + 540) % 360) - 180;

    euler.current.set(0, THREE.MathUtils.degToRad(relativeAlpha), 0, 'YXZ');
    targetQ.current.setFromEuler(euler.current);
    camera.quaternion.slerp(targetQ.current, 0.12);

    // Build forward and sideways vectors in camera space so motion follows the view direction.
    moveDirection.current.set(0, 0, -1).applyQuaternion(camera.quaternion);
    moveDirection.current.y = 0;
    moveDirection.current.normalize();

    strafeDirection.current.set(1, 0, 0).applyQuaternion(camera.quaternion);
    strafeDirection.current.y = 0;
    strafeDirection.current.normalize();

    const motion = motionRef.current;

    // During calibration, smoothly move the camera to a target location.
    if (calibrationMoveActive && calibrationTarget) {
      calibrationVec.current.set(calibrationTarget.x, calibrationTarget.y, calibrationTarget.z);
      camera.position.lerp(calibrationVec.current, 0.09);
    }

    // Convert tilt values into movement amounts for gyro-based navigation.
    const forwardTiltInput = THREE.MathUtils.clamp((orientation.beta - 16) / 40, -1, 1);
    const strafeTiltInput = THREE.MathUtils.clamp(orientation.gamma / 50, -1, 1);
    const gyroMoveAmount = Math.abs(forwardTiltInput) < 0.12 ? 0 : forwardTiltInput * 0.0035 * sensitivity;
    const gyroStrafeAmount = Math.abs(strafeTiltInput) < 0.12 ? 0 : strafeTiltInput * 0.0035 * sensitivity;

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
      // Smooth the raw acceleration so small shakes do not trigger movement.
      const rawZAcceleration = motion?.z ?? 0;
      const lowPassAlpha = 0.16;
      const filteredZ = filteredAccel.current + lowPassAlpha * (rawZAcceleration - filteredAccel.current);
      filteredAccel.current = filteredZ;

      const threshold = 0.12;
      const smoothedAccel = Math.abs(filteredZ) > threshold ? filteredZ : 0;
      const dt = Math.max(delta, 0.016);

      // Integrate acceleration into a simple walking velocity.
      walkVelocity.current += smoothedAccel * dt * 0.9;
      walkVelocity.current *= 0.84;
      walkVelocity.current = THREE.MathUtils.clamp(walkVelocity.current, -1.2, 1.2);

      moveAmount = walkVelocity.current * dt * 0.7 * sensitivity * walkSpeed;
    }

    // Apply all movement vectors to the camera position.
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
