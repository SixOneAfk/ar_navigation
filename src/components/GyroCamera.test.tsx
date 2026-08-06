import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { GyroCamera } from './GyroCamera';
import * as THREE from 'three';

vi.mock('@react-three/fiber', () => ({
  useThree: () => ({
    camera: {
      position: new THREE.Vector3(0, 1.6, 3),
      quaternion: new THREE.Quaternion(),
    },
  }),
  useFrame: (callback: (state: unknown, delta: number) => void) => callback({}, 0.016),
}));

describe('GyroCamera', () => {
  beforeEach(() => {
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

  it('moves the camera in gyro mode when tilt is above threshold', () => {
    const orientationRef = { current: { alpha: 90, beta: 35, gamma: 10 } };
    const motionRef = { current: { x: 0, y: 0, z: 0, timestamp: 0 } };

    const onPoseChange = vi.fn();

    render(<GyroCamera orientationRef={orientationRef as any} motionRef={motionRef as any} active moveMode="gyro" sensitivity={1} onPoseChange={onPoseChange} />);

    expect(onPoseChange).toHaveBeenCalled();
  });

  it('does not move in walk mode when acceleration is below threshold', () => {
    const orientationRef = { current: { alpha: 0, beta: 0, gamma: 0 } };
    const motionRef = { current: { x: 0, y: 0, z: 0.05, timestamp: 0 } };

    const onPoseChange = vi.fn();

    render(<GyroCamera orientationRef={orientationRef as any} motionRef={motionRef as any} active moveMode="walk" sensitivity={1} walkSpeed={1} onPoseChange={onPoseChange} />);

    expect(onPoseChange).toHaveBeenCalled();
  });
});
