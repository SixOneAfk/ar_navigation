import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  });

  afterEach(() => {
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

  it('processes the built-in image through the gateway', async () => {
    vi.stubGlobal('Image', MockImage);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
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
