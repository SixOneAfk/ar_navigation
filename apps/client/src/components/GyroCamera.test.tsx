import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import type { RefObject } from 'react';
import { GyroCamera } from './GyroCamera';
import * as THREE from 'three';
import type { MotionData, Orientation } from '../hooks/useGyroscope';

const camera = {
  position: new THREE.Vector3(0, 1.6, 3),
  quaternion: new THREE.Quaternion(),
  getWorldDirection: vi.fn(() => new THREE.Vector3(0, 0, -1)),
};

vi.mock('@react-three/fiber', () => ({
  useThree: () => ({
    camera,
  }),
  useFrame: (callback: (state: unknown, delta: number) => void) => callback({}, 0.016),
}));

describe('GyroCamera', () => {
  beforeEach(() => {
    camera.position.set(0, 1.6, 3);
    camera.quaternion.identity();

    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(window, 'ResizeObserver', {
      writable: true,
      value: ResizeObserverMock,
    });
  });

  it('advances position from detected steps in walk mode', () => {
    const orientationRef: RefObject<Orientation> = {
      current: { alpha: 0, beta: 0, gamma: 0 },
    };
    const motionRef: RefObject<MotionData> = {
      current: { x: 0, y: 0, z: 2, timestamp: 16 },
    };
    const startZ = camera.position.z;

    const view = render(
      <GyroCamera
        orientationRef={orientationRef}
        motionRef={motionRef}
        active
        moveMode="walk"
        stepCount={0}
        stepStrideMeters={0.65}
      />,
    );

    view.rerender(
      <GyroCamera
        orientationRef={orientationRef}
        motionRef={motionRef}
        active
        moveMode="walk"
        stepCount={1}
        stepStrideMeters={0.65}
      />,
    );

    expect(camera.position.z).not.toBe(startZ);
  });

  it('maps joystick up to camera-relative forward movement', () => {
    const orientationRef: RefObject<Orientation> = {
      current: { alpha: 0, beta: 0, gamma: 0 },
    };
    const motionRef: RefObject<MotionData> = {
      current: { x: 0, y: 0, z: 0, timestamp: 16 },
    };
    const startZ = camera.position.z;

    render(
      <GyroCamera
        orientationRef={orientationRef}
        motionRef={motionRef}
        active
        moveMode="buttons"
        joystick={{ x: 0, y: 1 }}
      />,
    );

    expect(camera.position.z).toBeLessThan(startZ);
  });

  it('uses the activation heading as the camera rotation baseline', () => {
    const orientationRef: RefObject<Orientation> = {
      current: { alpha: 90, beta: 0, gamma: 0 },
    };
    const motionRef: RefObject<MotionData> = {
      current: { x: 0, y: 0, z: 0, timestamp: 16 },
    };
    const view = render(
      <GyroCamera
        orientationRef={orientationRef}
        motionRef={motionRef}
        active
        moveMode="buttons"
      />,
    );

    expect(camera.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(0);

    const turnedOrientationRef: RefObject<Orientation> = {
      current: { alpha: 120, beta: 0, gamma: 0 },
    };
    view.rerender(
      <GyroCamera
        orientationRef={turnedOrientationRef}
        motionRef={motionRef}
        active
        moveMode="buttons"
      />,
    );

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    expect(forward.x).toBeLessThan(0);
  });

  it('keeps gyro mode orientation-only without tilt translation', () => {
    const orientationRef: RefObject<Orientation> = {
      current: { alpha: 0, beta: 42, gamma: 38 },
    };
    const motionRef: RefObject<MotionData> = {
      current: { x: 0, y: 0, z: 0, timestamp: 16 },
    };
    const start = camera.position.clone();

    render(
      <GyroCamera
        orientationRef={orientationRef}
        motionRef={motionRef}
        active
        moveMode="gyro"
      />,
    );

    expect(camera.position.x).toBeCloseTo(start.x);
    expect(camera.position.y).toBeCloseTo(start.y);
    expect(camera.position.z).toBeCloseTo(start.z);
  });

  it('moves vertically in buttons mode when debug vertical is enabled', () => {
    const orientationRef: RefObject<Orientation> = {
      current: { alpha: 0, beta: 0, gamma: 0 },
    };
    const motionRef: RefObject<MotionData> = {
      current: { x: 0, y: 0, z: 0, timestamp: 16 },
    };
    const startY = camera.position.y;

    render(
      <GyroCamera
        orientationRef={orientationRef}
        motionRef={motionRef}
        active
        moveMode="buttons"
        debugVerticalEnabled
        verticalAxis={1}
      />,
    );

    expect(camera.position.y).toBeGreaterThan(startY);
  });
});
