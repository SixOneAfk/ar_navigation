import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  captureImageJpeg,
  captureJpegFrame,
  CV_FRAME_HEIGHT,
  CV_FRAME_WIDTH,
  sendCvFrame,
} from './cvFrame';

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
      candidate_count: 1,
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'accepted',
          source: 'cv-forwarder',
          receivedAt: '2026-08-16T12:00:00.000Z',
          recalibration,
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
