import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CameraPermissionPanel } from './CameraPermissionPanel';
import { photoCatalog } from '../test/photoRouteFixtures';
import type { ModelSceneFrame } from '../navigation/navigationData';
import type {
  CameraPoseSnapshot,
  WallReference,
} from '../utils/wallReferences';

const modelFrame: ModelSceneFrame = {
  center: { x: 0, y: 0, z: 0 },
  floorHeight: 0,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  bounds: {
    min: { x: -10, y: 0, z: -10 },
    max: { x: 10, y: 4, z: 10 },
  },
};

const cameraPoseRef = {
  current: {
    position: { x: 0, y: 1.6, z: 0 },
    forward: { x: 0, y: 0, z: -1 },
    right: { x: 1, y: 0, z: 0 },
  },
} satisfies { current: CameraPoseSnapshot };

const wallReferences: WallReference[] = [{
  id: 'wall-front',
  axis: 'z',
  coordinate: -5,
  bounds: {
    min: { x: -2, y: 0, z: -5 },
    max: { x: 2, y: 3, z: -5 },
  },
  width: 4,
  height: 3,
  surface_area: 12,
}];

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
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function prepareCamera() {
    const stop = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,frame');
    const video = document.querySelector('video');
    if (!video) throw new Error('Camera video element is missing');
    Object.defineProperties(video, {
      readyState: { configurable: true, value: 2 },
      videoWidth: { configurable: true, value: 640 },
      videoHeight: { configurable: true, value: 480 },
      srcObject: { configurable: true, writable: true, value: null },
    });
    vi.spyOn(video, 'play').mockResolvedValue();
    return { getUserMedia, stop };
  }

  it('starts the camera without floor, wall, object, or OCR requests by default', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    render(<CameraPermissionPanel isOpen onClose={vi.fn()} />);
    const camera = prepareCamera();
    expect(screen.getByRole('switch', { name: 'Floor and wall analysis: Off' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('switch', { name: 'Object analysis: Off' }).getAttribute('aria-checked')).toBe('false');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Enable Camera' })); });
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(camera.getUserMedia).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.querySelector('.structural-line-overlay')).toBeNull();
    expect(document.querySelector('.scene-analysis-overlay')).toBeNull();
  });

  it('aborts a floor request and discards late results when floor analysis is disabled', async () => {
    vi.useFakeTimers();
    let finish!: (response: Response) => void;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<CameraPermissionPanel isOpen onClose={vi.fn()} />);
    const camera = prepareCamera();
    fireEvent.click(screen.getByRole('switch', { name: 'Floor and wall analysis: Off' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Enable Camera' })); });
    expect(fetchMock).toHaveBeenCalledOnce();
    const signal = fetchMock.mock.calls[0][1]?.signal;
    fireEvent.click(screen.getByRole('switch', { name: 'Floor and wall analysis: On' }));
    expect(signal?.aborted).toBe(true);
    await act(async () => { finish(new Response(JSON.stringify({ structuralLines: { detected: true } }))); });
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(document.querySelector('.structural-line-overlay')).toBeNull();
    expect(camera.stop).not.toHaveBeenCalled();
  });

  it('enables object detection independently and stops requests and overlays on disable', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      sceneAnalysis: {
        status: 'ready', detector_status: 'ready', text_status: 'disabled', model_name: 'test',
        vocabulary_size: 2, detections: [], messages: [], image_width: 640, image_height: 480,
        object_time_ms: 50, text_time_ms: 0, processing_time_ms: 50, diagnostic_only: true,
      },
    })));
    render(<CameraPermissionPanel isOpen onClose={vi.fn()} />);
    prepareCamera();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Enable Camera' })); });
    fireEvent.click(screen.getByRole('switch', { name: 'Object analysis: Off' }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/cv/scene-analysis');
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string).include_text).toBe(false);
    expect(document.querySelector('.scene-analysis-overlay')).not.toBeNull();
    expect(document.querySelector('.structural-line-overlay')).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: 'Object analysis: On' }));
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(document.querySelector('.scene-analysis-overlay')).toBeNull();
  });

  it.each([true, false])('pauses optional modes for Photo Route and respects floor resume setting %s', async (keepFloorEnabled) => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (url === '/api/v1/cv/photo-route') return new Response(JSON.stringify(photoCatalog()));
      return new Promise<Response>(() => {});
    });
    const view = render(<CameraPermissionPanel isOpen onClose={vi.fn()} />);
    const camera = prepareCamera();
    fireEvent.click(screen.getByRole('switch', { name: 'Floor and wall analysis: Off' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Object analysis: Off' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Enable Camera' })); });
    await act(() => vi.advanceTimersByTimeAsync(0));
    const floorSignal = fetchMock.mock.calls.find(([url]) => url === '/api/v1/cv/structural-lines')?.[1]?.signal;
    const sceneSignal = fetchMock.mock.calls.find(([url]) => url === '/api/v1/cv/scene-analysis')?.[1]?.signal;
    view.rerender(<CameraPermissionPanel isOpen={false} onClose={vi.fn()} photoRouteOpen />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    fireEvent.click(screen.getByRole('button', { name: 'Start / Resume route' }));
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(floorSignal?.aborted).toBe(true);
    expect(sceneSignal?.aborted).toBe(true);
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/v1/cv/structural-lines')).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/v1/cv/scene-analysis')).toHaveLength(1);
    expect(document.querySelector('.structural-line-overlay')).toBeNull();
    expect(document.querySelector('.scene-analysis-overlay')).toBeNull();
    const photoSignal = fetchMock.mock.calls.find(([url]) => url === '/api/v1/cv/photo-route/match')?.[1]?.signal;
    if (!keepFloorEnabled) fireEvent.click(screen.getByRole('switch', { name: 'Floor and wall analysis: On' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pause route' }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(photoSignal?.aborted).toBe(true);
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/v1/cv/structural-lines')).toHaveLength(keepFloorEnabled ? 2 : 1);
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/v1/cv/scene-analysis')).toHaveLength(2);
    expect(camera.getUserMedia).toHaveBeenCalledOnce();
  });

  it('toggles model visibility from the camera controls', () => {
    const onModelVisibilityChange = vi.fn();
    const { rerender } = render(
      <CameraPermissionPanel
        isOpen
        onClose={vi.fn()}
        modelVisible
        onModelVisibilityChange={onModelVisibilityChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Hide Model' }));
    expect(onModelVisibilityChange).toHaveBeenLastCalledWith(false);

    rerender(
      <CameraPermissionPanel
        isOpen
        onClose={vi.fn()}
        modelVisible={false}
        onModelVisibilityChange={onModelVisibilityChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show Model' }));
    expect(onModelVisibilityChange).toHaveBeenLastCalledWith(true);
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
    expect(
      screen.queryByRole('button', { name: 'Upload Image' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Use Demo Image' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Clear Image' }),
    ).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Enable Camera' }));

    expect(
      await screen.findByText(
        'No camera device is available.',
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
            floor_boundaries: [
              {
                line: { x1: 0.1, y1: 0.68, x2: 0.5, y2: 0.58 },
                angle_deg: -10.6,
                confidence: 0.88,
              },
              {
                line: { x1: 0.5, y1: 0.58, x2: 0.9, y2: 0.7 },
                angle_deg: 12.7,
                confidence: 0.81,
              },
            ],
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
            wall_outline: {
              top_left: { x: 0.2, y: 0.2 },
              top_right: { x: 0.8, y: 0.2 },
              bottom_right: { x: 0.9, y: 0.7 },
              bottom_left: { x: 0.1, y: 0.68 },
            },
            wall_confidence: 0.84,
            wall_outlines: [{
              outline: {
                top_left: { x: 0.2, y: 0.2 },
                top_right: { x: 0.8, y: 0.2 },
                bottom_right: { x: 0.9, y: 0.7 },
                bottom_left: { x: 0.1, y: 0.68 },
              },
              confidence: 0.84,
              floor_boundary_index: 0,
            }],
            wall_candidate_count: 2,
            wall_detection_skipped: false,
            wall_detection_reason: null,
            device_pitch_deg: 45,
            selected_wall_id: 'wall-front',
            pose_estimate: {
              position: { x: 0.3, y: 1.55, z: -0.3 },
              delta: {
                x: 0.3,
                y: -0.05,
                z: -0.3,
                horizontal_m: 0.424,
                distance_m: 0.427,
              },
              confidence: 0.79,
              reprojection_error_px: 1.2,
              distance_to_wall_m: 4.71,
              method: 'solvepnp_ippe_planar',
              diagnostic_only: true,
            },
            pose_failure_reason: null,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    render(
      <CameraPermissionPanel
        isOpen
        onClose={vi.fn()}
        orientationRef={{ current: { beta: 45, gamma: 2.5 } }}
        orientationActive
        modelFrame={modelFrame}
        cameraPoseRef={cameraPoseRef}
        wallReferences={wallReferences}
      />,
    );
    const video = document.querySelector('video');
    if (!video) throw new Error('Camera video element is missing');
    Object.defineProperties(video, {
      readyState: { configurable: true, value: 2 },
      videoWidth: { configurable: true, value: 1280 },
      videoHeight: { configurable: true, value: 720 },
      srcObject: { configurable: true, writable: true, value: null },
    });
    vi.spyOn(video, 'play').mockResolvedValue();

    fireEvent.click(screen.getByRole('switch', { name: 'Floor and wall analysis: Off' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enable Camera' }));

    expect(
      await screen.findByText('2 floor boundaries detected (88%).'),
    ).toBeTruthy();
    expect(screen.getByText('3.2 ms')).toBeTruthy();
    expect(screen.getByText('CV position estimate')).toBeTruthy();
    expect(screen.getByText('0.42 m')).toBeTruthy();
    expect(
      screen.getByText(
        'Diagnostic only. The navigation position is not being corrected.',
      ),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalled();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/cv/structural-lines');
    const requestBody = JSON.parse(options?.body as string);
    expect(requestBody).toMatchObject({
      image_payload: 'data:image/jpeg;base64,live-frame',
      sequence_number: 1,
      device_roll_deg: 2.5,
      device_pitch_deg: 45,
      estimated_position: { x: 0, y: 1.6, z: 0 },
      wall_reference: {
        id: 'wall-front',
        corners: [
          { x: -2, y: 3, z: -5 },
          { x: 2, y: 3, z: -5 },
          { x: 2, y: 0, z: -5 },
          { x: -2, y: 0, z: -5 },
        ],
      },
      camera_intrinsics: {
        cx: 320,
        cy: 240,
      },
      intrinsics_confidence: 0.35,
    });
    expect(requestBody.camera_intrinsics.fx).toBeCloseTo(554.256, 2);
    expect(requestBody.reference_confidence).toBeGreaterThan(0.7);
  });

});
