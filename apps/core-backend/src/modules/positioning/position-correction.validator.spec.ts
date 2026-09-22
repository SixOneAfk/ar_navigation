import { PositionCorrectionValidator } from './position-correction.validator';

describe('PositionCorrectionValidator', () => {
  const validator = new PositionCorrectionValidator();

  it('rejects low-confidence marker candidates', () => {
    const decision = validator.evaluate({
      estimatedPose: { x: 0, y: 0, z: 0 },
      candidatePose: { x: 1, y: 0, z: 1 },
      markerConfidence: 0.2,
      headingDeg: 10,
    });

    expect(decision.accepted).toBe(false);
    expect(decision.mode).toBe('reject');
    expect(decision.reason).toBe('low_ocr_confidence');
  });

  it('hard-snaps a nearby high-confidence marker', () => {
    const decision = validator.evaluate({
      estimatedPose: { x: 2, y: 1.6, z: 2 },
      candidatePose: { x: 3, y: 1.6, z: 3 },
      markerConfidence: 0.95,
      headingDeg: 35,
    });

    expect(decision.accepted).toBe(true);
    expect(decision.mode).toBe('hard_snap');
    expect(decision.reason).toBe('high_confidence_nearby_marker');
  });

  it('uses soft-blend for acceptable but not hard-snap candidates', () => {
    const decision = validator.evaluate({
      estimatedPose: { x: 0, y: 0, z: 0 },
      candidatePose: { x: 5, y: 0, z: 2 },
      markerConfidence: 0.62,
      headingDeg: 90,
    });

    expect(decision.accepted).toBe(true);
    expect(decision.mode).toBe('soft_blend');
    expect(decision.reason).toBe('within_gate_apply_soft_blend');
  });

  it('rejects marker candidate outside maximum gate radius', () => {
    const decision = validator.evaluate({
      estimatedPose: { x: 0, y: 0, z: 0 },
      candidatePose: { x: 12, y: 0, z: 0 },
      markerConfidence: 0.98,
      headingDeg: 180,
    });

    expect(decision.accepted).toBe(false);
    expect(decision.mode).toBe('reject');
    expect(decision.reason).toBe('candidate_too_far');
  });
});
