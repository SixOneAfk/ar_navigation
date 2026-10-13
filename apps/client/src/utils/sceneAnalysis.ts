import type { NormalizedPoint } from './cvFrame';

export const SCENE_FRAME_INTERVAL_MS = 1000;
export const SCENE_OVERLAY_MAX_AGE_MS = 3000;

export type SceneDetection = {
  kind: 'object' | 'text';
  label: string;
  confidence: number;
  polygon: NormalizedPoint[];
};

export type SceneAnalysisResult = {
  status: 'ready' | 'partial' | 'busy';
  detector_status: 'ready' | 'unavailable' | 'busy';
  text_status: 'ready' | 'unavailable' | 'disabled' | 'busy';
  model_name: string;
  vocabulary_size: number;
  detections: SceneDetection[];
  messages: string[];
  image_width: number;
  image_height: number;
  object_time_ms: number;
  text_time_ms: number;
  processing_time_ms: number;
  diagnostic_only: boolean;
};

export function isSceneResultFresh(capturedAt: number, now: number): boolean {
  const age = now - capturedAt;
  return Number.isFinite(age) && age >= 0 && age <= SCENE_OVERLAY_MAX_AGE_MS;
}

export function sceneDetectionLabel(detection: SceneDetection): string {
  const label = `${detection.kind === 'text' ? 'Text: ' : ''}${detection.label}`;
  return `${label.length > 42 ? `${label.slice(0, 39)}...` : label} ${Math.round(detection.confidence * 100)}%`;
}

export async function sendSceneAnalysisFrame(
  imagePayload: string,
  sequenceNumber: number,
  minimumConfidence: number,
  includeText: boolean,
  signal: AbortSignal,
): Promise<SceneAnalysisResult> {
  const response = await fetch('/api/v1/cv/scene-analysis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_payload: imagePayload,
      sequence_number: sequenceNumber,
      minimum_confidence: minimumConfidence,
      include_text: includeText,
    }),
    signal,
  });
  if (!response.ok) {
    throw new Error(`Scene analysis returned HTTP ${response.status}`);
  }
  const body = await response.json() as { sceneAnalysis: SceneAnalysisResult };
  return body.sceneAnalysis;
}
