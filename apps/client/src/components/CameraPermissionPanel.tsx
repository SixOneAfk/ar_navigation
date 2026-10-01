import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  captureImageJpeg,
  captureJpegFrame,
  CV_FRAME_HEIGHT,
  STRUCTURAL_FRAME_INTERVAL_MS,
  CV_FRAME_WIDTH,
  type CvScanResponse,
  type RecalibrationResult,
  type StructuralLinesResult,
  sendCvFrame,
  sendStructuralLineFrame,
} from '../utils/cvFrame';
import { StructuralLineOverlay } from './StructuralLineOverlay';
import type { ModelSceneFrame } from '../navigation/navigationData';
import {
  selectWallReference,
  type CameraPoseSnapshot,
  type WallReference,
} from '../utils/wallReferences';

type CameraState =
  | 'idle'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'unsupported'
  | 'insecure'
  | 'unavailable'
  | 'error';
type ScanState = 'idle' | 'sending' | 'success' | 'error';
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const DEMO_IMAGE_URL = '/demo-room-101.svg';
const MIN_ROLL_CONFIDENCE = 0.65;

function poseFailureMessage(reason: string | null | undefined): string {
  switch (reason) {
    case 'wall_outline_not_detected':
      return 'Keep the complete wall visible, including its top and both sides.';
    case 'wall_reference_not_selected':
      return 'No model wall matches the current navigation view.';
    case 'camera_intrinsics_not_available':
      return 'Camera calibration is unavailable.';
    case 'estimated_position_not_available':
      return 'The navigation position is unavailable.';
    case 'wall_reference_requires_four_corners':
      return 'The selected model wall has incomplete geometry.';
    case 'wall_reference_is_not_planar':
      return 'The selected model wall is not planar.';
    case 'pose_solution_behind_camera':
    case 'pose_solution_not_found':
    case 'pose_solver_failed':
      return 'No physically valid camera position was found.';
    default:
      return reason
        ? reason.split('_').join(' ')
        : 'Waiting for a complete wall outline.';
  }
}

type CameraPermissionPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  onMarkerPositionResolved?: (payload: {
    x: number;
    y: number;
    z: number;
    floor: number;
    markerId: string;
  }) => void;
  orientationRef?: RefObject<{ gamma: number }>;
  onHorizonCorrectionResolved?: (payload: {
    cameraRollDeg: number;
    confidence: number;
  }) => void;
  modelFrame?: ModelSceneFrame | null;
  cameraPoseRef?: RefObject<CameraPoseSnapshot>;
  wallReferences?: WallReference[];
  wallReferenceError?: string | null;
};

export function CameraPermissionPanel({
  isOpen,
  onClose,
  onMarkerPositionResolved,
  orientationRef,
  onHorizonCorrectionResolved,
  modelFrame,
  cameraPoseRef,
  wallReferences = [],
  wallReferenceError = null,
}: CameraPermissionPanelProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureTimerRef = useRef<number | null>(null);
  const scanInFlightRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef(`camera-${Date.now()}`);
  const sequenceNumberRef = useRef(0);
  const rollSamplesRef = useRef<
    Array<{ value: number; confidence: number; timestamp: number }>
  >([]);

  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [scanResult, setScanResult] = useState<RecalibrationResult | null>(
    null,
  );
  const [scanEnvelope, setScanEnvelope] = useState<CvScanResponse | null>(null);
  const [structuralResult, setStructuralResult] =
    useState<StructuralLinesResult | null>(null);
  const [framesProcessed, setFramesProcessed] = useState(0);
  const [framePreview, setFramePreview] = useState<string | null>(null);
  const [frameLabel, setFrameLabel] = useState('');
  const [processingTimeMs, setProcessingTimeMs] = useState<number | null>(null);
  const [horizontalFovDeg, setHorizontalFovDeg] = useState(60);

  const confidencePercent = scanResult
    ? Math.round(scanResult.confidence * 100)
    : 0;
  const diagnosticPose = structuralResult?.pose_estimate ?? null;
  const navigationPosition = diagnosticPose
    ? {
        x: diagnosticPose.position.x - diagnosticPose.delta.x,
        y: diagnosticPose.position.y - diagnosticPose.delta.y,
        z: diagnosticPose.position.z - diagnosticPose.delta.z,
      }
    : null;


  useEffect(() => {
    return () => {
      stopFrameCapture();
      stopMediaStream();
    };
  }, []);

  function stopMediaStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  function stopFrameCapture() {
    if (captureTimerRef.current !== null) {
      window.clearInterval(captureTimerRef.current);
      captureTimerRef.current = null;
    }

    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    scanInFlightRef.current = false;
    rollSamplesRef.current = [];
  }

  function loadImage(source: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Unable to load selected image'));
      image.src = source;
    });
  }

  async function submitFrame(imagePayload: string, label: string) {
    if (scanInFlightRef.current) {
      return;
    }

    scanInFlightRef.current = true;
    setFramePreview(imagePayload);
    setFrameLabel(label);
    setScanState('sending');
    const startedAt = performance.now();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await sendCvFrame(
        imagePayload,
        sessionIdRef.current,
        abortController.signal,
      );
      setScanEnvelope(response);
      setScanResult(response.recalibration);
      const markerPosition =
        response.markerPosition ?? response.recalibration.marker_position;
      if (
        markerPosition &&
        response.recalibration.recalibrated &&
        response.recalibration.matched_node_id
      ) {
        onMarkerPositionResolved?.({
          ...markerPosition,
          markerId: response.recalibration.matched_node_id,
        });
      }
      setFramesProcessed((current) => current + 1);
      setProcessingTimeMs(Math.round(performance.now() - startedAt));
      setScanState('success');
      setErrorMessage('');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      setScanState('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'CV scan failed',
      );
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
      scanInFlightRef.current = false;
    }
  }

  function resolveStableRoll(result: StructuralLinesResult) {
    const value = result.camera_roll_deg;
    const confidence = result.roll_confidence;
    const now = performance.now();
    rollSamplesRef.current = rollSamplesRef.current.filter(
      (sample) => now - sample.timestamp <= 1200,
    );

    if (
      typeof value !== 'number'
      || !Number.isFinite(value)
      || confidence < MIN_ROLL_CONFIDENCE
    ) {
      rollSamplesRef.current = [];
      return;
    }

    rollSamplesRef.current.push({ value, confidence, timestamp: now });
    rollSamplesRef.current = rollSamplesRef.current.slice(-5);
    if (rollSamplesRef.current.length < 3) {
      return;
    }

    const values = rollSamplesRef.current.map((sample) => sample.value);
    if (Math.max(...values) - Math.min(...values) > 3) {
      rollSamplesRef.current = rollSamplesRef.current.slice(-1);
      return;
    }

    const totalWeight = rollSamplesRef.current.reduce(
      (sum, sample) => sum + sample.confidence,
      0,
    );
    const cameraRollDeg = rollSamplesRef.current.reduce(
      (sum, sample) => sum + (sample.value * sample.confidence),
      0,
    ) / totalWeight;
    const stableConfidence = totalWeight / rollSamplesRef.current.length;
    onHorizonCorrectionResolved?.({
      cameraRollDeg,
      confidence: stableConfidence,
    });
  }

  async function submitStructuralFrame(imagePayload: string) {
    if (scanInFlightRef.current) {
      return;
    }

    scanInFlightRef.current = true;
    const sequenceNumber = sequenceNumberRef.current + 1;
    sequenceNumberRef.current = sequenceNumber;
    if (sequenceNumber === 1) {
      setScanState('sending');
    }
    const startedAt = performance.now();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const cameraPose = cameraPoseRef?.current;
      const selectedWall = modelFrame && cameraPose
        ? selectWallReference(wallReferences, modelFrame, cameraPose)
        : null;
      const response = await sendStructuralLineFrame(
        imagePayload,
        sessionIdRef.current,
        sequenceNumber,
        {
          deviceRollDeg: orientationRef?.current?.gamma,
          estimatedPosition: cameraPose?.position,
          wallReference: selectedWall
            ? {
              id: selectedWall.id,
              corners: selectedWall.corners,
            }
            : undefined,
          referenceConfidence: selectedWall?.confidence,
          horizontalFovDeg,
          intrinsicsConfidence: 0.35,
        },
        abortController.signal,
      );
      setStructuralResult(response.structuralLines);
      resolveStableRoll(response.structuralLines);
      setFramesProcessed((current) => current + 1);
      setProcessingTimeMs(Math.round(performance.now() - startedAt));
      setScanState('success');
      setErrorMessage('');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      setScanState('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'Structural line scan failed',
      );
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
      scanInFlightRef.current = false;
    }
  }

  async function captureAndSendFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || scanInFlightRef.current) {
      return;
    }

    let imagePayload: string | null;
    try {
      imagePayload = captureJpegFrame(video, canvas);
    } catch (error) {
      setScanState('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'Frame capture failed',
      );
      return;
    }

    if (!imagePayload) {
      return;
    }

    await submitStructuralFrame(imagePayload);
  }

  function startFrameCapture() {
    stopFrameCapture();
    void captureAndSendFrame();
    captureTimerRef.current = window.setInterval(() => {
      void captureAndSendFrame();
    }, STRUCTURAL_FRAME_INTERVAL_MS);
  }

  async function requestCamera() {
    if (!window.isSecureContext) {
      setCameraState('insecure');
      setErrorMessage('');
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraState('unsupported');
      return;
    }

    setCameraState('requesting');
    setFramePreview(null);
    setFrameLabel('');
    setScanResult(null);
    setScanEnvelope(null);
    setStructuralResult(null);
    sequenceNumberRef.current = 0;
    rollSamplesRef.current = [];
    setFramesProcessed(0);
    setProcessingTimeMs(null);
    setErrorMessage('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: CV_FRAME_WIDTH },
          height: { ideal: CV_FRAME_HEIGHT },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraState('granted');
      startFrameCapture();
    } catch (error) {
      stopFrameCapture();
      stopMediaStream();
      if (
        error instanceof DOMException &&
        (error.name === 'NotAllowedError' || error.name === 'SecurityError')
      ) {
        setCameraState('denied');
        return;
      }

      if (
        error instanceof DOMException &&
        (error.name === 'NotFoundError' ||
          error.name === 'DevicesNotFoundError')
      ) {
        setCameraState('unavailable');
        setErrorMessage('');
        return;
      }

      setCameraState('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'Unknown camera error',
      );
    }
  }

  async function processStillImage(source: string, label: string) {
    stopFrameCapture();
    stopMediaStream();
    setCameraState('idle');
    setScanResult(null);
    setScanEnvelope(null);
    setStructuralResult(null);
    setFramesProcessed(0);
    setProcessingTimeMs(null);
    setErrorMessage('');
    setScanState('sending');

    try {
      const image = await loadImage(source);
      const canvas = canvasRef.current;
      if (!canvas) {
        throw new Error('Capture canvas is unavailable');
      }
      const imagePayload = captureImageJpeg(image, canvas);
      await submitFrame(imagePayload, label);
    } catch (error) {
      setScanState('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'Image processing failed',
      );
    }
  }

  async function handleImageFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setScanState('error');
      setErrorMessage('Select an image file');
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setScanState('error');
      setErrorMessage('Image file must be 10 MB or smaller');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    try {
      await processStillImage(objectUrl, file.name);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function stopCamera() {
    stopFrameCapture();
    stopMediaStream();
    setCameraState('idle');
    setScanState('idle');
    setScanResult(null);
    setScanEnvelope(null);
    setStructuralResult(null);
    setFramesProcessed(0);
    setFramePreview(null);
    setFrameLabel('');
    setProcessingTimeMs(null);
    setErrorMessage('');
  }

  return (
    <>
      <video ref={videoRef} className="camera-bg" autoPlay muted playsInline />
      {framePreview && cameraState !== 'granted' && (
        <img className="camera-bg" src={framePreview} alt="Uploaded CV frame" />
      )}
      <canvas ref={canvasRef} className="camera-capture" aria-hidden="true" />
      <StructuralLineOverlay
        videoRef={videoRef}
        result={structuralResult}
        active={cameraState === 'granted'}
      />

      {isOpen && (
        <section className="camera-panel">
          <h2 className="camera-panel__title">Camera and CV Demo</h2>
          <button
            type="button"
            className="panel-close-btn"
            onClick={onClose}
            aria-label="Close camera panel"
          >
            Close
          </button>
          <p className="camera-panel__text">
            Use a live camera or upload an image to run the complete CV flow.
          </p>

          <div className="camera-panel__actions">
            <button
              type="button"
              className="camera-panel__btn"
              onClick={requestCamera}
              disabled={
                cameraState === 'requesting' || cameraState === 'granted'
              }
            >
              {cameraState === 'requesting' ? 'Requesting...' : 'Enable Camera'}
            </button>

            <button
              type="button"
              className="camera-panel__btn camera-panel__btn--secondary"
              onClick={stopCamera}
              disabled={cameraState !== 'granted' && !framePreview}
            >
              {cameraState === 'granted' ? 'Stop Camera' : 'Clear Image'}
            </button>
          </div>

          <div className="camera-panel__file-actions">
            <button
              type="button"
              className="camera-panel__btn camera-panel__btn--secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={scanState === 'sending'}
            >
              Upload Image
            </button>
            <button
              type="button"
              className="camera-panel__btn camera-panel__btn--demo"
              onClick={() =>
                void processStillImage(
                  DEMO_IMAGE_URL,
                  'Built-in ROOM 101 marker',
                )
              }
              disabled={scanState === 'sending'}
            >
              Use Demo Image
            </button>
            <input
              ref={fileInputRef}
              className="camera-panel__file-input"
              type="file"
              accept="image/*"
              onChange={(event) => void handleImageFile(event)}
            />
          </div>

          <p className="camera-panel__status" data-state={cameraState}>
            {cameraState === 'idle' && 'Camera is not active.'}
            {cameraState === 'requesting' &&
              'Waiting for browser permission...'}
            {cameraState === 'granted' &&
              'Camera active. Tracking structural lines at up to 5 FPS.'}
            {cameraState === 'denied' &&
              'Camera permission denied. Allow access in browser site settings.'}
            {cameraState === 'unsupported' &&
              'This browser does not support camera capture APIs.'}
            {cameraState === 'insecure' &&
              'Camera requires HTTPS or localhost. Open the app from a secure origin.'}
            {cameraState === 'unavailable' &&
              'No camera device is available. Use an uploaded or demo image instead.'}
            {cameraState === 'error' && `Camera error: ${errorMessage}`}
          </p>

          {(cameraState === 'granted' ||
            framePreview ||
            scanState === 'error') && (
            <div className="camera-panel__scan" aria-live="polite">
              {framePreview && (
                <figure className="camera-panel__preview">
                  <img src={framePreview} alt="Frame sent to the CV service" />
                  <figcaption>{frameLabel}</figcaption>
                </figure>
              )}
              <p className="camera-panel__scan-status" data-state={scanState}>
                {scanState === 'idle' && 'Waiting for the first video frame.'}
                {scanState === 'sending' && 'Processing frame...'}
                {scanState === 'success' &&
                  cameraState === 'granted' &&
                  structuralResult?.detected &&
                  `Floor boundary detected (${Math.round(structuralResult.boundary_confidence * 100)}%).`}
                {scanState === 'success' &&
                  cameraState === 'granted' &&
                  !structuralResult?.detected &&
                  'No stable floor boundary detected.'}
                {scanState === 'success' &&
                  cameraState !== 'granted' &&
                  scanResult?.recalibrated &&
                  `Marker ${scanResult.matched_node_id} detected (${Math.round(scanResult.confidence * 100)}%).`}
                {scanState === 'success' &&
                  cameraState !== 'granted' &&
                  !scanResult?.recalibrated &&
                  'No known marker detected.'}
                {scanState === 'error' && `Scan error: ${errorMessage}`}
              </p>
              {structuralResult && cameraState === 'granted' && (
                <>
                  <div className="camera-panel__result camera-panel__result--pose">
                    <div className="camera-panel__confidence-label">
                      <span>CV position estimate</span>
                      <strong>
                        {diagnosticPose
                          ? `${Math.round(diagnosticPose.confidence * 100)}%`
                          : 'Pending'}
                      </strong>
                    </div>
                    {diagnosticPose && navigationPosition ? (
                      <>
                        <div
                          className="camera-panel__confidence-track"
                          role="progressbar"
                          aria-label="CV position confidence"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(
                            diagnosticPose.confidence * 100,
                          )}
                        >
                          <span
                            style={{
                              width: `${Math.round(diagnosticPose.confidence * 100)}%`,
                            }}
                          />
                        </div>
                        <dl className="camera-panel__result-grid">
                          <div>
                            <dt>CV position</dt>
                            <dd>
                              X {diagnosticPose.position.x.toFixed(2)} / Y{' '}
                              {diagnosticPose.position.y.toFixed(2)} / Z{' '}
                              {diagnosticPose.position.z.toFixed(2)} m
                            </dd>
                          </div>
                          <div>
                            <dt>Navigation/PDR</dt>
                            <dd>
                              X {navigationPosition.x.toFixed(2)} / Y{' '}
                              {navigationPosition.y.toFixed(2)} / Z{' '}
                              {navigationPosition.z.toFixed(2)} m
                            </dd>
                          </div>
                          <div>
                            <dt>Horizontal deviation</dt>
                            <dd>
                              {diagnosticPose.delta.horizontal_m.toFixed(2)} m
                            </dd>
                          </div>
                          <div>
                            <dt>3D deviation</dt>
                            <dd>{diagnosticPose.delta.distance_m.toFixed(2)} m</dd>
                          </div>
                          <div>
                            <dt>Selected wall</dt>
                            <dd>{structuralResult.selected_wall_id ?? 'None'}</dd>
                          </div>
                          <div>
                            <dt>Wall distance</dt>
                            <dd>{diagnosticPose.distance_to_wall_m.toFixed(2)} m</dd>
                          </div>
                          <div>
                            <dt>Reprojection error</dt>
                            <dd>
                              {diagnosticPose.reprojection_error_px.toFixed(2)} px
                            </dd>
                          </div>
                          <div>
                            <dt>Method</dt>
                            <dd>{diagnosticPose.method}</dd>
                          </div>
                        </dl>
                        <p className="camera-panel__diagnostic-note">
                          Diagnostic only. The navigation position is not being
                          corrected.
                        </p>
                      </>
                    ) : (
                      <p
                        className="camera-panel__diagnostic-note"
                        data-state="pending"
                      >
                        {poseFailureMessage(structuralResult.pose_failure_reason)}
                      </p>
                    )}
                    {wallReferenceError && (
                      <p
                        className="camera-panel__diagnostic-note"
                        data-state="error"
                      >
                        {wallReferenceError}
                      </p>
                    )}
                  </div>

                  <details className="camera-panel__diagnostics">
                    <summary>Structural diagnostics</summary>
                    <div className="camera-panel__result">
                  <div className="camera-panel__confidence-label">
                    <span>Floor boundary confidence</span>
                    <strong>
                      {Math.round(structuralResult.boundary_confidence * 100)}%
                    </strong>
                  </div>
                  <div
                    className="camera-panel__confidence-track"
                    role="progressbar"
                    aria-label="Floor boundary confidence"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(
                      structuralResult.boundary_confidence * 100,
                    )}
                  >
                    <span
                      style={{
                        width: `${Math.round(structuralResult.boundary_confidence * 100)}%`,
                      }}
                    />
                  </div>
                  <dl className="camera-panel__result-grid">
                    <div>
                      <dt>Boundary angle</dt>
                      <dd>
                        {structuralResult.boundary_angle_deg === null
                          ? 'N/A'
                          : `${structuralResult.boundary_angle_deg.toFixed(1)} deg`}
                      </dd>
                    </div>
                    <div>
                      <dt>Camera roll</dt>
                      <dd>
                        {structuralResult.camera_roll_deg === null
                          ? 'N/A'
                          : `${structuralResult.camera_roll_deg.toFixed(1)} deg`}
                      </dd>
                    </div>
                    <div>
                      <dt>Roll confidence</dt>
                      <dd>
                        {Math.round(structuralResult.roll_confidence * 100)}%
                      </dd>
                    </div>
                    <div>
                      <dt>Wall outline confidence</dt>
                      <dd>
                        {Math.round(
                          (structuralResult.wall_confidence ?? 0) * 100,
                        )}
                        %
                      </dd>
                    </div>
                    <div>
                      <dt>Wall candidates</dt>
                      <dd>{structuralResult.wall_candidate_count ?? 0}</dd>
                    </div>
                    <div>
                      <dt>Line candidates</dt>
                      <dd>{structuralResult.candidate_count}</dd>
                    </div>
                    <div>
                      <dt>Vertical candidates</dt>
                      <dd>{structuralResult.vertical_candidate_count}</dd>
                    </div>
                    <div>
                      <dt>CV processing</dt>
                      <dd>{structuralResult.processing_time_ms.toFixed(1)} ms</dd>
                    </div>
                    <div>
                      <dt>Round trip</dt>
                      <dd>
                        {processingTimeMs === null
                          ? 'N/A'
                          : `${processingTimeMs} ms`}
                      </dd>
                    </div>
                  </dl>
                  <label
                    className="camera-panel__calibration-control"
                    htmlFor="camera-horizontal-fov"
                  >
                    <span>Camera horizontal FOV: {horizontalFovDeg} deg</span>
                    <input
                      id="camera-horizontal-fov"
                      type="range"
                      min={40}
                      max={90}
                      step={1}
                      value={horizontalFovDeg}
                      onChange={(event) =>
                        setHorizontalFovDeg(Number(event.target.value))
                      }
                    />
                  </label>
                  <p className="camera-panel__diagnostic-note">
                    Set the calibrated horizontal FOV for metric distance
                    accuracy.
                  </p>
                </div>
              </details>
            </>
              )}
              {scanResult && (
                <div className="camera-panel__result">
                  <div className="camera-panel__confidence-label">
                    <span>OCR match confidence</span>
                    <strong>{confidencePercent}%</strong>
                  </div>
                  <div
                    className="camera-panel__confidence-track"
                    role="progressbar"
                    aria-label="OCR match confidence"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={confidencePercent}
                  >
                    <span style={{ width: `${confidencePercent}%` }} />
                  </div>
                  <dl className="camera-panel__result-grid">
                    <div>
                      <dt>Detected</dt>
                      <dd>{scanResult.detected_text ?? 'None'}</dd>
                    </div>
                    <div>
                      <dt>Node</dt>
                      <dd>{scanResult.matched_node_id ?? 'None'}</dd>
                    </div>
                    <div>
                      <dt>Candidates</dt>
                      <dd>{scanResult.candidate_count}</dd>
                    </div>
                    <div>
                      <dt>Processing</dt>
                      <dd>
                        {processingTimeMs === null
                          ? '—'
                          : `${processingTimeMs} ms`}
                      </dd>
                    </div>
                    <div>
                      <dt>Correction</dt>
                      <dd>{scanEnvelope?.correctionDecision?.mode ?? 'N/A'}</dd>
                    </div>
                    <div>
                      <dt>Decision</dt>
                      <dd>
                        {scanEnvelope?.correctionDecision?.applied
                          ? 'Applied'
                          : scanEnvelope?.correctionDecision
                            ? 'Rejected'
                            : 'N/A'}
                      </dd>
                    </div>
                    <div>
                      <dt>Reason</dt>
                      <dd>{scanEnvelope?.correctionDecision?.reason ?? 'N/A'}</dd>
                    </div>
                    <div>
                      <dt>Distance Gate</dt>
                      <dd>
                        {scanEnvelope?.correctionDecision?.candidateDistanceM === undefined
                          ? 'N/A'
                          : `${scanEnvelope.correctionDecision.candidateDistanceM.toFixed(2)} m`}
                      </dd>
                    </div>
                    <div>
                      <dt>CV Horizon</dt>
                      <dd>
                        {typeof scanResult.cv_horizon_roll_deg === 'number'
                          ? `${scanResult.cv_horizon_roll_deg.toFixed(1)} deg`
                          : 'N/A'}
                      </dd>
                    </div>
                    <div>
                      <dt>CV Horizon Conf</dt>
                      <dd>
                        {typeof scanResult.cv_horizon_confidence === 'number'
                          ? `${Math.round(scanResult.cv_horizon_confidence * 100)}%`
                          : 'N/A'}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}
              <p className="camera-panel__scan-count">
                Frames processed: {framesProcessed}
              </p>
            </div>
          )}
        </section>
      )}
    </>
  );
}
