import { describe, expect, it } from 'vitest';
import { getValidDestinations } from './destinations';
import type { NavigationPoint } from './navigationData';

const point = (id: string): NavigationPoint => ({ id, row: 0, column: 0, x: 0, y: 0 });

describe('navigation destinations', () => {
  it('exposes only configured locations and formats their readable labels', () => {
    expect(getValidDestinations(
      [point('x5y52'), point('x31y35'), point('x6y52')],
      {
        Entrance: 'x5y52',
        Student_Dep: 'x31y35',
      },
    )).toEqual([
      { id: 'x5y52', name: 'Entrance' },
      { id: 'x31y35', name: 'Student Department' },
    ]);
  });

  it('allows future locations to be configured without exposing unmapped graph points', () => {
    expect(getValidDestinations(
      [point('x20y40'), point('x21y40')],
      { Library: 'x20y40' },
    )).toEqual([{ id: 'x20y40', name: 'Library' }]);
  });
});