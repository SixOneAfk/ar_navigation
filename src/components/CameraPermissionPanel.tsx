import { useEffect, useRef, useState } from 'react';

type CameraState = 'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported' | 'insecure' | 'error';

export function CameraPermissionPanel() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

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
    setErrorMessage('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraState('granted');
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
        setCameraState('denied');
        return;
      }

      setCameraState('error');
      setErrorMessage(error instanceof Error ? error.message : 'Unknown camera error');
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraState('idle');
    setErrorMessage('');
  }

  return (
    <>
      <video
        ref={videoRef}
        className="camera-bg"
        autoPlay
        muted
        playsInline
      />

      <section className="camera-panel" style={cameraState === 'granted' ? { display: 'none' } : undefined}>
        <h2 className="camera-panel__title">Camera Access</h2>
        <p className="camera-panel__text">
          Enable camera to place 3-D content over the live video feed.
        </p>

        <div className="camera-panel__actions">
          <button
            type="button"
            className="camera-panel__btn"
            onClick={requestCamera}
            disabled={cameraState === 'requesting' || cameraState === 'granted'}
          >
            {cameraState === 'requesting' ? 'Requesting...' : 'Enable Camera'}
          </button>

          <button
            type="button"
            className="camera-panel__btn camera-panel__btn--secondary"
            onClick={stopCamera}
            disabled={cameraState !== 'granted'}
          >
            Stop Camera
          </button>
        </div>

        <p className="camera-panel__status" data-state={cameraState}>
          {cameraState === 'idle' && 'Camera is not active.'}
          {cameraState === 'requesting' && 'Waiting for browser permission...'}
          {cameraState === 'granted' && 'Camera access granted. Live preview is active.'}
          {cameraState === 'denied' && 'Camera permission denied. Allow access in browser site settings.'}
          {cameraState === 'unsupported' && 'This browser does not support camera capture APIs.'}
          {cameraState === 'insecure' && 'Camera requires HTTPS or localhost. Open the app from a secure origin.'}
          {cameraState === 'error' && `Camera error: ${errorMessage}`}
        </p>
      </section>
    </>
  );
}
