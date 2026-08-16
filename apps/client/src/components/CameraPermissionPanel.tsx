import { useEffect, useRef, useState } from 'react';
import {
  captureImageJpeg,
  captureJpegFrame,
  CV_FRAME_HEIGHT,
  CV_FRAME_INTERVAL_MS,
  CV_FRAME_WIDTH,
  type RecalibrationResult,
  sendCvFrame,
} from '../utils/cvFrame';

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

type CameraPermissionPanelProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function CameraPermissionPanel({
  isOpen,
  onClose,
}: CameraPermissionPanelProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureTimerRef = useRef<number | null>(null);
  const scanInFlightRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef(`camera-${Date.now()}`);

  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [scanResult, setScanResult] = useState<RecalibrationResult | null>(
    null,
  );
  const [framesProcessed, setFramesProcessed] = useState(0);
  const [framePreview, setFramePreview] = useState<string | null>(null);
  const [frameLabel, setFrameLabel] = useState('');
  const [processingTimeMs, setProcessingTimeMs] = useState<number | null>(null);

  const confidencePercent = scanResult
    ? Math.round(scanResult.confidence * 100)
    : 0;

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
      setScanResult(response.recalibration);
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

    await submitFrame(imagePayload, 'Live camera frame');
  }

  function startFrameCapture() {
    stopFrameCapture();
    void captureAndSendFrame();
    captureTimerRef.current = window.setInterval(() => {
      void captureAndSendFrame();
    }, CV_FRAME_INTERVAL_MS);
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
              'Camera active. Sending one 640x480 JPEG frame per second.'}
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
                  scanResult?.recalibrated &&
                  `Marker ${scanResult.matched_node_id} detected (${Math.round(scanResult.confidence * 100)}%).`}
                {scanState === 'success' &&
                  !scanResult?.recalibrated &&
                  'No known marker detected.'}
                {scanState === 'error' && `Scan error: ${errorMessage}`}
              </p>
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
