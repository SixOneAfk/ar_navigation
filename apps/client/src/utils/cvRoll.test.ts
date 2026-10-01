import { describe, expect, it } from 'vitest';
import { calculateRollBiasDeg } from './cvRoll';

describe('calculateRollBiasDeg', () => {
  it('keeps an unbiased sensor unchanged', () => {
    expect(calculateRollBiasDeg(6, -6)).toBe(0);
  });

  it('returns only the sensor bias', () => {
    expect(calculateRollBiasDeg(8, -6)).toBe(2);
  });

  it('supports the opposite roll direction', () => {
    expect(calculateRollBiasDeg(-7, 5)).toBe(-2);
  });
});
