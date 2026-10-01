import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Post,
} from '@nestjs/common';
import { CvScanDto } from './dto/cv-scan.dto';
import { CvStructuralLinesDto } from './dto/cv-structural-lines.dto';
import { PositioningGrpcClient } from '../position/grpc/positioning-grpc.client';

type MarkerPosition = {
  x: number;
  y: number;
  z: number;
  floor: number;
};

type RecalibrationResult = {
  recalibrated: boolean;
  detected_text: string | null;
  confidence: number;
  matched_node_id: string | null;
  marker_position: MarkerPosition | null;
  candidate_count: number;
  ocr_candidates?: Array<{ text: string; confidence: number }>;
  failure_reason?: string | null;
  cv_horizon_roll_deg?: number | null;
  cv_horizon_confidence?: number;
};

type StructuralLinesResult = {
  detected: boolean;
  floor_boundary: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null;
  boundary_angle_deg: number | null;
  boundary_confidence: number;
  camera_roll_deg: number | null;
  roll_confidence: number;
  candidate_count: number;
  vertical_candidate_count: number;
  image_width: number;
  image_height: number;
  processing_time_ms: number;
};

type CorrectionDecision = {
  mode: 'hard_snap' | 'soft_blend' | 'reject';
  applied: boolean;
  reason: string;
  candidateDistanceM: number;
};

@Controller('api/v1/cv')
export class CvController {
  private readonly cvServiceBaseUrl =
    process.env.CV_SERVICE_URL ?? 'http://localhost:8000';
  private readonly latestSequenceBySession = new Map<string, number>();

  constructor(private readonly positioningGrpcClient: PositioningGrpcClient) {
    console.log('[GATEWAY:CvController] Initialized');
  }

  @Post('structural-lines')
  async structuralLines(@Body() dto: CvStructuralLinesDto) {
    const imagePayload = dto.image_payload ?? dto.frameBase64;
    if (!imagePayload) {
      throw new BadRequestException('image_payload or frameBase64 is required');
    }

    const frameId = dto.frameId ?? dto.frame_id ?? `frame-${Date.now()}`;
    const sequenceNumber = dto.sequence_number ?? 0;
    const normalized = {
      session_id: dto.session_id ?? dto.deviceId ?? 'unknown-session',
      timestamp: dto.timestamp ?? Date.now(),
      image_payload: imagePayload,
      device_roll_deg: dto.device_roll_deg,
    };

    try {
      const response = await fetch(
        `${this.cvServiceBaseUrl}/api/v1/structural-lines`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(normalized),
        },
      );

      if (!response.ok) {
        const responseText = await response.text();
        throw new BadGatewayException(
          `CV service returned HTTP ${response.status}: ${responseText.slice(0, 300)}`,
        );
      }

      const structuralLines = (await response.json()) as StructuralLinesResult;
      return {
        status: 'accepted',
        source: 'cv-structural-lines',
        receivedAt: new Date().toISOString(),
        frameId,
        sequenceNumber,
        structuralLines,
      };
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }
      throw new BadGatewayException('CV service is unavailable');
    }
  }

  @Post('scan')
  async scan(@Body() dto: CvScanDto) {
    const frameId = dto.frameId ?? dto.frame_id ?? `frame-${Date.now()}`;
    const sequenceNumber = dto.sequence_number ?? 0;
    const normalized = {
      session_id: dto.session_id ?? dto.deviceId ?? 'unknown-session',
      timestamp: dto.timestamp ?? Date.now(),
      estimated_position: dto.estimated_position ?? {
        x: 0,
        y: 0,
        z: 0,
        floor: 1,
      },
      image_payload: dto.image_payload ?? dto.frameBase64,
      device_heading: dto.device_heading,
      pose_confidence: dto.pose_confidence,
      velocity_hint_mps: dto.velocity_hint_mps,
      device_pitch_deg: dto.device_pitch_deg,
      device_roll_deg: dto.device_roll_deg,
      frame_id: frameId,
      sequence_number: sequenceNumber,
    };

    const lastKnownSequence = this.latestSequenceBySession.get(
      normalized.session_id,
    );
    if (
      sequenceNumber > 0 &&
      lastKnownSequence !== undefined &&
      sequenceNumber <= lastKnownSequence
    ) {
      return {
        status: 'accepted',
        source: 'cv-forwarder',
        receivedAt: new Date().toISOString(),
        frameId,
        sequenceNumber,
        recalibration: {
          recalibrated: false,
          detected_text: null,
          confidence: 0,
          matched_node_id: null,
          marker_position: null,
          candidate_count: 0,
          failure_reason: 'stale_frame_rejected',
        },
        markerPosition: null,
        positionEstimate: null,
        correctionDecision: {
          mode: 'reject' as const,
          applied: false,
          reason: 'stale_frame',
          candidateDistanceM: Number.POSITIVE_INFINITY,
        },
      };
    }

    if (!normalized.image_payload) {
      throw new BadRequestException('image_payload or frameBase64 is required');
    }

    console.log(
      `[GATEWAY:CvController] Forwarding CV frame for session ${normalized.session_id} (${normalized.image_payload.length} base64 characters)`,
    );

    try {
      const endpoint = `${this.cvServiceBaseUrl}/api/v1/recalibrate`;
      const cvResponse = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalized),
      });

      if (!cvResponse.ok) {
        const responseText = await cvResponse.text();
        throw new BadGatewayException(
          `CV service returned HTTP ${cvResponse.status}: ${responseText.slice(0, 300)}`,
        );
      }

      const recalibration = (await cvResponse.json()) as RecalibrationResult;
      let positionEstimate: {
        x: number;
        y: number;
        z: number;
        confidence: number;
        source: string;
        correctionMode?: string;
        correctionApplied?: boolean;
        decisionReason?: string;
        candidateDistanceM?: number;
      } | null = null;

      if (
        recalibration.recalibrated &&
        recalibration.matched_node_id &&
        recalibration.marker_position
      ) {
        try {
          positionEstimate = await this.positioningGrpcClient.estimatePosition({
            deviceId: normalized.session_id,
            stepCount: 0,
            headingDeg: normalized.device_heading ?? 0,
            wifi: [],
            cvMarkers: [
              {
                markerId: recalibration.matched_node_id,
                confidence: recalibration.confidence,
                x: recalibration.marker_position.x,
                y: recalibration.marker_position.y,
                z: recalibration.marker_position.z,
                floor: recalibration.marker_position.floor,
              },
            ],
            timestamp: String(normalized.timestamp),
            estimatedPose: {
              x: normalized.estimated_position.x,
              y: normalized.estimated_position.y,
              z: normalized.estimated_position.z ?? 0,
              floor: normalized.estimated_position.floor,
            },
            poseConfidence: normalized.pose_confidence,
            frameId,
            sequenceNumber,
            velocityHintMps: normalized.velocity_hint_mps,
            devicePitchDeg: normalized.device_pitch_deg,
            deviceRollDeg: normalized.device_roll_deg,
          });
        } catch (positionError) {
          console.warn(
            '[GATEWAY:CvController] Failed to forward marker position to core backend:',
            positionError,
          );
        }
      }

      const correctionDecision: CorrectionDecision = {
        mode:
          (positionEstimate?.correctionMode as CorrectionDecision['mode']) ??
          (recalibration.recalibrated ? 'soft_blend' : 'reject'),
        applied:
          positionEstimate?.correctionApplied ??
          Boolean(recalibration.recalibrated),
        reason:
          positionEstimate?.decisionReason ??
          (recalibration.recalibrated
            ? 'cv_recalibrated_marker_observed'
            : 'no_marker_match'),
        candidateDistanceM:
          positionEstimate?.candidateDistanceM ??
          (recalibration.recalibrated ? 0 : Number.POSITIVE_INFINITY),
      };

      const result = {
        status: 'accepted',
        source: 'cv-forwarder',
        receivedAt: new Date().toISOString(),
        frameId,
        sequenceNumber,
        recalibration,
        markerPosition: recalibration.marker_position,
        positionEstimate,
        correctionDecision,
      };
      if (sequenceNumber > 0) {
        this.latestSequenceBySession.set(normalized.session_id, sequenceNumber);
      }
      console.log(
        `[GATEWAY:CvController] CV frame processed for session ${normalized.session_id}; recalibrated=${recalibration.recalibrated}`,
      );
      return result;
    } catch (error) {
      console.error('[GATEWAY:CvController] ✗ Error in POST /scan:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      if (error instanceof BadGatewayException) {
        throw error;
      }
      throw new BadGatewayException('CV service is unavailable');
    }
  }
}
