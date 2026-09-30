import { useEffect, useState } from 'react';
import type { HeadingData, Orientation } from '../hooks/useGyroscope';

type CompassWidgetProps = {
  headingRef: React.RefObject<HeadingData>;
  orientationRef: React.RefObject<Orientation>;
  enabled: boolean;
  isOpen?: boolean;
  onToggle?: () => void;
};

const EMPTY_HEADING: HeadingData = {
  rawGyroHeadingDeg: 0,
  rawCompassHeadingDeg: null,
  fusedHeadingDeg: 0,
  hasCompass: false,
  confidence: 0,
  timestamp: 0,
};

/**
 * Lightweight overlay that polls the latest heading ref and renders
 * independent gyro and compass signals for real-time diagnostics.
 */
export function CompassWidget({ headingRef, orientationRef, enabled, isOpen = true, onToggle }: CompassWidgetProps) {
  const [heading, setHeading] = useState<HeadingData>(EMPTY_HEADING);
  const [rollDeg, setRollDeg] = useState(0);
  const [horizonOffsetDeg, setHorizonOffsetDeg] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHeading(headingRef.current ?? EMPTY_HEADING);
    }, 120);

    return () => window.clearInterval(timer);
  }, [headingRef]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      // Gamma is right/left tilt in degrees: + means tilt to the right, - to the left.
      const nextRoll = orientationRef.current?.gamma ?? 0;
      setRollDeg(nextRoll);
    }, 120);

    return () => window.clearInterval(timer);
  }, [orientationRef]);

  const normalizedGyroControlHeading = ((heading.fusedHeadingDeg % 360) + 360) % 360;
  const normalizedGyro = ((heading.rawGyroHeadingDeg % 360) + 360) % 360;
  const normalizedCompass =
    heading.rawCompassHeadingDeg === null
      ? null
      : ((heading.rawCompassHeadingDeg % 360) + 360) % 360;
  const needleRotation = -normalizedGyroControlHeading;
  const confidencePct = Math.round(Math.max(0, Math.min(1, heading.confidence)) * 100);
  const confidenceTone =
    confidencePct >= 70
      ? 'high'
      : confidencePct >= 35
        ? 'medium'
        : 'low';
  const calibratedRollDeg = rollDeg - horizonOffsetDeg;
  const clampedRoll = Math.max(-45, Math.min(45, calibratedRollDeg));
  const signedRollText = `${calibratedRollDeg >= 0 ? '+' : ''}${calibratedRollDeg.toFixed(1)} deg`;

  if (!isOpen) {
    return (
      <section className="compass-widget compass-widget--collapsed" aria-label="Compass">
        <button type="button" className="compass-widget__collapse-toggle" onClick={onToggle} aria-expanded={false}>
          <span aria-hidden="true">▸</span> Compass
        </button>
      </section>
    );
  }

  return (
    <section className="compass-widget" aria-live="polite" data-confidence={confidenceTone}>
      <button type="button" className="compass-widget__collapse-toggle compass-widget__title" onClick={onToggle} aria-expanded={true}>
        <span aria-hidden="true">▾</span> Compass
      </button>
      <div className="compass-widget__dial" aria-label="Compass dial">
        <span className="compass-widget__north">N</span>
        <span className="compass-widget__east">E</span>
        <span className="compass-widget__south">S</span>
        <span className="compass-widget__west">W</span>
        <span
          className="compass-widget__needle"
          style={{ transform: `translateX(-50%) rotate(${needleRotation.toFixed(2)}deg)` }}
        />
        <span className="compass-widget__center" />
      </div>

      {!enabled && <p className="compass-widget__status">Enable gyro to start heading updates.</p>}

      <div className="compass-widget__readout">
        <span>Control heading (gyro)</span>
        <strong>{normalizedGyroControlHeading.toFixed(1)} deg</strong>
      </div>
      <div className="compass-widget__readout">
        <span>Gyro</span>
        <strong>{normalizedGyro.toFixed(1)} deg</strong>
      </div>
      <div className="compass-widget__readout">
        <span>Compass</span>
        <strong>{normalizedCompass === null ? 'N/A' : `${normalizedCompass.toFixed(1)} deg`}</strong>
      </div>

      <div className="horizon-widget" aria-label="Gyroscope horizon">
        <div className="horizon-widget__window">
          <span
            className="horizon-widget__line"
            style={{ transform: `translate(-50%, -50%) rotate(${clampedRoll.toFixed(1)}deg)` }}
          />
          <span className="horizon-widget__center" />
        </div>
        <div className="horizon-widget__readout">
          <span>Horizon tilt</span>
          <strong>{signedRollText}</strong>
        </div>
        <div className="horizon-widget__actions">
          <button
            type="button"
            className="horizon-widget__btn"
            onClick={() => setHorizonOffsetDeg(rollDeg)}
            disabled={!enabled}
          >
            Calibrate 0 deg
          </button>
          <button
            type="button"
            className="horizon-widget__btn horizon-widget__btn--secondary"
            onClick={() => setHorizonOffsetDeg(0)}
          >
            Reset
          </button>
        </div>
        <p className="horizon-widget__hint">0 deg means aligned with horizon.</p>
      </div>

      <div className="compass-widget__confidence" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={confidencePct}>
        <span style={{ width: `${confidencePct}%` }} />
      </div>
      <p className="compass-widget__confidence-label">Confidence: {confidencePct}%</p>
    </section>
  );
}
