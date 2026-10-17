import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { capturePhotoRouteFrame } from '../utils/cvFrame';
import { loadPhotoRoute, sendPhotoRouteFrame, type PhotoRouteResult } from '../utils/photoRoute';
import { photoCatalog, photoMatch } from '../test/photoRouteFixtures';
import { mockModalDialogs } from '../test/dialogMock';
import { PhotoRoutePanel } from './PhotoRoutePanel';

vi.mock('../utils/photoRoute', async (original) => ({
  ...await original<typeof import('../utils/photoRoute')>(),
  loadPhotoRoute: vi.fn(), sendPhotoRouteFrame: vi.fn(),
}));
vi.mock('../utils/cvFrame', () => ({ capturePhotoRouteFrame: vi.fn() }));

describe('PhotoRoutePanel', () => {
  let dialogs: ReturnType<typeof mockModalDialogs>;
  const props = {
    isOpen: true, onClose: vi.fn(), videoRef: { current: document.createElement('video') },
    cameraActive: false, cameraRequesting: false, cameraNotice: 'Enable the camera first.',
    onEnableCamera: vi.fn(), onTrackingChange: vi.fn(),
  };

  beforeEach(() => {
    dialogs = mockModalDialogs();
    vi.mocked(loadPhotoRoute).mockResolvedValue(photoCatalog(false));
    vi.mocked(capturePhotoRouteFrame).mockImplementation((_video, canvas) => {
      canvas.width = 480;
      canvas.height = 640;
      return 'data:image/jpeg;base64,frame';
    });
    vi.mocked(sendPhotoRouteFrame).mockResolvedValue(photoMatch());
  });
  afterEach(() => { cleanup(); dialogs.restore(); vi.useRealTimers(); vi.resetAllMocks(); });

  it('shows four active folders, reports the disabled fifth point, and blocks missing photos', async () => {
    render(<PhotoRoutePanel {...props} />);
    expect(await screen.findByText('Add at least one usable photo to every point before starting.')).toBeTruthy();
    expect(screen.getByText('apps/cv-service/route_photos/point-01/')).toBeTruthy();
    expect(screen.getAllByText(/0\/0 usable photos/)).toHaveLength(4);
    expect(screen.getByText(/Disabled points: Point 5/)).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Point 5' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Start / Resume route' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('uses the existing camera controls and explains score limitations', async () => {
    render(<PhotoRoutePanel {...props} />);
    await screen.findByText('Add at least one usable photo to every point before starting.');
    fireEvent.click(screen.getByRole('button', { name: 'Enable Camera' }));
    expect(props.onEnableCamera).toHaveBeenCalledOnce();
    expect(screen.getByText(/Match scores are geometric quality scores, not probabilities/)).toBeTruthy();
  });

  it('allows threshold changes and explicit reference reload', async () => {
    vi.mocked(loadPhotoRoute).mockResolvedValue(photoCatalog());
    render(<PhotoRoutePanel {...props} cameraActive />);
    await screen.findByRole('option', { name: 'Point 4' });
    fireEvent.change(screen.getByLabelText('Minimum match score: 60%'), { target: { value: '75' } });
    expect(screen.getByText('Minimum match score: 75%')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reload references' }));
    expect(loadPhotoRoute).toHaveBeenLastCalledWith(true, expect.any(AbortSignal));
  });

  it('keeps the panel hidden without loading a catalog', () => {
    const { container } = render(<PhotoRoutePanel {...props} isOpen={false} />);
    expect(container.querySelector('section')).toBeNull();
    expect(loadPhotoRoute).not.toHaveBeenCalled();
  });

  async function renderFrame(result: PhotoRouteResult) {
    vi.mocked(loadPhotoRoute).mockResolvedValue(photoCatalog());
    vi.mocked(sendPhotoRouteFrame).mockResolvedValue(result);
    render(<PhotoRoutePanel {...props} cameraActive />);
    await screen.findByRole('option', { name: 'Point 4' });
    fireEvent.click(screen.getByRole('button', { name: 'Start / Resume route' }));
    await screen.findByAltText('Last analyzed photo route frame');
  }

  it.each(['matched', 'ambiguous', 'too_small', 'no_match'] as const)(
    'shows a nonzero geometric score even when the result is %s', async (status) => {
      await renderFrame({ ...photoMatch(), status, expected_matched: status === 'matched' });
      expect(screen.getByText('Match score').parentElement?.querySelector('dd')?.textContent).toBe('88%');
    },
  );

  it('does not turn missing geometry into a zero-percent score', async () => {
    await renderFrame({
      ...photoMatch(), status: 'no_match', candidate: null, candidates: [],
      recognized_point_id: null, expected_matched: false, margin: 0,
      attempt: {
        point_id: 'point-01', reference_file: 'front.jpg', reference_features: 125,
        good_matches: 7, inliers: 0, minimum_inliers: 12, rejection_reason: 'insufficient_matches',
      },
    });
    expect(screen.getByText('Match score').parentElement?.querySelector('dd')?.textContent).toBe('Not available');
    expect(screen.getByText('Inliers / matches').parentElement?.querySelector('dd')?.textContent).toBe('0 / 7');
    expect(screen.getByText('Frame features').parentElement?.querySelector('dd')?.textContent).toBe('800');
    expect(screen.getByText('Point 1 (unverified)')).toBeTruthy();
    expect(screen.getByText(/Too few distinctive feature matches to estimate geometry/)).toBeTruthy();
    expect(screen.getByText(/At least 12 geometrically consistent matches are required/)).toBeTruthy();
    expect(screen.queryByText('0%')).toBeNull();
    expect(screen.getByText('Stable confirmations: 0/3')).toBeTruthy();
  });

  it('keeps the displayed outline separate from the submitted camera image', async () => {
    await renderFrame(photoMatch());
    const image = screen.getByAltText('Last analyzed photo route frame');
    expect(image.getAttribute('src')).toBe('data:image/jpeg;base64,frame');
    expect(image.parentElement?.querySelector('svg polygon')).not.toBeNull();
    expect(image.parentElement?.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 1 1');
    expect(image.parentElement?.querySelector('svg')?.getAttribute('preserveAspectRatio')).toBe('none');
    expect(screen.getByText('Frame size').parentElement?.querySelector('dd')?.textContent).toBe('480 × 640');
    expect(sendPhotoRouteFrame).toHaveBeenCalledWith(
      'data:image/jpeg;base64,frame', 'point-01', 'test-revision',
      expect.any(Object), expect.any(AbortSignal),
    );
    expect(screen.getByText(/Matching uses the clean camera frame, without app overlays/)).toBeTruthy();
  });

  it('handles responses without diagnostic details or image features', async () => {
    await renderFrame({
      ...photoMatch(), status: 'low_detail', candidate: null, candidates: [],
      recognized_point_id: null, expected_matched: false, query_features: 0,
    });
    expect(screen.getByText('Match score').parentElement?.querySelector('dd')?.textContent).toBe('Not available');
    expect(screen.getByText(/Too few visual details/)).toBeTruthy();
    expect(screen.queryByText('0%')).toBeNull();
  });

  it('distinguishes the match score from a small visible fraction of the reference', async () => {
    const result = photoMatch();
    if (!result.candidate) throw new Error('The fixture must contain a candidate');
    result.candidate.reference_visible_fraction = 0.14;
    result.candidate.overlap_coverage = 0.7;
    await renderFrame(result);
    expect(screen.getByText('Match score').parentElement?.querySelector('dd')?.textContent).toBe('88%');
    expect(screen.getByText('Reference area in view').parentElement?.querySelector('dd')?.textContent).toBe('14%');
    expect(screen.getByText('Shared-area feature coverage').parentElement?.querySelector('dd')?.textContent).toBe('70%');
  });

  it('announces completion after four points even with the panel closed, and stays dismissed', async () => {
    vi.useFakeTimers();
    vi.mocked(loadPhotoRoute).mockResolvedValue(photoCatalog());
    vi.mocked(sendPhotoRouteFrame).mockImplementation(async (_image, expected) => photoMatch(expected));
    const view = render(<PhotoRoutePanel {...props} cameraActive />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    fireEvent.click(screen.getByRole('button', { name: 'Start / Resume route' }));
    view.rerender(<PhotoRoutePanel {...props} cameraActive isOpen={false} />);
    for (let frame = 0; frame < 20; frame++) await act(() => vi.advanceTimersByTimeAsync(1000));
    const dialog = screen.getByRole('dialog', { name: 'Finish recognized' });
    expect(within(dialog).getByText('Point 4')).toBeTruthy();
    expect(within(dialog).getByText('4 of 4')).toBeTruthy();
    expect(dialogs.showModal).toHaveBeenCalledOnce();
    const calls = vi.mocked(sendPhotoRouteFrame).mock.calls.length;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    view.rerender(<PhotoRoutePanel {...props} cameraActive />);
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('option', { name: 'Route complete' })).toBeTruthy();
    expect(sendPhotoRouteFrame).toHaveBeenCalledTimes(calls);
  });

  it('waits for stable final recognition and resets a manually shortened test from the finish dialog', async () => {
    vi.useFakeTimers();
    vi.mocked(loadPhotoRoute).mockResolvedValue(photoCatalog());
    vi.mocked(sendPhotoRouteFrame).mockImplementation(async (_image, expected) => photoMatch(expected));
    render(<PhotoRoutePanel {...props} cameraActive />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    fireEvent.change(screen.getByLabelText('Test start point'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start / Resume route' }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('1 of 4')).toBeTruthy();
    expect(within(dialog).getByText('3 viewpoints skipped for this test.')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset route' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((screen.getByLabelText('Test start point') as HTMLSelectElement).value).toBe('0');
    const calls = vi.mocked(sendPhotoRouteFrame).mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(sendPhotoRouteFrame).toHaveBeenCalledTimes(calls);
  });
});
