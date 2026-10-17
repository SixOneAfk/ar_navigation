type CvAnalysisControlsProps = {
  floorEnabled: boolean;
  objectsEnabled: boolean;
  paused: boolean;
  onFloorChange: (enabled: boolean) => void;
  onObjectsChange: (enabled: boolean) => void;
};

export function CvAnalysisControls({
  floorEnabled, objectsEnabled, paused, onFloorChange, onObjectsChange,
}: CvAnalysisControlsProps) {
  return (
    <div className="camera-panel__scene" aria-label="Optional CV analysis">
      <div className="camera-panel__actions">
        <button type="button" role="switch" aria-checked={floorEnabled}
          className="camera-panel__btn camera-panel__btn--secondary"
          onClick={() => onFloorChange(!floorEnabled)}>
          Floor and wall analysis: {floorEnabled ? 'On' : 'Off'}
        </button>
        <button type="button" role="switch" aria-checked={objectsEnabled}
          className="camera-panel__btn camera-panel__btn--secondary"
          onClick={() => onObjectsChange(!objectsEnabled)}>
          Object analysis: {objectsEnabled ? 'On' : 'Off'}
        </button>
      </div>
      <p className="camera-panel__diagnostic-note">
        {paused ? 'Photo Route is running. Floor, wall, and object analysis are paused.'
          : 'Both optional modes are off by default. Camera and Photo Route work independently.'}
      </p>
    </div>
  );
}
