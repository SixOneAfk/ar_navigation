import { describe, expect, it } from 'vitest';
import { getValidDestinations, NAVIGABLE_DESTINATIONS } from './destinations';
import type { NavigationPoint } from './navigationData';

const point = (id: string): NavigationPoint => ({ id, row: 0, column: 0, x: 0, y: 0 });

describe('navigation destinations', () => {
  it('only exposes the curated named destinations, never intermediate Pxxx points', () => {
    expect(NAVIGABLE_DESTINATIONS).toEqual([
      { id: 'Entrance', name: 'Entrance' },
      { id: 'Student_Dep', name: 'Student Department' },
    ]);
  });

  it('filters curated destinations to those actually present in the loaded JSON', () => {
    expect(getValidDestinations([point('Entrance'), point('Student_Dep'), point('P12')])).toEqual([
      { id: 'Entrance', name: 'Entrance' },
      { id: 'Student_Dep', name: 'Student Department' },
    ]);
    expect(getValidDestinations([point('Entrance'), point('P12')])).toEqual([
      { id: 'Entrance', name: 'Entrance' },
    ]);
  });
});