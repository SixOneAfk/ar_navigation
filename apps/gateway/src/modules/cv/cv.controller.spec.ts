import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { CvController } from './cv.controller';
import { CvScanDto } from './dto/cv-scan.dto';
import { PositioningGrpcClient } from '../position/grpc/positioning-grpc.client';

describe('CvController', () => {
  let controller: CvController;
  let positioningGrpcClient: Pick<PositioningGrpcClient, 'estimatePosition'>;

  beforeEach(() => {
    positioningGrpcClient = {
      estimatePosition: jest.fn().mockResolvedValue({
        x: 2.4,
        y: 1.6,
        z: -1.2,
        confidence: 0.95,
        source: 'core-backend.cv-marker-anchor',
        correctionMode: 'hard_snap',
        correctionApplied: true,
        decisionReason: 'high_confidence_nearby_marker',
        candidateDistanceM: 1.4,
      }),
    };
    controller = new CvController(
      positioningGrpcClient as PositioningGrpcClient,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('forwards a frame and returns only the CV result metadata', async () => {
    const recalibration = {
      recalibrated: true,
      detected_text: 'ROOM101',
      confidence: 0.91,
      matched_node_id: 'N101',
      marker_position: { x: 2.4, y: 1.6, z: -1.2, floor: 1 },
      candidate_count: 1,
    };
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(recalibration), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const dto: CvScanDto = {
      session_id: 'phone-session',
      timestamp: 123,
      estimated_position: { x: 1, y: 2, z: 0.5, floor: 1 },
      image_payload: 'data:image/jpeg;base64,abc',
      frame_id: 'frame-42',
      sequence_number: 42,
      pose_confidence: 0.67,
    };

    const result = await controller.scan(dto);

    expect(result).toEqual(
      expect.objectContaining({
        status: 'accepted',
        source: 'cv-forwarder',
        frameId: 'frame-42',
        sequenceNumber: 42,
        recalibration,
        markerPosition: recalibration.marker_position,
        correctionDecision: {
          mode: 'hard_snap',
          applied: true,
          reason: 'high_confidence_nearby_marker',
          candidateDistanceM: 1.4,
        },
      }),
    );
    expect(positioningGrpcClient.estimatePosition).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: 'phone-session',
        frameId: 'frame-42',
        sequenceNumber: 42,
        poseConfidence: 0.67,
        estimatedPose: { x: 1, y: 2, z: 0.5, floor: 1 },
        cvMarkers: [
          expect.objectContaining({
            markerId: 'N101',
            x: 2.4,
            y: 1.6,
            z: -1.2,
            floor: 1,
          }),
        ],
      }),
    );
    expect(result).not.toHaveProperty('payload');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    expect(
      JSON.parse(fetchMock.mock.calls[0][1]?.body as string),
    ).toMatchObject({
      session_id: 'phone-session',
      timestamp: 123,
      image_payload: 'data:image/jpeg;base64,abc',
    });
  });

  it('forwards structural frames without calling positioning', async () => {
    const structuralLines = {
      detected: true,
      floor_boundary: { x1: 0.1, y1: 0.7, x2: 0.9, y2: 0.72 },
      boundary_angle_deg: 1.4,
      boundary_confidence: 0.86,
      camera_roll_deg: -0.8,
      roll_confidence: 0.91,
      candidate_count: 6,
      vertical_candidate_count: 4,
      image_width: 640,
      image_height: 480,
      processing_time_ms: 3.2,
    };
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(structuralLines), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await controller.structuralLines({
      session_id: 'phone-session',
      timestamp: 123,
      image_payload: 'data:image/jpeg;base64,abc',
      device_roll_deg: 2.5,
      device_pitch_deg: 18.0,
      estimated_position: { x: 1, y: 1.6, z: 2 },
      camera_intrinsics: {
        fx: 554.256,
        fy: 554.256,
        cx: 320,
        cy: 240,
        distortion: [0, 0, 0, 0, 0],
      },
      wall_reference: {
        id: 'wall-0001',
        corners: [
          { x: -2, y: 3, z: -5 },
          { x: 2, y: 3, z: -5 },
          { x: 2, y: 0, z: -5 },
          { x: -2, y: 0, z: -5 },
        ],
      },
      reference_confidence: 0.82,
      intrinsics_confidence: 0.35,
      frame_id: 'structural-7',
      sequence_number: 7,
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'accepted',
        source: 'cv-structural-lines',
        frameId: 'structural-7',
        sequenceNumber: 7,
        structuralLines,
      }),
    );
    expect(positioningGrpcClient.estimatePosition).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:8000/api/v1/structural-lines',
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      session_id: 'phone-session',
      timestamp: 123,
      image_payload: 'data:image/jpeg;base64,abc',
      device_roll_deg: 2.5,
      device_pitch_deg: 18.0,
      estimated_position: { x: 1, y: 1.6, z: 2 },
      camera_intrinsics: {
        fx: 554.256,
        fy: 554.256,
        cx: 320,
        cy: 240,
        distortion: [0, 0, 0, 0, 0],
      },
      wall_reference: {
        id: 'wall-0001',
        corners: [
          { x: -2, y: 3, z: -5 },
          { x: 2, y: 3, z: -5 },
          { x: 2, y: 0, z: -5 },
          { x: -2, y: 0, z: -5 },
        ],
      },
      reference_confidence: 0.82,
      intrinsics_confidence: 0.35,
    });
  });

  it('rejects a request without an image', async () => {
    await expect(controller.scan({})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('returns bad gateway when the CV service is unavailable', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('connection refused'));

    await expect(
      controller.scan({ image_payload: 'data:image/jpeg;base64,abc' }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
