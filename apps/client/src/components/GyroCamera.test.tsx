import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { GyroCamera } from './GyroCamera';
import * as THREE from 'three';

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
    const orientationRef = { current: { alpha: 0, beta: 0, gamma: 0 } };
    const motionRef = { current: { x: 0, y: 0, z: 2, timestamp: 16 } };
    const startZ = camera.position.z;

    const view = render(
      <GyroCamera
        orientationRef={orientationRef as any}
        motionRef={motionRef as any}
        active
        moveMode="walk"
        stepCount={0}
        stepStrideMeters={0.65}
      />,
    );

    view.rerender(
      <GyroCamera
        orientationRef={orientationRef as any}
        motionRef={motionRef as any}
        active
        moveMode="walk"
        stepCount={1}
        stepStrideMeters={0.65}
      />,
    );

    expect(camera.position.z).not.toBe(startZ);
  });

  it('maps joystick up to camera-relative forward movement', () => {
    const orientationRef = { current: { alpha: 0, beta: 0, gamma: 0 } };
    const motionRef = { current: { x: 0, y: 0, z: 0, timestamp: 16 } };
    const startZ = camera.position.z;

    render(
      <GyroCamera
        orientationRef={orientationRef as any}
        motionRef={motionRef as any}
        active
        moveMode="buttons"
        joystick={{ x: 0, y: 1 }}
      />,
    );

    expect(camera.position.z).toBeLessThan(startZ);
  });
});
