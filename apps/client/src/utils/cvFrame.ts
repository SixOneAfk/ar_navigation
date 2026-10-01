export const CV_FRAME_WIDTH = 640;
export const CV_FRAME_HEIGHT = 480;
export const CV_FRAME_INTERVAL_MS = 1000;
export const STRUCTURAL_FRAME_INTERVAL_MS = 200;
const JPEG_QUALITY = 0.8;

export type RecalibrationResult = {
  recalibrated: boolean;
  detected_text: string | null;
  confidence: number;
  matched_node_id: string | null;
  marker_position: {
    x: number;
    y: number;
    z: number;
    floor: number;
  } | null;
  candidate_count: number;
  ocr_candidates?: Array<{
    text: string;
    confidence: number;
  }>;
  failure_reason?: string | null;
  cv_horizon_roll_deg?: number | null;
  cv_horizon_confidence?: number;
};

export type PositionEstimate = {
  x: number;
  y: number;
  z: number;
  confidence: number;
  source: string;
};

export type CvScanResponse = {
  status: string;
  source: string;
  receivedAt: string;
  frameId?: string;
  sequenceNumber?: number;
  recalibration: RecalibrationResult;
  markerPosition?: {
    x: number;
    y: number;
    z: number;
    floor: number;
  } | null;
  positionEstimate?: PositionEstimate | null;
  correctionDecision?: {
    mode: 'hard_snap' | 'soft_blend' | 'reject';
    applied: boolean;
    reason: string;
    candidateDistanceM: number;
  };
};

export type NormalizedLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type StructuralLinesResult = {
  detected: boolean;
  floor_boundary: NormalizedLine | null;
  boundary_angle_deg: number | null;
  boundary_confidence: number;
  camera_roll_deg: number | null;
  roll_confidence: number;
  candidate_count: number;
  vertical_candidate_count: number;
  image_width: number;
  image_height: number;
  processing_time_ms: number;
};

export type StructuralLinesResponse = {
  status: string;
  source: string;
  receivedAt: string;
  frameId: string;
  sequenceNumber: number;
  structuralLines: StructuralLinesResult;
};

export type CvScanMetadata = {
  frameId?: string;
  sequenceNumber?: number;
  poseConfidence?: number;
  velocityHintMps?: number;
  devicePitchDeg?: number;
  deviceRollDeg?: number;
  estimatedPosition?: {
    x: number;
    y: number;
    z?: number;
    floor: number;
  };
  deviceHeading?: number;
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
  metadataOrSignal?: CvScanMetadata | AbortSignal,
  signalArg?: AbortSignal,
): Promise<CvScanResponse> {
  // Keep compatibility with existing call sites that pass AbortSignal as third argument.
  const metadata =
    metadataOrSignal instanceof AbortSignal || metadataOrSignal === undefined
      ? undefined
      : metadataOrSignal;
  const signal =
    metadataOrSignal instanceof AbortSignal ? metadataOrSignal : signalArg;

  const response = await fetch('/api/v1/cv/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      timestamp: Date.now(),
      estimated_position: metadata?.estimatedPosition ?? { x: 0, y: 0, z: 0, floor: 1 },
      image_payload: imagePayload,
      device_heading: metadata?.deviceHeading,
      pose_confidence: metadata?.poseConfidence,
      velocity_hint_mps: metadata?.velocityHintMps,
      device_pitch_deg: metadata?.devicePitchDeg,
      device_roll_deg: metadata?.deviceRollDeg,
      frame_id: metadata?.frameId,
      sequence_number: metadata?.sequenceNumber,
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

export async function sendStructuralLineFrame(
  imagePayload: string,
  sessionId: string,
  sequenceNumber: number,
  deviceRollDeg: number | undefined,
  signal?: AbortSignal,
): Promise<StructuralLinesResponse> {
  const frameId = `structural-${sequenceNumber}`;
  const response = await fetch('/api/v1/cv/structural-lines', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      timestamp: Date.now(),
      image_payload: imagePayload,
      device_roll_deg: deviceRollDeg,
      frame_id: frameId,
      sequence_number: sequenceNumber,
    }),
    signal,
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(
      `Gateway returned HTTP ${response.status}${responseText ? `: ${responseText}` : ''}`,
    );
  }

  return (await response.json()) as StructuralLinesResponse;
}
