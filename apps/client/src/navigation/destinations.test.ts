import { describe, expect, it } from 'vitest';
import { NAVIGABLE_DESTINATIONS, getValidDestinations } from './destinations';
import type { NavigationPoint } from './navigationData';

const point = (id: string): NavigationPoint => ({ id, row: 0, column: 0, x: 0, y: 0 });

describe('named navigation destinations', () => {
  it('contains named destinations rather than internal graph points', () => {
    expect(NAVIGABLE_DESTINATIONS.map((destination) => destination.id)).toEqual(['Entrance', 'Student_apartment']);
    expect(NAVIGABLE_DESTINATIONS.every((destination) => !/^P\d+$/.test(destination.id))).toBe(true);
  });

  it('filters configured IDs that are absent from the loaded JSON', () => {
    expect(getValidDestinations([point('Entrance'), point('P1')])).toEqual([
      { id: 'Entrance', name: 'Entrance' },
    ]);
  });
});