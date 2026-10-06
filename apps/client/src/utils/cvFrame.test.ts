import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cameraIntrinsicsFromHorizontalFov,
  cameraPitchFromDeviceOrientation,
  captureImageJpeg,
  captureJpegFrame,
  CV_FRAME_HEIGHT,
  CV_FRAME_WIDTH,
  sendCvFrame,
  sendStructuralLineFrame,
} from './cvFrame';

describe('cameraPitchFromDeviceOrientation', () => {
  it('measures downward pitch from an upright portrait phone', () => {
    expect(cameraPitchFromDeviceOrientation(90, 0)).toBeCloseTo(0);
    expect(cameraPitchFromDeviceOrientation(60, 0)).toBeCloseTo(30);
    expect(cameraPitchFromDeviceOrientation(45, 0)).toBeCloseTo(45);
  });

  it('does not infer pitch in landscape orientation', () => {
    expect(cameraPitchFromDeviceOrientation(60, 90)).toBeUndefined();
  });
});

describe('captureJpegFrame', () => {
  it('crops the video and creates a 640x480 JPEG', () => {
    const drawImage = vi.fn();
    const video = {
      readyState: 2,
      videoWidth: 1280,
      videoHeight: 720,
    } as HTMLVideoElement;
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
      toDataURL: vi.fn(() => 'data:image/jpeg;base64,frame'),
    } as unknown as HTMLCanvasElement;

    const result = captureJpegFrame(video, canvas);

    expect(result).toBe('data:image/jpeg;base64,frame');
    expect(canvas.width).toBe(CV_FRAME_WIDTH);
    expect(canvas.height).toBe(CV_FRAME_HEIGHT);
    expect(drawImage).toHaveBeenCalledWith(
      video,
      160,
      0,
      960,
      720,
      0,
      0,
      640,
      480,
    );
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.8);
  });

  it('waits until the video has frame data', () => {
    const video = {
      readyState: 1,
      videoWidth: 640,
      videoHeight: 480,
    } as HTMLVideoElement;
    const canvas = {} as HTMLCanvasElement;

    expect(captureJpegFrame(video, canvas)).toBeNull();
  });
});

describe('captureImageJpeg', () => {
  it('crops a portrait image and creates a 640x480 JPEG', () => {
    const drawImage = vi.fn();
    const image = {
      naturalWidth: 800,
      naturalHeight: 800,
    } as HTMLImageElement;
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
      toDataURL: vi.fn(() => 'data:image/jpeg;base64,still-frame'),
    } as unknown as HTMLCanvasElement;

    const result = captureImageJpeg(image, canvas);

    expect(result).toBe('data:image/jpeg;base64,still-frame');
    expect(drawImage).toHaveBeenCalledWith(
      image,
      0,
      100,
      800,
      600,
      0,
      0,
      640,
      480,
    );
  });
});
describe('cameraIntrinsicsFromHorizontalFov', () => {
  it('creates centered intrinsics for the captured frame', () => {
    const intrinsics = cameraIntrinsicsFromHorizontalFov(60);

    expect(intrinsics.fx).toBeCloseTo(554.256, 3);
    expect(intrinsics.fy).toBe(intrinsics.fx);
    expect(intrinsics.cx).toBe(320);
    expect(intrinsics.cy).toBe(240);
  });
});


describe('sendCvFrame', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the canonical JSON payload to the gateway', async () => {
    const recalibration = {
      recalibrated: true,
      detected_text: 'ROOM101',
      confidence: 0.9,
      matched_node_id: 'N101',
      marker_position: { x: 2.4, y: 1.6, z: -1.2, floor: 1 },
      candidate_count: 1,
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'accepted',
          source: 'cv-forwarder',
          receivedAt: '2026-08-16T12:00:00.000Z',
          recalibration,
          markerPosition: { x: 2.4, y: 1.6, z: -1.2, floor: 1 },
          positionEstimate: {
            x: 2.4,
            y: 1.6,
            z: -1.2,
            confidence: 0.95,
            source: 'core-backend.cv-marker-anchor',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const response = await sendCvFrame(
      'data:image/jpeg;base64,frame',
      'phone-session',
    );

    expect(response.recalibration).toEqual(recalibration);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/cv/scan');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(options?.body as string)).toMatchObject({
      session_id: 'phone-session',
      estimated_position: { x: 0, y: 0, floor: 1 },
      image_payload: 'data:image/jpeg;base64,frame',
    });
  });

  it('reports a gateway error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('CV service unavailable', { status: 502 }),
    );

    await expect(sendCvFrame('frame', 'session')).rejects.toThrow(
      'Gateway returned HTTP 502: CV service unavailable',
    );
  });
});

describe('sendStructuralLineFrame', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends roll metadata without OCR position fields', async () => {
    const structuralLines = {
      detected: true,
      floor_boundary: { x1: 0.1, y1: 0.7, x2: 0.9, y2: 0.71 },
      boundary_angle_deg: 0.8,
      boundary_confidence: 0.88,
      camera_roll_deg: -1.2,
      roll_confidence: 0.92,
      candidate_count: 5,
      vertical_candidate_count: 4,
      image_width: 640,
      image_height: 480,
      processing_time_ms: 3.1,
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'accepted',
          source: 'cv-structural-lines',
          receivedAt: '2026-10-01T12:00:00.000Z',
          frameId: 'structural-7',
          sequenceNumber: 7,
          structuralLines,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const response = await sendStructuralLineFrame(
      'data:image/jpeg;base64,frame',
      'phone-session',
      7,
      {
        deviceRollDeg: 2.5,
        devicePitchDeg: 35,
        estimatedPosition: { x: 1, y: 1.6, z: 2 },
        wallReference: {
          id: 'wall-0001',
          corners: [
            { x: -2, y: 3, z: -5 },
            { x: 2, y: 3, z: -5 },
            { x: 2, y: 0, z: -5 },
            { x: -2, y: 0, z: -5 },
          ],
        },
        referenceConfidence: 0.82,
        horizontalFovDeg: 60,
        intrinsicsConfidence: 0.4,
      },
    );

    expect(response.structuralLines).toEqual(structuralLines);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/cv/structural-lines');
    const body = JSON.parse(options?.body as string);
    expect(body).toMatchObject({
      session_id: 'phone-session',
      image_payload: 'data:image/jpeg;base64,frame',
      device_roll_deg: 2.5,
      device_pitch_deg: 35,
      estimated_position: { x: 1, y: 1.6, z: 2 },
      wall_reference: { id: 'wall-0001' },
      reference_confidence: 0.82,
      intrinsics_confidence: 0.4,
      frame_id: 'structural-7',
      sequence_number: 7,
    });
    expect(body.camera_intrinsics.fx).toBeCloseTo(554.256, 3);
  });
});
