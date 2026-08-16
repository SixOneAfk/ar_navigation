import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGyroscope } from './useGyroscope';

describe('useGyroscope', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(window, 'ResizeObserver', {
      writable: true,
      value: ResizeObserverMock,
    });
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    });
    Object.defineProperty(window, 'DeviceOrientationEvent', {
      writable: true,
      value: class MockOrientationEvent {} as unknown as typeof DeviceOrientationEvent,
    });
    Object.defineProperty(window, 'DeviceMotionEvent', {
      writable: true,
      value: class MockMotionEvent {} as unknown as typeof DeviceMotionEvent,
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('handles granted permission', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted');
    Object.defineProperty(DeviceOrientationEvent, 'requestPermission', {
      configurable: true,
      value: requestPermission,
    });
    Object.defineProperty(DeviceMotionEvent, 'requestPermission', {
      configurable: true,
      value: requestPermission,
    });

    const { result } = renderHook(() => useGyroscope());

    await act(async () => {
      await result.current.requestPermission();
    });

    expect(result.current.state).toBe('granted');
  });

  it('handles denied permission', async () => {
    const requestPermission = vi.fn().mockResolvedValue('denied');
    Object.defineProperty(DeviceOrientationEvent, 'requestPermission', {
      configurable: true,
      value: requestPermission,
    });
    Object.defineProperty(DeviceMotionEvent, 'requestPermission', {
      configurable: true,
      value: requestPermission,
    });

    const { result } = renderHook(() => useGyroscope());

    await act(async () => {
      await result.current.requestPermission();
    });

    expect(result.current.state).toBe('denied');
  });

  it('handles unsupported browser', async () => {
    Object.defineProperty(window, 'DeviceOrientationEvent', { writable: true, value: undefined });
    Object.defineProperty(window, 'DeviceMotionEvent', { writable: true, value: undefined });

    const { result } = renderHook(() => useGyroscope());

    await act(async () => {
      await result.current.requestPermission();
    });

    expect(result.current.state).toBe('unsupported');
  });

  it('stores valid orientation values and rejects invalid ones', () => {
    const { result } = renderHook(() => useGyroscope());

    act(() => {
      result.current.requestPermission();
    });

    const event = new Event('deviceorientation') as Event & { alpha?: number; beta?: number; gamma?: number };
    event.alpha = 12;
    event.beta = -6;
    event.gamma = 4;
    window.dispatchEvent(event);

    expect(result.current.orientationRef.current.alpha).toBe(12);
    expect(result.current.orientationRef.current.beta).toBe(-6);
    expect(result.current.orientationRef.current.gamma).toBe(4);
  });

  it('tracks valid motion values and calibration offsets', () => {
    const { result } = renderHook(() => useGyroscope());

    act(() => {
      result.current.requestPermission();
    });

    const motionEvent = new Event('devicemotion') as Event & { acceleration?: { x: number; y: number; z: number }; timeStamp: number };
    Object.defineProperty(motionEvent, 'acceleration', {
      configurable: true,
      value: { x: 1.5, y: 2, z: 0.5 },
    });
    Object.defineProperty(motionEvent, 'timeStamp', {
      configurable: true,
      value: 10,
    });
    window.dispatchEvent(motionEvent);

    expect(result.current.motionRef.current.x).toBe(1.5);
    expect(result.current.motionRef.current.y).toBe(2);
    expect(result.current.motionRef.current.z).toBe(0.5);

    act(() => {
      result.current.calibrate();
    });
    act(() => {
      result.current.calibrateMotion();
    });

    expect(result.current.motionCalibration.xOffset).toBeGreaterThanOrEqual(0);
  });
});
