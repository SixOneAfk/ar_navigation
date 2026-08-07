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

  it('updates camera orientation when active', () => {
    const orientationRef = { current: { alpha: 90, beta: 35, gamma: 10 } };
    const before = camera.quaternion.clone();

    render(<GyroCamera orientationRef={orientationRef as any} active />);

    expect(camera.quaternion.equals(before)).toBe(false);
  });

  it('advances position when step count increases', () => {
    const orientationRef = { current: { alpha: 0, beta: 0, gamma: 0 } };
    const startZ = camera.position.z;

    render(
      <GyroCamera
        orientationRef={orientationRef as any}
        active
        movementEnabled
        stepCount={1}
        stepStrideMeters={1}
      />,
    );

    expect(camera.position.z).not.toBe(startZ);
  });
});
