export const CV_FRAME_WIDTH = 640;
export const CV_FRAME_HEIGHT = 480;
export const CV_FRAME_INTERVAL_MS = 1000;
const JPEG_QUALITY = 0.8;

export type RecalibrationResult = {
  recalibrated: boolean;
  detected_text: string | null;
  confidence: number;
  matched_node_id: string | null;
  candidate_count: number;
};

export type CvScanResponse = {
  status: string;
  source: string;
  receivedAt: string;
  recalibration: RecalibrationResult;
};

function renderJpegFrame(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  canvas: HTMLCanvasElement,
): string {
  canvas.width = CV_FRAME_WIDTH;
  canvas.height = CV_FRAME_HEIGHT;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context is unavailable');
  }

  const targetAspect = CV_FRAME_WIDTH / CV_FRAME_HEIGHT;
  const sourceAspect = sourceWidth / sourceHeight;
  let sourceX = 0;
  let sourceY = 0;
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;

  if (sourceAspect > targetAspect) {
    cropWidth = sourceHeight * targetAspect;
    sourceX = (sourceWidth - cropWidth) / 2;
  } else if (sourceAspect < targetAspect) {
    cropHeight = sourceWidth / targetAspect;
    sourceY = (sourceHeight - cropHeight) / 2;
  }

  context.drawImage(
    source,
    sourceX,
    sourceY,
    cropWidth,
    cropHeight,
    0,
    0,
    CV_FRAME_WIDTH,
    CV_FRAME_HEIGHT,
  );

  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

export function captureJpegFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): string | null {
  if (
    video.readyState < 2 ||
    video.videoWidth === 0 ||
    video.videoHeight === 0
  ) {
    return null;
  }

  return renderJpegFrame(video, video.videoWidth, video.videoHeight, canvas);
}

export function captureImageJpeg(
  image: HTMLImageElement,
  canvas: HTMLCanvasElement,
): string {
  if (image.naturalWidth === 0 || image.naturalHeight === 0) {
    throw new Error('Selected image has no pixel data');
  }

  return renderJpegFrame(
    image,
    image.naturalWidth,
    image.naturalHeight,
    canvas,
  );
}

export async function sendCvFrame(
  imagePayload: string,
  sessionId: string,
  signal?: AbortSignal,
): Promise<CvScanResponse> {
  const response = await fetch('/api/v1/cv/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      timestamp: Date.now(),
      estimated_position: { x: 0, y: 0, floor: 1 },
      image_payload: imagePayload,
    }),
    signal,
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(
      `Gateway returned HTTP ${response.status}${responseText ? `: ${responseText}` : ''}`,
    );
  }

  return (await response.json()) as CvScanResponse;
}
