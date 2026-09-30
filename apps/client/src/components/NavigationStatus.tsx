import { useEffect, useState } from 'react';
import type { PlayerNavigationDebug } from '../navigation/useNavigation';
import { directionRelativeToHeading, type CardinalDirection, type NavigationPath } from '../navigation/graph';
import type { NavigableDestination } from '../navigation/destinations';
import type { NavigationPoint } from '../navigation/navigationData';

type NavigationStatusProps = {
  buildingName: string | null;
  currentPointId: string | null;
  debugSnapshot: PlayerNavigationDebug | null;
  debugEnabled: boolean;
  loadError: string | null;
  alignmentWarning: string | null;
  navigationPoints?: NavigationPoint[];
  availableDestinations?: NavigableDestination[];
  destinationId?: string | null;
  activeRoute?: NavigationPath | null;
  routeMessage?: string | null;
  onNavigate?: (destinationId: string) => void;
  onCancelNavigation?: () => void;
  headingDegrees?: number;
  isOpen?: boolean;
  onToggle?: () => void;
  collapsible?: boolean;
  className?: string;
};

function turnBetween(from: CardinalDirection, to: CardinalDirection) {
  const order: CardinalDirection[] = ['FORWARD', 'RIGHT', 'BACKWARD', 'LEFT'];
  const delta = (order.indexOf(to) - order.indexOf(from) + 4) % 4;
  if (delta === 1) return 'Turn right';
  if (delta === 3) return 'Turn left';
  if (delta === 2) return 'Turn around';
  return null;
}

function directionLabel(direction: CardinalDirection) {
  return direction.toLowerCase();
}

function relativeWalkInstruction(direction: CardinalDirection, distanceMeters: number) {
  if (direction === 'BACKWARD') return `Turn around, then walk ${distanceMeters.toFixed(1)} m forward`;
  if (direction === 'LEFT' || direction === 'RIGHT') {
    return `Turn ${direction.toLowerCase()}, then walk ${distanceMeters.toFixed(1)} m forward`;
  }
  return `Walk ${distanceMeters.toFixed(1)} m forward`;
}

export function NavigationStatus({
  buildingName,
  currentPointId,
  debugSnapshot,
  debugEnabled,
  loadError,
  alignmentWarning,
  navigationPoints = [],
  availableDestinations = [],
  destinationId = null,
  activeRoute = null,
  routeMessage = null,
  onNavigate,
  onCancelNavigation,
  headingDegrees = 0,
  isOpen = true,
  onToggle,
  collapsible = true,
  className = 'navigation-status',
}: NavigationStatusProps) {
  const [selectedDestinationId, setSelectedDestinationId] = useState(destinationId ?? '');

  useEffect(() => {
    if (destinationId) setSelectedDestinationId(destinationId);
  }, [destinationId]);

  if (collapsible && !isOpen) {
    return (
      <section className={`${className} navigation-status--collapsed`} aria-label="Navigation status">
        <button type="button" className="navigation-status__collapse-toggle" onClick={onToggle} aria-expanded={false}>
          <span aria-hidden="true">▸</span> Navigation
        </button>
      </section>
    );
  }

  return (
    <section className={className} aria-label="Navigation status" aria-live="polite">
      <div className="navigation-status__heading">
        {collapsible ? (
          <button type="button" className="navigation-status__collapse-toggle" onClick={onToggle} aria-expanded={true}>
            <span aria-hidden="true">▾</span> Navigation
          </button>
        ) : <h2>Navigation</h2>}
        {buildingName && <span>{buildingName}</span>}
      </div>
      <div>Current location: <strong>{currentPointId ?? '—'}</strong></div>
      {onNavigate && (
        <div className="navigation-status__route-control">
          <label htmlFor="navigation-destination">Destination</label>
          <select
            id="navigation-destination"
            value={selectedDestinationId}
            onChange={(event) => setSelectedDestinationId(event.target.value)}
            disabled={!currentPointId || availableDestinations.length === 0}
          >
            <option value="">Select a destination</option>
            {availableDestinations.filter((destination) => destination.id !== currentPointId).map((destination) => (
              <option key={destination.id} value={destination.id}>{destination.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => selectedDestinationId && onNavigate(selectedDestinationId)}
            disabled={!selectedDestinationId || !currentPointId}
          >
            Navigate
          </button>
          {activeRoute && onCancelNavigation && (
            <button type="button" onClick={onCancelNavigation}>Cancel</button>
          )}
        </div>
      )}
      {onNavigate && availableDestinations.length === 0 && (
        <p className="navigation-status__warning">No named destinations are configured.</p>
      )}
      {routeMessage && <p className="navigation-status__warning">{routeMessage}</p>}
      {activeRoute && (
        <div className="navigation-status__route" aria-live="polite">
          {(() => {
            const currentIndex = currentPointId ? activeRoute.points.indexOf(currentPointId) : -1;
            const remainingDistance = currentIndex >= 0
              ? activeRoute.directions.slice(currentIndex).reduce((total, direction) => total + direction.distanceMeters, 0)
              : activeRoute.distanceMeters;
            const activeInstructionIndex = activeRoute.instructions.findIndex((instruction) =>
              instruction.pointIds.includes(currentPointId ?? activeRoute.start) && instruction.to !== currentPointId,
            );
            const activeInstruction = activeRoute.instructions[Math.max(0, activeInstructionIndex)];
            const activeInstructionEndIndex = activeInstruction
              ? activeRoute.points.indexOf(activeInstruction.to)
              : -1;
            const activeInstructionRemaining = activeInstruction && currentIndex >= 0 && activeInstructionEndIndex >= currentIndex
              ? activeRoute.directions.slice(currentIndex, activeInstructionEndIndex).reduce((total, direction) => total + direction.distanceMeters, 0)
              : activeInstruction?.distanceMeters ?? 0;
            const nextDirection = activeRoute.directions[currentIndex >= 0 ? currentIndex : 0];
            const nextFrom = navigationPoints.find((point) => point.id === nextDirection?.from);
            const nextTo = navigationPoints.find((point) => point.id === nextDirection?.to);
            const relativeDirection = nextFrom && nextTo
              ? directionRelativeToHeading(nextFrom, nextTo, headingDegrees)
              : activeInstruction?.direction;
            return (
              <>
                <div>Distance remaining: <strong>{remainingDistance.toFixed(1)} m</strong></div>
                {activeInstruction && <div>Current instruction: <strong>{relativeWalkInstruction(relativeDirection ?? activeInstruction.direction, activeInstructionRemaining)}</strong></div>}
                {activeInstructionIndex >= 0 && activeRoute.instructions[activeInstructionIndex + 1] && (
                  <div>Next: <strong>{turnBetween(activeInstruction.direction, activeRoute.instructions[activeInstructionIndex + 1].direction) ?? `Walk ${directionLabel(activeRoute.instructions[activeInstructionIndex + 1].direction)}`}</strong></div>
                )}
              </>
            );
          })()}
          <div>To: <strong>{availableDestinations.find((destination) => destination.id === activeRoute.destination)?.name ?? activeRoute.destination}</strong></div>
          <div>Distance: <strong>{activeRoute.distanceMeters.toFixed(2)} m</strong></div>
          <ol>
            {activeRoute.instructions.map((instruction, index) => (
              <li key={`${instruction.from}-${instruction.to}`} data-active={index === Math.max(0, activeRoute.instructions.findIndex((candidate) => candidate.pointIds.includes(currentPointId ?? activeRoute.start)))}>
                {index > 0 && <>{turnBetween(activeRoute.instructions[index - 1].direction, instruction.direction)}. </>}
                Walk {instruction.distanceMeters.toFixed(1)} m forward
              </li>
            ))}
            <li>Arrive at {availableDestinations.find((destination) => destination.id === activeRoute.destination)?.name ?? activeRoute.destination}</li>
          </ol>
          {debugEnabled && <div className="navigation-status__raw-route">Raw Dijkstra path: {activeRoute.points.join(' → ')}</div>}
        </div>
      )}
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