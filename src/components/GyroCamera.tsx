import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Orientation } from '../hooks/useGyroscope';

type GyroCameraProps = {
  orientationRef: React.RefObject<Orientation>;
  active: boolean;
};

//type Gyromovement = {
  acceleration: React.RefObject<DeviceMotionEventAcceleration>;
}

// These constants follow the same derivation as the original Three.js
// DeviceOrientationControls (since removed from the library):
// https://github.com/mrdoob/three.js/blob/master/examples/jsm/controls/DeviceOrientationControls.js
//
// The device sensor frame (Z-up) differs from the Three.js camera frame (Y-up).
// q1 is the fixed -90° rotation around X that bridges the two.
const _zee = new THREE.Vector3(0, 0, 1);
const _q0 = new THREE.Quaternion();
const _q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -π/2 around X

export function GyroCamera({ orientationRef, active }: GyroCameraProps) {
  const { camera } = useThree();
  const targetQ = useRef(new THREE.Quaternion());
  const euler = useRef(new THREE.Euler());

  useFrame(() => {
    if (!active) return;

    const orientation = orientationRef.current;
    if (!orientation) return;
    const { alpha, beta, gamma } = orientation;

    // Map DeviceOrientation Euler angles into a quaternion.
    // YXZ order matches the device sensor axes for portrait mode.
    euler.current.set(
      THREE.MathUtils.degToRad(beta),
      THREE.MathUtils.degToRad(alpha),
      THREE.MathUtils.degToRad(-gamma),
      'YXZ',
    );

    targetQ.current.setFromEuler(euler.current);

    // Bridge sensor frame → Three.js Y-up camera frame.
    targetQ.current.multiply(_q1);

    // Compensate for current screen orientation (portrait = 0, landscape = 90).
    const screenAngle =
      (window.screen?.orientation?.angle ?? 0) * (Math.PI / 180);
    _q0.setFromAxisAngle(_zee, -screenAngle);
    targetQ.current.multiply(_q0);

    // Smooth interpolation prevents jitter from noisy sensors.
    camera.quaternion.slerp(targetQ.current, 0.12);
  });

  return null;
}
