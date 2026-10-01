import { useEffect, useRef, type RefObject } from 'react';
import {
  CV_FRAME_HEIGHT,
  CV_FRAME_WIDTH,
  type NormalizedLine,
  type StructuralLinesResult,
} from '../utils/cvFrame';

type Point = {
  x: number;
  y: number;
};

type Size = {
  width: number;
  height: number;
};

type StructuralLineOverlayProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  result: StructuralLinesResult | null;
  active: boolean;
};

export function mapCapturedPointToCover(
  point: Point,
  source: Size,
  viewport: Size,
): Point {
  const captureAspect = CV_FRAME_WIDTH / CV_FRAME_HEIGHT;
  const sourceAspect = source.width / source.height;
  let cropX = 0;
  let cropY = 0;
  let cropWidth = source.width;
  let cropHeight = source.height;

  if (sourceAspect > captureAspect) {
    cropWidth = source.height * captureAspect;
    cropX = (source.width - cropWidth) / 2;
  } else if (sourceAspect < captureAspect) {
    cropHeight = source.width / captureAspect;
    cropY = (source.height - cropHeight) / 2;
  }

  const sourceX = cropX + (point.x * cropWidth);
  const sourceY = cropY + (point.y * cropHeight);
  const coverScale = Math.max(
    viewport.width / source.width,
    viewport.height / source.height,
  );
  const offsetX = (viewport.width - (source.width * coverScale)) / 2;
  const offsetY = (viewport.height - (source.height * coverScale)) / 2;

  return {
    x: offsetX + (sourceX * coverScale),
    y: offsetY + (sourceY * coverScale),
  };
}

function interpolateLine(
  current: NormalizedLine,
  target: NormalizedLine,
  amount: number,
): NormalizedLine {
  return {
    x1: current.x1 + ((target.x1 - current.x1) * amount),
    y1: current.y1 + ((target.y1 - current.y1) * amount),
    x2: current.x2 + ((target.x2 - current.x2) * amount),
    y2: current.y2 + ((target.y2 - current.y2) * amount),
  };
}

function confidenceColor(confidence: number): string {
  if (confidence >= 0.75) return '#24e88b';
  if (confidence >= 0.5) return '#ffd84d';
  return '#ff8a3d';
}

export function StructuralLineOverlay({
  videoRef,
  result,
  active,
}: StructuralLineOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const targetRef = useRef<NormalizedLine | null>(null);
  const currentRef = useRef<NormalizedLine | null>(null);
  const confidenceRef = useRef(0);
  const lastDetectionAtRef = useRef(0);

  useEffect(() => {
    if (active && result?.detected && result.floor_boundary) {
      targetRef.current = result.floor_boundary;
      confidenceRef.current = result.boundary_confidence;
      lastDetectionAtRef.current = performance.now();
      if (!currentRef.current) {
        currentRef.current = result.floor_boundary;
      }
      return;
    }

    targetRef.current = null;
  }, [active, result]);

  useEffect(() => {
    let animationFrame = 0;
    let previousFrameAt = performance.now();

    const draw = (now: number) => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) {
        animationFrame = requestAnimationFrame(draw);
        return;
      }

      const viewportWidth = canvas.clientWidth;
      const viewportHeight = canvas.clientHeight;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const renderWidth = Math.max(1, Math.round(viewportWidth * pixelRatio));
      const renderHeight = Math.max(1, Math.round(viewportHeight * pixelRatio));
      if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
        canvas.width = renderWidth;
        canvas.height = renderHeight;
      }

      const context = canvas.getContext('2d');
      if (!context) {
        animationFrame = requestAnimationFrame(draw);
        return;
      }

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, viewportWidth, viewportHeight);

      const target = targetRef.current;
      const sourceWidth = video.videoWidth;
      const sourceHeight = video.videoHeight;
      if (
        active
        && target
        && sourceWidth > 0
        && sourceHeight > 0
        && viewportWidth > 0
        && viewportHeight > 0
      ) {
        const deltaMs = Math.min(now - previousFrameAt, 100);
        const smoothing = 1 - Math.exp(-deltaMs / 90);
        currentRef.current = currentRef.current
          ? interpolateLine(currentRef.current, target, smoothing)
          : target;

        const line = currentRef.current;
        const viewport = { width: viewportWidth, height: viewportHeight };
        const source = { width: sourceWidth, height: sourceHeight };
        const start = mapCapturedPointToCover(
          { x: line.x1, y: line.y1 },
          source,
          viewport,
        );
        const end = mapCapturedPointToCover(
          { x: line.x2, y: line.y2 },
          source,
          viewport,
        );
        const ageMs = now - lastDetectionAtRef.current;
        const alpha = Math.max(0, Math.min(1, (1600 - ageMs) / 600));
        const color = confidenceColor(confidenceRef.current);

        context.save();
        context.globalAlpha = alpha;
        context.strokeStyle = color;
        context.lineWidth = 4;
        context.lineCap = 'round';
        context.shadowColor = 'rgba(0, 0, 0, 0.7)';
        context.shadowBlur = 6;
        context.beginPath();
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
        context.stroke();

        const label = `Floor boundary ${Math.round(confidenceRef.current * 100)}%`;
        const labelX = Math.max(8, Math.min(viewportWidth - 170, start.x));
        const labelY = Math.max(22, Math.min(viewportHeight - 8, start.y - 10));
        context.shadowBlur = 0;
        context.fillStyle = 'rgba(8, 18, 31, 0.82)';
        context.fillRect(labelX - 5, labelY - 16, 166, 22);
        context.fillStyle = color;
        context.font = '600 12px Segoe UI, sans-serif';
        context.fillText(label, labelX, labelY);
        context.restore();
      }

      previousFrameAt = now;
      animationFrame = requestAnimationFrame(draw);
    };

    animationFrame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationFrame);
  }, [active, videoRef]);

  return <canvas ref={canvasRef} className="structural-line-overlay" aria-hidden="true" />;
}
