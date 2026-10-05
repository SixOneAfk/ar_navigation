import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompassWidget } from './CompassWidget';

describe('CompassWidget', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('collapses and restores the heading overlay', () => {
    render(
      <CompassWidget
        headingRef={{
          current: {
            rawGyroHeadingDeg: 12,
            rawCompassHeadingDeg: 14,
            fusedHeadingDeg: 13,
            hasCompass: true,
            confidence: 0.8,
            timestamp: 1,
          },
        }}
        orientationRef={{ current: { alpha: 0, beta: 0, gamma: 0 } }}
        enabled
        horizonOffsetDeg={0}
        onCalibrateHorizon={vi.fn()}
        onResetHorizon={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Heading' })).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: 'Hide heading overlay' }),
    );

    expect(screen.queryByRole('heading', { name: 'Heading' })).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Show heading overlay' }),
    );

    expect(screen.getByRole('heading', { name: 'Heading' })).toBeTruthy();
  });
});
