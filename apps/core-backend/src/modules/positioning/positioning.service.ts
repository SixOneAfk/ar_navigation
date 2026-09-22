import { Injectable } from '@nestjs/common';
import {
  PositionCorrectionValidator,
  type EstimatedPose,
} from './position-correction.validator';

type BeaconRssi = {
  bssid: string;
  rssi: number;
};

type CvMarker = {
  markerId: string;
  confidence: number;
  x?: number;
  y?: number;
  z?: number;
  floor?: number;
};

type EstimatePositionRequest = {
  deviceId: string;
  stepCount: number;
  headingDeg: number;
  wifi: BeaconRssi[];
  cvMarkers: CvMarker[];
  timestamp: string;
  estimatedPose?: EstimatedPose;
  poseConfidence?: number;
  frameId?: string;
  sequenceNumber?: number;
  velocityHintMps?: number;
  devicePitchDeg?: number;
  deviceRollDeg?: number;
};

type EstimatePositionResponse = {
  x: number;
  y: number;
  z: number;
  confidence: number;
  source: string;
  correctionMode?: string;
  correctionApplied?: boolean;
  decisionReason?: string;
  candidateDistanceM?: number;
};

@Injectable()
export class PositioningService {
  private readonly correctionValidator = new PositionCorrectionValidator();

  constructor() {
    console.log('[CORE-BACKEND:PositioningService] Initialized');
  }

  fuseSensors() {
    console.log('[CORE-BACKEND:PositioningService] fuseSensors() called');
    // Placeholder for sensor fusion of PDR, Wi-Fi and CV inputs.
    return { status: 'todo', module: 'positioning' };
  }

  estimatePosition(payload: EstimatePositionRequest): EstimatePositionResponse {
    console.log('[CORE-BACKEND:PositioningService] estimatePosition() called with:', {
      deviceId: payload.deviceId,
      stepCount: payload.stepCount,
      headingDeg: payload.headingDeg,
      wifiBeaconsCount: payload.wifi?.length ?? 0,
      cvMarkersCount: payload.cvMarkers?.length ?? 0,
      timestamp: payload.timestamp,
    });

    try {
      // Validate input
      if (!payload.deviceId) {
        throw new Error('deviceId is required');
      }
      if (typeof payload.stepCount !== 'number') {
        throw new Error('stepCount must be a number');
      }
      if (typeof payload.headingDeg !== 'number') {
        throw new Error('headingDeg must be a number');
      }

      console.log('[CORE-BACKEND:PositioningService] Input validation passed');

      const anchoredMarker = payload.cvMarkers?.find(
        (marker) =>
          Number.isFinite(marker.x) &&
          Number.isFinite(marker.y) &&
          Number.isFinite(marker.z),
      );

      if (anchoredMarker) {
        const correctionDecision = this.correctionValidator.evaluate({
          estimatedPose: payload.estimatedPose,
          candidatePose: {
            x: anchoredMarker.x as number,
            y: anchoredMarker.y as number,
            z: anchoredMarker.z as number,
            floor: anchoredMarker.floor,
          },
          markerConfidence: anchoredMarker.confidence,
          headingDeg: payload.headingDeg,
        });

        if (!correctionDecision.accepted) {
          console.warn('[CORE-BACKEND:PositioningService] Rejected CV correction candidate:', {
            markerId: anchoredMarker.markerId,
            reason: correctionDecision.reason,
            candidateDistanceM: correctionDecision.candidateDistanceMeters,
            frameId: payload.frameId,
            sequenceNumber: payload.sequenceNumber,
          });
        }

        const fallbackPose = payload.estimatedPose ?? { x: 0, y: 0, z: 0 };
        const selectedPose = correctionDecision.accepted
          ? {
              x: anchoredMarker.x as number,
              y: anchoredMarker.y as number,
              z: anchoredMarker.z as number,
            }
          : fallbackPose;

        const resolvedConfidence = correctionDecision.accepted
          ? Math.max(anchoredMarker.confidence, 0.9)
          : Math.max(payload.poseConfidence ?? 0.35, 0.2);

        const anchoredResult = {
          x: Number(selectedPose.x.toFixed(3)),
          y: Number(selectedPose.y.toFixed(3)),
          z: Number(selectedPose.z.toFixed(3)),
          confidence: Number(resolvedConfidence.toFixed(3)),
          source: correctionDecision.accepted
            ? correctionDecision.mode === 'hard_snap'
              ? 'core-backend.cv-marker-hard-snap'
              : 'core-backend.cv-marker-soft-blend'
            : 'core-backend.cv-marker-rejected',
          correctionMode: correctionDecision.mode,
          correctionApplied: correctionDecision.accepted,
          decisionReason: correctionDecision.reason,
          candidateDistanceM: correctionDecision.candidateDistanceMeters,
        };

        console.log('[CORE-BACKEND:PositioningService] Using CV marker anchor for position:', {
          markerId: anchoredMarker.markerId,
          floor: anchoredMarker.floor,
          ...anchoredResult,
        });

        return anchoredResult;
      }

      const headingRad = (payload.headingDeg * Math.PI) / 180;
      console.log('[CORE-BACKEND:PositioningService] Converted heading:', {
        headingDeg: payload.headingDeg,
        headingRad: headingRad,
      });

      const distance = Math.max(payload.stepCount, 0) * 0.7;
      console.log('[CORE-BACKEND:PositioningService] Calculated distance:', {
        stepCount: payload.stepCount,
        stepsToMeters: 0.7,
        totalDistance: distance,
      });

      const result = {
        x: Number((Math.cos(headingRad) * distance).toFixed(3)),
        y: 0,
        z: Number((Math.sin(headingRad) * distance).toFixed(3)),
        confidence: 0.45,
        source: 'core-backend.stub.positioning',
        correctionMode: 'reject',
        correctionApplied: false,
        decisionReason: 'no_cv_marker_anchor',
        candidateDistanceM: Number.POSITIVE_INFINITY,
      };

      console.log('[CORE-BACKEND:PositioningService] ✓ Position estimate calculated:', {
        x: result.x,
        y: result.y,
        z: result.z,
        confidence: result.confidence,
        source: result.source,
      });

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : '';
      console.error('[CORE-BACKEND:PositioningService] ✗ CRITICAL: Error in estimatePosition:', {
        errorMessage: errorMsg,
        errorStack: errorStack,
        deviceId: payload.deviceId,
        timestamp: payload.timestamp,
        processedAt: new Date().toISOString(),
      });
      throw error;
    }
  }
}
