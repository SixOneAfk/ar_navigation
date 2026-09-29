export type EstimatedPose = {
  x: number;
  y: number;
  z: number;
  floor?: number;
};

export type CandidatePose = {
  x: number;
  y: number;
  z: number;
  floor?: number;
};

export type CorrectionMode = 'hard_snap' | 'soft_blend' | 'reject';

export type CorrectionDecision = {
  mode: CorrectionMode;
  accepted: boolean;
  reason: string;
  candidateDistanceMeters: number;
};

const MIN_OCR_CONFIDENCE = 0.45;
const HARD_SNAP_CONFIDENCE = 0.8;
const HARD_SNAP_RADIUS_METERS = 4;
const MAX_CORRECTION_RADIUS_METERS = 9;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Encapsulates CV correction gates so the final position decision is explainable and testable.
 */
export class PositionCorrectionValidator {
  evaluate(params: {
    estimatedPose?: EstimatedPose | null;
    candidatePose: CandidatePose;
    markerConfidence: number;
    headingDeg: number;
  }): CorrectionDecision {
    const { estimatedPose, candidatePose, markerConfidence, headingDeg } =
      params;

    if (
      !isFiniteNumber(markerConfidence) ||
      markerConfidence < MIN_OCR_CONFIDENCE
    ) {
      return {
        mode: 'reject',
        accepted: false,
        reason: 'low_ocr_confidence',
        candidateDistanceMeters: Number.POSITIVE_INFINITY,
      };
    }

    if (!isFiniteNumber(headingDeg) || Math.abs(headingDeg) > 360) {
      return {
        mode: 'reject',
        accepted: false,
        reason: 'invalid_heading',
        candidateDistanceMeters: Number.POSITIVE_INFINITY,
      };
    }

    if (!estimatedPose) {
      return {
        mode:
          markerConfidence >= HARD_SNAP_CONFIDENCE ? 'hard_snap' : 'soft_blend',
        accepted: true,
        reason: 'no_estimate_available',
        candidateDistanceMeters: 0,
      };
    }

    const dx = candidatePose.x - estimatedPose.x;
    const dy = candidatePose.y - estimatedPose.y;
    const dz = candidatePose.z - estimatedPose.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (distance > MAX_CORRECTION_RADIUS_METERS) {
      return {
        mode: 'reject',
        accepted: false,
        reason: 'candidate_too_far',
        candidateDistanceMeters: Number(distance.toFixed(3)),
      };
    }

    if (
      distance <= HARD_SNAP_RADIUS_METERS &&
      markerConfidence >= HARD_SNAP_CONFIDENCE
    ) {
      return {
        mode: 'hard_snap',
        accepted: true,
        reason: 'high_confidence_nearby_marker',
        candidateDistanceMeters: Number(distance.toFixed(3)),
      };
    }

    return {
      mode: 'soft_blend',
      accepted: true,
      reason: 'within_gate_apply_soft_blend',
      candidateDistanceMeters: Number(distance.toFixed(3)),
    };
  }
}
