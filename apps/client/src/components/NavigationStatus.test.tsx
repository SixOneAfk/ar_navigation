// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NavigationStatus } from './NavigationStatus';

describe('NavigationStatus', () => {
  it('offers every named destination and navigates when only a nearest node is available', () => {
    const onNavigate = vi.fn();
    render(
      <NavigationStatus
        buildingName="Test"
        currentPointId={null}
        routingPointId="B"
        debugSnapshot={null}
        debugEnabled={false}
        loadError={null}
        alignmentWarning={null}
        availableDestinations={[
          { id: 'B', name: 'Library' },
          { id: 'C', name: 'Cafeteria' },
        ]}
        onNavigate={onNavigate}
      />,
    );

    expect(screen.getByRole('option', { name: 'Library' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Cafeteria' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'C' } });
    fireEvent.click(screen.getByRole('button', { name: 'Navigate' }));
    expect(onNavigate).toHaveBeenCalledWith('C');
  });
});
