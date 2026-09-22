import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { VirtualJoystick } from './VirtualJoystick';

describe('VirtualJoystick', () => {
  it('normalizes diagonal input and resets on release', () => {
    const onChange = vi.fn();
    const onRelease = vi.fn();
    render(<VirtualJoystick value={{ x: 0, y: 0 }} onChange={onChange} onRelease={onRelease} />);
    const joystick = screen.getByRole('slider', { name: 'Movement joystick' });

    Object.defineProperty(joystick, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    });
    Object.defineProperty(joystick, 'setPointerCapture', { configurable: true, value: vi.fn() });
    Object.defineProperty(joystick, 'hasPointerCapture', { configurable: true, value: () => true });
    Object.defineProperty(joystick, 'releasePointerCapture', { configurable: true, value: vi.fn() });

    fireEvent.pointerDown(joystick, { pointerId: 1, clientX: 100, clientY: 0 });
    const value = onChange.mock.calls[0][0] as { x: number; y: number };
    expect(Math.hypot(value.x, value.y)).toBeCloseTo(1);
    expect(value.x).toBeGreaterThan(0);
    expect(value.y).toBeGreaterThan(0);

    fireEvent.pointerUp(joystick, { pointerId: 1 });
    expect(onRelease).toHaveBeenCalledOnce();
  });
});