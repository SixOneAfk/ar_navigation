import { useRef, type PointerEvent as ReactPointerEvent } from 'react';

export type JoystickValue = {
  x: number;
  y: number;
};

/**
 * CHANGE FROM INITIAL MAIN CLONE
 *
 * What changed:
 * - Directional manual buttons were replaced with a pointer-driven analog joystick.
 *
 * Why:
 * - Mobile AR movement needs continuous input, while desktop testing still needs mouse input.
 *
 * Previous behavior:
 * - The initial clone had no joystick or manual movement state.
 *
 * Current behavior:
 * - X is left/right and Y is forward/backward, both in the range -1..1.
 * - A deadzone and radial normalization prevent drift and faster diagonal movement.
 * - Pointer capture keeps touch and mouse dragging active until release/cancel.
 *
 * Impact:
 * - Feeds the existing buttons movement mode; gyro, walk, and off modes are unchanged.
 * - Introduced by joystick functional (eba1e30).
 */

type VirtualJoystickProps = {
  value: JoystickValue;
  onChange: (value: JoystickValue) => void;
  onRelease: () => void;
};

const DEADZONE = 0.08;

function clampInput(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function normalizeInput(x: number, y: number): JoystickValue {
  const length = Math.hypot(x, y);
  if (length <= DEADZONE) {
    return { x: 0, y: 0 };
  }

  const normalizedLength = Math.min(1, (length - DEADZONE) / (1 - DEADZONE));
  return {
    x: clampInput((x / length) * normalizedLength),
    y: clampInput((y / length) * normalizedLength),
  };
}

export function VirtualJoystick({ value, onChange, onRelease }: VirtualJoystickProps) {
  const activePointerId = useRef<number | null>(null);

  const updateFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const radius = Math.min(bounds.width, bounds.height) / 2;
    if (radius <= 0) return;

    const x = (event.clientX - (bounds.left + bounds.width / 2)) / radius;
    const y = -((event.clientY - (bounds.top + bounds.height / 2)) / radius);
    onChange(normalizeInput(x, y));
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointerId.current !== null) return;
    activePointerId.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromPointer(event);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerId === activePointerId.current) {
      updateFromPointer(event);
    }
  };

  const handleRelease = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerId !== activePointerId.current) return;
    activePointerId.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onRelease();
  };

  return (
    <div
      className="virtual-joystick"
      role="slider"
      aria-label="Movement joystick"
      aria-valuemin={-1}
      aria-valuemax={1}
      aria-valuenow={value.y}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handleRelease}
      onPointerCancel={handleRelease}
    >
      <div
        className="virtual-joystick__thumb"
        style={{ transform: `translate(${value.x * 42}px, ${-value.y * 42}px)` }}
      />
    </div>
  );
}
