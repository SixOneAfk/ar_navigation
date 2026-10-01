import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CameraPermissionPanel } from './CameraPermissionPanel';

class MockImage {
  naturalWidth = 640;
  naturalHeight = 480;
  onload: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  set src(_value: string) {
    queueMicrotask(() => this.onload?.(new Event('load')));
  }
}

describe('CameraPermissionPanel', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      lineTo: vi.fn(),
      moveTo: vi.fn(),
      beginPath: vi.fn(),
      restore: vi.fn(),
      save: vi.fn(),
      setTransform: vi.fn(),
      stroke: vi.fn(),
      set fillStyle(_value: string) {},
      set font(_value: string) {},
      set globalAlpha(_value: number) {},
      set lineCap(_value: CanvasLineCap) {},
      set lineWidth(_value: number) {},
      set shadowBlur(_value: number) {},
      set shadowColor(_value: string) {},
      set strokeStyle(_value: string) {},
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('explains when no camera device is available', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi
          .fn()
          .mockRejectedValue(
            new DOMException('Device missing', 'NotFoundError'),
          ),
      },
    });

    render(<CameraPermissionPanel isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enable Camera' }));

    expect(
      await screen.findByText(
        'No camera device is available. Use an uploaded or demo image instead.',
      ),
    ).toBeTruthy();
  });

  it('uses the lightweight structural endpoint for live camera frames', async () => {
    const stopTrack = vi.fn();
    const stream = {
      getTracks: () => [{ stop: stopTrack }],
    } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(stream),
      },
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/jpeg;base64,live-frame',
    );
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'accepted',
          source: 'cv-structural-lines',
          receivedAt: '2026-10-01T12:00:00.000Z',
          frameId: 'structural-1',
          sequenceNumber: 1,
          structuralLines: {
            detected: true,
            floor_boundary: {
              x1: 0.1,
              y1: 0.68,
              x2: 0.9,
              y2: 0.7,
            },
            boundary_angle_deg: 1.4,
            boundary_confidence: 0.88,
            camera_roll_deg: -0.7,
            roll_confidence: 0.91,
            candidate_count: 6,
            vertical_candidate_count: 4,
            image_width: 640,
            image_height: 480,
            processing_time_ms: 3.2,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    render(<CameraPermissionPanel isOpen onClose={vi.fn()} />);
    const video = document.querySelector('video');
    if (!video) throw new Error('Camera video element is missing');
    Object.defineProperties(video, {
      readyState: { configurable: true, value: 2 },
      videoWidth: { configurable: true, value: 1280 },
      videoHeight: { configurable: true, value: 720 },
      srcObject: { configurable: true, writable: true, value: null },
    });
    vi.spyOn(video, 'play').mockResolvedValue();

    fireEvent.click(screen.getByRole('button', { name: 'Enable Camera' }));

    expect(
      await screen.findByText('Floor boundary detected (88%).'),
    ).toBeTruthy();
    expect(screen.getByText('3.2 ms')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalled();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/cv/structural-lines');
    expect(JSON.parse(options?.body as string)).toMatchObject({
      image_payload: 'data:image/jpeg;base64,live-frame',
      sequence_number: 1,
    });
  });

  it('processes the built-in image through the gateway', async () => {
    vi.stubGlobal('Image', MockImage);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/jpeg;base64,demo-frame',
    );
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'accepted',
          source: 'cv-forwarder',
          receivedAt: '2026-08-16T12:00:00.000Z',
          recalibration: {
            recalibrated: true,
            detected_text: 'ROOM101',
            confidence: 0.98,
            matched_node_id: 'N101',
            marker_position: { x: 2.4, y: 1.6, z: -1.2, floor: 1 },
            candidate_count: 1,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    render(<CameraPermissionPanel isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use Demo Image' }));

    expect(
      await screen.findByText('Marker N101 detected (98%).'),
    ).toBeTruthy();
    expect(screen.getByText('ROOM101')).toBeTruthy();
    expect(screen.getByText('98%')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      const request = fetchMock.mock.calls[0][1];
      expect(JSON.parse(request?.body as string)).toMatchObject({
        image_payload: 'data:image/jpeg;base64,demo-frame',
      });
    });
  });
});
