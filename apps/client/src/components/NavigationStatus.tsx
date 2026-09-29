import type { PlayerNavigationDebug } from '../navigation/useNavigation';

type NavigationStatusProps = {
  buildingName: string | null;
  currentPointId: string | null;
  debugSnapshot: PlayerNavigationDebug | null;
  debugEnabled: boolean;
  loadError: string | null;
  alignmentWarning: string | null;
  className?: string;
};

export function NavigationStatus({
  buildingName,
  currentPointId,
  debugSnapshot,
  debugEnabled,
  loadError,
  alignmentWarning,
  className = 'navigation-status',
}: NavigationStatusProps) {
  return (
    <section className={className} aria-label="Navigation status" aria-live="polite">
      <div className="navigation-status__heading">
        <h2>Navigation</h2>
        {buildingName && <span>{buildingName}</span>}
      </div>
      <div>Current location: <strong>{currentPointId ?? '—'}</strong></div>
      {loadError && <p className="navigation-status__warning">{loadError}</p>}
      {alignmentWarning && <p className="navigation-status__warning">{alignmentWarning}</p>}
      {debugEnabled && debugSnapshot && (
        <div className="navigation-status__debug">
          <div>Player X: {debugSnapshot.playerPosition.x.toFixed(2)}</div>
          <div>Player Y: {debugSnapshot.playerPosition.y.toFixed(2)}</div>
          <div>Player Z: {debugSnapshot.playerPosition.z.toFixed(2)}</div>
          <div>Nearest point: {debugSnapshot.nearestPointId ?? '—'}</div>
          <div>Distance: {debugSnapshot.distanceMeters === null ? '—' : `${debugSnapshot.distanceMeters.toFixed(2)} m`}</div>
          <div>Detection radius: {debugSnapshot.detectionRadiusMeters.toFixed(2)} m</div>
        </div>
      )}
    </section>
  );
}