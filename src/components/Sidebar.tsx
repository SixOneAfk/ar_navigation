import { type Dispatch, type PointerEvent as ReactPointerEvent, type SetStateAction } from 'react';
import type { GyroState, MotionCalibration } from '../hooks/useGyroscope';

type MoveMode = 'off' | 'gyro' | 'buttons' | 'walk';

type ButtonState = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
};

type JoystickState = {
  x: number;
  y: number;
  active: boolean;
};

type SidebarProps = {
  isMenuOpen: boolean;
  onToggleMenu: () => void;
  gyroState: GyroState;
  gyroActive: boolean;
  requestPermission: () => void;
  worldAnchor: [number, number, number];
  tracking: { x: number; y: number; z: number };
  relativeToModel: { x: number; y: number; z: number };
  distanceToModel: number;
  sensitivity: number;
  walkSpeed: number;
  calibrationAxis: 'z' | null;
  calibrationDistance: number;
  calibrationSamples: number[];
  calibrationSampleCount: number;
  calibrationReferenceDistance: number;
  motionCalibration: MotionCalibration;
  motionCalibrating: boolean;
  moveMode: MoveMode;
  joystick: JoystickState;
  buttonState: ButtonState;
  setMoveMode: (mode: MoveMode) => void;
  setSensitivity: (value: number) => void;
  setWalkSpeed: (value: number) => void;
  setDebugOpen: Dispatch<SetStateAction<boolean>>;
  setDebugWindowOpen: Dispatch<SetStateAction<boolean>>;
  onJoystickPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onJoystickPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onJoystickRelease: () => void;
  setButtonState: Dispatch<SetStateAction<ButtonState>>;
  beginCalibration: () => void;
  resetCalibration: () => void;
  calibrate: () => void;
  calibrateMotion: () => void;
  resetMotionCalibration: () => void;
};

/**
 * Main control surface for the AR experience.
 * It groups the sensor setup, tracking data, movement modes, and calibration tools.
 */
export function Sidebar({
  isMenuOpen,
  onToggleMenu,
  gyroState,
  gyroActive,
  requestPermission,
  worldAnchor,
  tracking,
  relativeToModel,
  distanceToModel,
  sensitivity,
  walkSpeed,
  calibrationAxis,
  calibrationDistance,
  calibrationSamples,
  calibrationSampleCount,
  calibrationReferenceDistance,
  motionCalibration,
  motionCalibrating,
  moveMode,
  joystick,
  setMoveMode,
  setSensitivity,
  setWalkSpeed,
  setDebugOpen,
  setDebugWindowOpen,
  onJoystickPointerDown,
  onJoystickPointerMove,
  onJoystickRelease,
  setButtonState,
  beginCalibration,
  resetCalibration,
  calibrate,
  calibrateMotion,
  resetMotionCalibration,
}: SidebarProps) {
  return (
    <>
      <button
        type="button"
        className={`sidebar__toggle ${isMenuOpen ? 'sidebar__toggle--active' : ''}`}
        onClick={onToggleMenu}
        aria-label={isMenuOpen ? 'Close controls' : 'Open controls'}
        aria-expanded={isMenuOpen}
      >
        <span />
        <span />
        <span />
      </button>

      <aside className={`sidebar ${isMenuOpen ? 'sidebar--open' : ''}`} aria-label="Controls sidebar">
        <div className="sidebar__header">
          <div>
            <p className="sidebar__eyebrow">AR Controls</p>
            <h2 className="sidebar__heading">Navigation Panel</h2>
          </div>
          <span className="sidebar__pill">Live</span>
        </div>

        <div className="sidebar__content">
          {/* Sensor permission panel shown until the gyroscope is ready. */}
          {!gyroActive && (
            <section className="sidebar__panel">
              <h2 className="sidebar__title">Gyroscope</h2>

              <div className="sidebar__actions">
                <button
                  type="button"
                  className="sidebar__btn"
                  onClick={requestPermission}
                  disabled={gyroState === 'requesting'}
                >
                  {gyroState === 'requesting' ? 'Requesting…' : 'Enable Gyro & Motion'}
                </button>
              </div>

              <p className="sidebar__status" data-state={gyroState}>
                {gyroState === 'idle' && 'Gyroscope not active.'}
                {gyroState === 'requesting' && 'Waiting for permission…'}
                {gyroState === 'denied' && 'Permission denied. Allow motion sensors in browser settings.'}
                {gyroState === 'unsupported' && 'Device sensors require HTTPS or localhost. Open the app over HTTPS (for example https://192.168.1.100:5173/) or use localhost.'}
              </p>
            </section>
          )}

          {/* Tracking details and movement mode controls. */}
          <section className="sidebar__panel">
            <div className="sidebar__section-heading">
              <h2 className="sidebar__title">Tracking</h2>
              <button type="button" className="sidebar__btn sidebar__btn--secondary" onClick={calibrate}>
                Calibrate
              </button>
            </div>

            <div className="sidebar__meta">
              <div>Model origin: {worldAnchor.join(', ')}</div>
              <div>Camera: {tracking.x.toFixed(1)}, {tracking.y.toFixed(1)}, {tracking.z.toFixed(1)}</div>
              <div>Relative: {relativeToModel.x.toFixed(1)}, {relativeToModel.y.toFixed(1)}, {relativeToModel.z.toFixed(1)}</div>
              <div>Distance: {distanceToModel.toFixed(2)}</div>
            </div>

            <div className="sidebar__button-grid sidebar__button-grid--compact">
              <button type="button" className="sidebar__btn sidebar__btn--secondary" onClick={() => setMoveMode('off')}>Move Off</button>
              <button type="button" className="sidebar__btn sidebar__btn--secondary" onClick={() => setMoveMode('gyro')}>Gyro Move</button>
              <button type="button" className="sidebar__btn sidebar__btn--secondary" onClick={() => setMoveMode('walk')}>Walk Forward</button>
              <button type="button" className="sidebar__btn sidebar__btn--secondary" onClick={() => setMoveMode('buttons')}>Buttons</button>
            </div>

            <div className="sidebar__control">
              <label htmlFor="sidebar-sensitivity" className="sidebar__label">Sensitivity: {sensitivity.toFixed(1)}</label>
              <input id="sidebar-sensitivity" type="range" min="0.2" max="1.5" step="0.1" value={sensitivity} onChange={(event) => setSensitivity(Number(event.target.value))} />
            </div>

            <div className="sidebar__control">
              <label htmlFor="sidebar-walk-speed" className="sidebar__label">Walk speed (manual): {walkSpeed.toFixed(1)}</label>
              <input id="sidebar-walk-speed" type="range" min="0.2" max="100" step="0.1" value={walkSpeed} onChange={(event) => setWalkSpeed(Number(event.target.value))} />
            </div>
          </section>

          {/* Calibration flow for the walk-based movement model. */}
          <section className="sidebar__panel">
            <h2 className="sidebar__title">Movement calibration</h2>
            <p className="sidebar__hint">
              {calibrationAxis === 'z'
                ? `Calibrating forward travel: move slowly and steadily for about ${calibrationReferenceDistance.toFixed(1)} m, then press again. Only forward motion is counted.`
                : `Press start, take ${calibrationSampleCount} short forward samples of about ${calibrationReferenceDistance.toFixed(1)} m each, then the app will average them and update the walk speed.`}
            </p>
            <p className="sidebar__hint">
              Distance measured: {calibrationDistance.toFixed(2)} m
              <span className="sidebar__hint-pill">({Math.min(calibrationSamples.length, calibrationSampleCount)}/{calibrationSampleCount} samples)</span>
            </p>
            <div className="sidebar__button-grid">
              <button type="button" className="sidebar__btn" onClick={beginCalibration}>{calibrationAxis === 'z' ? 'Mark 0.5 m Forward' : 'Calibrate Forward'}</button>
              <button type="button" className="sidebar__btn sidebar__btn--secondary" onClick={resetCalibration}>Reset calibration</button>
            </div>
          </section>

          {/* Calibration for the accelerometer bias that can skew movement. */}
          <section className="sidebar__panel">
            <h2 className="sidebar__title">Accelerometer calibration</h2>
            <p className="sidebar__hint">
              {motionCalibrating
                ? 'Hold the device still for a moment while the app samples the resting bias.'
                : 'Tap to calibrate accelerometer bias. Keep the device stationary on a flat surface.'}
            </p>
            <p className="sidebar__hint">
              Current bias: x {motionCalibration.xOffset.toFixed(2)} y {motionCalibration.yOffset.toFixed(2)} z {motionCalibration.zOffset.toFixed(2)}
            </p>
            <div className="sidebar__button-grid">
              <button type="button" className="sidebar__btn" onClick={calibrateMotion} disabled={motionCalibrating}>{motionCalibrating ? 'Calibrating…' : 'Calibrate Accelerometer'}</button>
              <button type="button" className="sidebar__btn sidebar__btn--secondary" onClick={resetMotionCalibration}>Reset accelerometer</button>
            </div>
          </section>

          {/* Debug shortcuts for showing the live sensor overlay. */}
          <section className="sidebar__panel">
            <div className="sidebar__button-grid sidebar__button-grid--compact">
              <button type="button" className="sidebar__btn sidebar__btn--secondary" onClick={() => setDebugOpen((value) => !value)}>Toggle Debug</button>
              <button type="button" className="sidebar__btn sidebar__btn--secondary" onClick={() => setDebugWindowOpen(true)}>Open Debug Window</button>
            </div>
          </section>

          {moveMode === 'buttons' && (
            <section className="sidebar__panel">
              <h2 className="sidebar__title">Virtual joystick</h2>
              <div className="sidebar__joystick-row">
                <div
                  role="slider"
                  aria-label="Movement joystick"
                  className="sidebar__joystick"
                  onPointerDown={onJoystickPointerDown}
                  onPointerMove={onJoystickPointerMove}
                  onPointerUp={onJoystickRelease}
                  onPointerCancel={onJoystickRelease}
                >
                  <div className="sidebar__joystick-knob" style={{ transform: `translate(${joystick.x * 28}px, ${joystick.y * 28}px)` }} />
                </div>
                <div className="sidebar__joystick-arrows">
                  <button
                    type="button"
                    className="sidebar__joystick-btn"
                    onPointerDown={() => setButtonState((value) => ({ ...value, up: true }))}
                    onPointerUp={() => setButtonState((value) => ({ ...value, up: false }))}
                    onPointerLeave={() => setButtonState((value) => ({ ...value, up: false }))}
                    onPointerCancel={() => setButtonState((value) => ({ ...value, up: false }))}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="sidebar__joystick-btn"
                    onPointerDown={() => setButtonState((value) => ({ ...value, down: true }))}
                    onPointerUp={() => setButtonState((value) => ({ ...value, down: false }))}
                    onPointerLeave={() => setButtonState((value) => ({ ...value, down: false }))}
                    onPointerCancel={() => setButtonState((value) => ({ ...value, down: false }))}
                  >
                    ↓
                  </button>
                </div>
              </div>
              <p className="sidebar__hint">Drag to move sideways and forward; use the arrows for height.</p>
            </section>
          )}
        </div>
      </aside>
    </>
  );
}
