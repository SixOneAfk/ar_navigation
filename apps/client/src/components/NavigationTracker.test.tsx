import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { NavigationTracker } from './NavigationTracker';

const camera = new THREE.PerspectiveCamera();
let frameCallback: ((state: unknown, delta: number) => void) | null = null;

vi.mock('@react-three/fiber', () => ({
  useThree: () => ({ camera }),
  useFrame: (callback: (state: unknown, delta: number) => void) => {
    frameCallback = callback;
  },
}));

describe('NavigationTracker', () => {
  beforeEach(() => {
    camera.position.set(0, 1.6, 3.5);
    frameCallback = null;
  });

  it('sets the Entrance position once and samples the camera on a fixed interval', () => {
    const onPlayerPosition = vi.fn();
    const initialPosition = new THREE.Vector3(4, 1.6, 8);
    const points = [{ id: 'entry', position: initialPosition.clone() }];
    const view = render(
      <NavigationTracker
        initialPosition={initialPosition}
        points={points}
        onPlayerPosition={onPlayerPosition}
      />,
    );

    expect(camera.position.toArray()).toEqual([4, 1.6, 8]);
    camera.position.set(5, 1.6, 9);
    view.rerender(
      <NavigationTracker
        initialPosition={new THREE.Vector3(20, 1.6, 20)}
        points={points}
        onPlayerPosition={onPlayerPosition}
      />,
    );
    expect(camera.position.toArray()).toEqual([5, 1.6, 9]);

    act(() => frameCallback?.({}, 0.1));
    expect(onPlayerPosition).toHaveBeenCalledOnce();
    expect(onPlayerPosition).toHaveBeenCalledWith(camera.position);
  });
});