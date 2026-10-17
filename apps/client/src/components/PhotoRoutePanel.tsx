import { useEffect, type ReactNode, type RefObject } from 'react';
import { usePhotoRoute } from '../hooks/usePhotoRoute';
import type { PhotoRouteAttempt, PhotoRouteResult } from '../utils/photoRoute';
import { PhotoRouteFinishDialog } from './PhotoRouteFinishDialog';

type PhotoRoutePanelProps = {
  isOpen: boolean;
  onClose: () => void;
  videoRef: RefObject<HTMLVideoElement | null>;
  cameraActive: boolean;
  cameraRequesting: boolean;
  cameraNotice: string;
  onEnableCamera: () => void;
  onTrackingChange: (running: boolean) => void;
  modelVisible?: boolean;
  onModelVisibilityChange?: (visible: boolean) => void;
  analysisControls?: ReactNode;
};

const STATUS_TEXT: Record<PhotoRouteResult['status'], string> = {
  matched: 'Geometric match found.',
  no_match: 'No reliable reference match.',
  ambiguous: 'Several points look alike. No point confirmed.',
  too_small: 'Reference view is too small in the frame. Move closer or change the view.',
  low_detail: 'Too few visual details. Look at a distinctive door and its surroundings.',
  busy: 'Analyzer busy. This frame was skipped.',
  not_ready: 'Each point needs at least one usable reference photo.',
  references_changed: 'References changed. Reload and restart.',
};

const REJECTION_TEXT: Record<NonNullable<PhotoRouteAttempt['rejection_reason']>, string> = {
  insufficient_matches: 'Too few distinctive feature matches to estimate geometry.',
  unstable_geometry: 'Feature matches do not support a stable perspective transformation.',
  insufficient_inliers: 'Too few feature matches agree with the estimated geometry.',
  inconsistent_matches: 'Most feature matches disagree with the estimated geometry.',
  concentrated_matches: 'Matching details cover too small an area to verify the view.',
  invalid_projection: 'The estimated reference outline is geometrically implausible.',
  reference_mostly_outside_frame: 'Most of the estimated reference view is outside the camera frame.',
  high_reprojection_error: 'The estimated geometry does not align the matching details accurately enough.',
};

export function PhotoRoutePanel({
  isOpen, onClose, videoRef, cameraActive, cameraRequesting, cameraNotice,
  onEnableCamera, onTrackingChange, modelVisible = true, onModelVisibilityChange, analysisControls,
}: PhotoRoutePanelProps) {
  const route = usePhotoRoute(videoRef, cameraActive, isOpen);
  const { catalog, progress, snapshot, expected, options, complete } = route;
  useEffect(() => {
    onTrackingChange(route.running);
  }, [onTrackingChange, route.running]);
  useEffect(() => () => onTrackingChange(false), [onTrackingChange]);

  const fresh = Boolean(snapshot && !route.snapshotExpired && snapshot.roundTripMs <= 3000);
  const visibleId = fresh ? snapshot?.result.recognized_point_id : null;
  const pointName = (id: string | null | undefined) => catalog?.points.find((point) => point.id === id)?.name ?? id ?? 'Unknown';
  const candidate = snapshot?.result.candidate;
  const attempt = snapshot?.result.attempt;
  const rejection = !candidate && snapshot?.result.status === 'no_match'
    ? attempt?.rejection_reason
      ? REJECTION_TEXT[attempt.rejection_reason] ?? 'Geometric verification failed.'
      : 'No distinctive reference details matched this frame.'
    : null;

  return (
    <>
      {route.finishVisible && catalog && <PhotoRouteFinishDialog
        destination={catalog.points[catalog.points.length - 1].name}
        confirmedCount={progress.confirmedIds.length} totalCount={catalog.points.length}
        onDismiss={route.dismissFinish} onReset={() => route.selectPoint(0)}
      />}
      {!isOpen && route.running && (
        <div className="photo-route-hud" role="status">
          <strong>Photo Route · {progress.confirmedIds.length}/{catalog?.points.length ?? 0}</strong>
          <span>Target: {expected?.name}</span>
          <span>Visible: {pointName(visibleId)}{fresh && candidate ? ` · ${Math.round(candidate.score * 100)}% match` : ''}</span>
          {fresh && !candidate && attempt && <span>Unverified: {pointName(attempt.point_id)} · {attempt.good_matches} feature matches</span>}
          <span>Confirmations: {progress.hits}/{options.confirmations}</span>
        </div>
      )}
      {isOpen && (
        <section className="camera-panel photo-route-panel" aria-label="Photo route panel">
          <h2 className="camera-panel__title">Photo Route</h2>
          <button type="button" className="panel-close-btn" onClick={onClose} aria-label="Close photo route panel">Close</button>
          <p className="camera-panel__text">
            {catalog?.points.length ?? 'Ordered'} viewpoints. Match the current target, confirm it across
            several frames, then search for the next one.
          </p>
          <div className="camera-panel__actions">
            <button type="button" className="camera-panel__btn" onClick={onEnableCamera} disabled={cameraActive || cameraRequesting}>
              {cameraRequesting ? 'Requesting...' : 'Enable Camera'}
            </button>
            {onModelVisibilityChange && (
              <button type="button" className="camera-panel__btn camera-panel__btn--secondary" onClick={() => onModelVisibilityChange(!modelVisible)}>
                {modelVisible ? 'Hide Model' : 'Show Model'}
              </button>
            )}
            <button type="button" className="camera-panel__btn camera-panel__btn--secondary" onClick={() => void route.reload()} disabled={route.loading}>
              {route.loading ? 'Loading references...' : 'Reload references'}
            </button>
          </div>
          {analysisControls}
          {!cameraActive && <p className="camera-panel__diagnostic-note">{cameraNotice}</p>}
          {route.error && <p className="camera-panel__diagnostic-note" data-state="error" role="alert">{route.error}</p>}
          {catalog && (
            <>
              <p className="camera-panel__diagnostic-note">
                Photos: <code>{catalog.reference_root}/{catalog.points[0]?.id}/</code> through <code>{catalog.points[catalog.points.length - 1]?.id}/</code>.
                Copy images into these folders on the server, then reload references.
              </p>
              {Boolean(catalog.disabled_points?.length) && <p className="camera-panel__diagnostic-note">
                Disabled points: {catalog.disabled_points?.map((point) => point.name).join(', ')}. Their photos are kept but not analyzed.
              </p>}
              {!catalog.ready && <p className="camera-panel__diagnostic-note" data-state="pending">Add at least one usable photo to every point before starting.</p>}
              <label className="photo-route-select" htmlFor="photo-route-start">
                Test start point
                <select id="photo-route-start" value={complete ? 'complete' : progress.index} disabled={route.running || route.loading}
                  onChange={(event) => route.selectPoint(Number(event.target.value))}>
                  {complete && <option value="complete" disabled>Route complete</option>}
                  {catalog.points.map((point, index) => <option value={index} key={point.id}>{point.name}</option>)}
                </select>
              </label>
              <div className="camera-panel__actions">
                <button type="button" className="camera-panel__btn" onClick={route.running ? route.pause : route.start}
                  disabled={!route.running && (!cameraActive || !catalog.ready || complete || route.loading)}>
                  {route.running ? 'Pause route' : 'Start / Resume route'}
                </button>
                <button type="button" className="camera-panel__btn camera-panel__btn--secondary" onClick={() => route.selectPoint(0)}>Reset route</button>
              </div>
              <div className="photo-route-live" role="status">
                <strong>{complete ? 'Route complete' : `Target: ${expected?.name ?? 'None'}`}</strong>
                <span>Visible view: {pointName(visibleId)}</span>
                <span>{route.processing ? 'Comparing a fresh frame...' : route.running ? 'Waiting for next frame.' : 'Tracking paused.'}</span>
                {snapshot && <span>{route.snapshotExpired ? 'Last result expired; no current view confirmed.' : STATUS_TEXT[snapshot.result.status]}</span>}
                {fresh && snapshot?.result.status === 'matched' && !snapshot.result.expected_matched
                  && <span>Different point detected. The target has not advanced.</span>}
                <span>Stable confirmations: {progress.hits}/{options.confirmations}</span>
              </div>
              <ol className="photo-route-points">
                {catalog.points.map((point, index) => (
                  <li key={point.id} data-state={progress.confirmedIds.includes(point.id) ? 'confirmed' : index === progress.index ? 'target' : 'pending'}>
                    <strong>{point.name}</strong>
                    <span>{progress.confirmedIds.includes(point.id) ? 'Confirmed' : index === progress.index ? 'Current target' : index < progress.index ? 'Skipped manually' : 'Pending'}</span>
                    <small>{point.id}: {point.usable_reference_count}/{point.reference_count} usable photos</small>
                    <details><summary>Reference files</summary><code>{point.files.join(', ') || 'No images yet'}</code></details>
                  </li>
                ))}
              </ol>
              {catalog.warnings.map((warning) => <p className="camera-panel__diagnostic-note" data-state="pending" key={warning}>{warning}</p>)}
            </>
          )}
          <details className="camera-panel__diagnostics">
            <summary>Matching settings</summary>
            <label className="camera-panel__calibration-control" htmlFor="photo-route-score">
              <span>Minimum match score: {Math.round(options.minimumScore * 100)}%</span>
              <input id="photo-route-score" type="range" min={40} max={95} step={5} value={Math.round(options.minimumScore * 100)}
                onChange={(event) => route.updateOptions({ ...options, minimumScore: Number(event.target.value) / 100 })} />
            </label>
            <label className="camera-panel__calibration-control" htmlFor="photo-route-margin">
              <span>Lead over another point: {Math.round(options.minimumMargin * 100)} points</span>
              <input id="photo-route-margin" type="range" min={5} max={50} step={5} value={Math.round(options.minimumMargin * 100)}
                onChange={(event) => route.updateOptions({ ...options, minimumMargin: Number(event.target.value) / 100 })} />
            </label>
            <label className="camera-panel__calibration-control" htmlFor="photo-route-visible">
              <span>Minimum visible reference area: {Math.round(options.minimumVisibleFraction * 100)}%</span>
              <input id="photo-route-visible" type="range" min={5} max={80} step={5} value={Math.round(options.minimumVisibleFraction * 100)}
                onChange={(event) => route.updateOptions({ ...options, minimumVisibleFraction: Number(event.target.value) / 100 })} />
            </label>
            <label className="photo-route-select" htmlFor="photo-route-confirmations">
              Required matching frames
              <select id="photo-route-confirmations" value={options.confirmations}
                onChange={(event) => route.updateOptions({ ...options, confirmations: Number(event.target.value) })}>
                {[2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="photo-route-select" htmlFor="photo-route-interval">
              Delay after each response
              <select id="photo-route-interval" value={options.intervalMs}
                onChange={(event) => route.updateOptions({ ...options, intervalMs: Number(event.target.value) })}>
                {[500, 1000, 1500, 2000].map((value) => <option key={value} value={value}>{value} ms</option>)}
              </select>
            </label>
            <p className="camera-panel__diagnostic-note">Changing settings pauses tracking. Defaults: 60% score, 10-point lead, 3 frames. A confirmation also needs at least one second of observations.</p>
          </details>
          {snapshot && (
            <details className="camera-panel__diagnostics" open>
              <summary>Last analyzed frame and scores</summary>
              <div className="photo-route-preview">
                <img src={snapshot.image} alt="Last analyzed photo route frame" />
                {candidate && <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
                  <polygon points={candidate.outline.map((point) => `${point.x},${point.y}`).join(' ')}
                    fill="none" stroke={snapshot.result.status === 'matched' ? '#24e88b' : '#ffd84d'} strokeWidth={3} vectorEffect="non-scaling-stroke" />
                </svg>}
              </div>
              <p className="camera-panel__diagnostic-note">Full camera frame, no crop. The outline is display-only. Matching uses the clean camera frame, without app overlays.</p>
              <dl className="camera-panel__result-grid">
                <div><dt>Best candidate</dt><dd>{pointName(candidate?.point_id ?? attempt?.point_id)}{!candidate && attempt ? ' (unverified)' : ''}</dd></div>
                <div><dt>Match score</dt><dd>{candidate ? `${Math.round(candidate.score * 100)}%` : 'Not available'}</dd></div>
                <div><dt>Inliers / matches</dt><dd>{candidate?.inliers ?? attempt?.inliers ?? 0} / {candidate?.good_matches ?? attempt?.good_matches ?? 0}</dd></div>
                <div><dt>Frame features</dt><dd>{snapshot.result.query_features}</dd></div>
                <div><dt>Frame size</dt><dd>{snapshot.frameWidth} × {snapshot.frameHeight}</dd></div>
                {candidate?.reference_visible_fraction !== undefined && <div><dt>Reference area in view</dt><dd>{Math.round(candidate.reference_visible_fraction * 100)}%</dd></div>}
                {candidate?.overlap_coverage !== undefined && <div><dt>Shared-area feature coverage</dt><dd>{Math.round(candidate.overlap_coverage * 100)}%</dd></div>}
                {attempt && <div><dt>Reference features</dt><dd>{attempt.reference_features}</dd></div>}
                <div><dt>Lead over runner-up</dt><dd>{candidate ? `${Math.round(snapshot.result.margin * 100)} points` : 'Not available'}</dd></div>
                <div><dt>CV processing</dt><dd>{snapshot.result.processing_time_ms} ms</dd></div>
                <div><dt>Round trip</dt><dd>{snapshot.roundTripMs} ms</dd></div>
              </dl>
              <p className="camera-panel__diagnostic-note">Best reference: {candidate?.reference_file ?? attempt?.reference_file ?? 'None'}</p>
              {candidate && <p className="camera-panel__diagnostic-note">The outline encloses matching details, not the entire reference photo. Partial reference views can match.</p>}
              {rejection && <p className="camera-panel__diagnostic-note" data-state="pending">
                Score unavailable: {rejection}{attempt ? ` At least ${attempt.minimum_inliers} geometrically consistent matches are required.` : ''}
                {' '}No point was confirmed.
              </p>}
            </details>
          )}
          <p className="camera-panel__diagnostic-note">
            Match scores are geometric quality scores, not probabilities.
            Recognizing a view does not measure arrival distance. No navigation
            coordinates are changed. Normal structural scans pause while this route runs.
          </p>
        </section>
      )}
    </>
  );
}
