import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { HeadingData, Orientation } from '../hooks/useGyroscope';
import { CompassWidget } from './CompassWidget';

const heading: HeadingData = {
  rawGyroHeadingDeg: 271,
  rawCompassHeadingDeg: 93,
  fusedHeadingDeg: 271,
  hasCompass: true,
  confidence: 1,
  timestamp: 1,
  rawAlphaDeg: 271,
  rawBetaDeg: -2,
  rawGammaDeg: 4,
  webkitCompassHeadingDeg: 93,
  webkitCompassAccuracyDeg: 6,
  orientationAbsolute: true,
  screenOrientationAngleDeg: 90,
  screenOrientationType: 'landscape-primary',
  deviceHeadingSource: 'webkitCompassHeading',
};
const orientation: Orientation = { alpha: 271, beta: -2, gamma: 4 };

const headingRef = { current: heading } as React.RefObject<HeadingData>;
const orientationRef = { current: orientation } as React.RefObject<Orientation>;

describe('CompassWidget sensor diagnostics', () => {
  it('shows raw device data separately from map bearing and the gyro-driven needle', async () => {
    render(
      <CompassWidget
        headingRef={headingRef}
        orientationRef={orientationRef}
        enabled
        currentPointId="Entrance"
        activeRoute={{
          start: 'Entrance',
          destination: 'Student_Dep',
          points: ['Entrance', 'P1', 'Student_Dep'],
          distanceMeters: 2,
          directions: [
            { from: 'Entrance', to: 'P1', distanceMeters: 1, direction: 'RIGHT' },
            { from: 'P1', to: 'Student_Dep', distanceMeters: 1, direction: 'FORWARD' },
          ],
          instructions: [],
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show sensor diagnostics' }));

    await waitFor(() => expect(screen.getByText('Raw alpha: 271.0 deg')).toBeTruthy());
    expect(screen.getByText('Raw beta: -2.0 deg')).toBeTruthy();
    expect(screen.getByText('Raw gamma: 4.0 deg')).toBeTruthy();
    expect(screen.getByText('webkitCompassHeading: 93.0 deg')).toBeTruthy();
    expect(screen.getByText('webkitCompassAccuracy: 6.0 deg')).toBeTruthy();
    expect(screen.getByText('Event absolute: true')).toBeTruthy();
    expect(screen.getByText('Screen orientation: landscape-primary (90 deg)')).toBeTruthy();
    expect(screen.getByText('Calculated device heading: 93.0 deg (webkitCompassHeading)')).toBeTruthy();
    expect(screen.getByText('Calculated map bearing: 90 deg')).toBeTruthy();
    expect(screen.getByText('Compass correction/offset: none applied')).toBeTruthy();
    expect(screen.getByText('Reference: WebKit compass is magnetic; absolute alpha is browser/OS reference. No true-north declination is applied.')).toBeTruthy();
    expect(screen.getByText('Compass needle source: gyro alpha / fusedHeadingDeg (271.0 deg)')).toBeTruthy();
  });
});
