import { useEffect, useRef, type RefObject } from 'react';
import {
  CV_FRAME_HEIGHT,
  CV_FRAME_WIDTH,
  type FloorBoundaryDetection,
  type NormalizedLine,
  type WallOutline,
  type WallOutlineDetection,
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

export const MIN_VISIBLE_WALL_CONFIDENCE = 0.02;

export function shouldDisplayWallOutline(confidence: number): boolean {
  return (
    Number.isFinite(confidence)
    && confidence >= MIN_VISIBLE_WALL_CONFIDENCE
  );
}

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
function interpolatePoint(
  current: Point,
  target: Point,
  amount: number,
): Point {
  return {
    x: current.x + ((target.x - current.x) * amount),
    y: current.y + ((target.y - current.y) * amount),
  };
}

function interpolateWallOutline(
  current: WallOutline,
  target: WallOutline,
  amount: number,
): WallOutline {
  return {
    top_left: interpolatePoint(current.top_left, target.top_left, amount),
    top_right: interpolatePoint(current.top_right, target.top_right, amount),
    bottom_right: interpolatePoint(
      current.bottom_right,
      target.bottom_right,
      amount,
    ),
    bottom_left: interpolatePoint(
      current.bottom_left,
      target.bottom_left,
      amount,
    ),
  };
}

export function wallOutlineSegments(
  outline: WallOutline,
): Array<[Point, Point]> {
  return [
    [outline.top_left, outline.top_right],
    [outline.top_left, outline.bottom_left],
    [outline.top_right, outline.bottom_right],
  ];
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
  const floorTargetsRef = useRef<FloorBoundaryDetection[]>([]);
  const floorCurrentRef = useRef<NormalizedLine[]>([]);
  const lastDetectionAtRef = useRef(0);
  const wallTargetsRef = useRef<WallOutlineDetection[]>([]);
  const wallCurrentRef = useRef<WallOutline[]>([]);

  useEffect(() => {
    const floorTargets = result?.floor_boundaries?.length
      ? result.floor_boundaries
      : result?.detected && result.floor_boundary
        ? [{
            line: result.floor_boundary,
            angle_deg: result.boundary_angle_deg ?? 0,
            confidence: result.boundary_confidence,
          }]
        : [];
    if (active && floorTargets.length > 0) {
      floorTargetsRef.current = floorTargets;
      lastDetectionAtRef.current = performance.now();
      if (floorCurrentRef.current.length !== floorTargets.length) {
        floorCurrentRef.current = floorTargets.map((target) => target.line);
      }
    } else {
      floorTargetsRef.current = [];
    }

    const wallTargets = (result?.wall_outlines?.length
      ? result.wall_outlines
      : result?.wall_outline
        ? [{
            outline: result.wall_outline,
            confidence: result.wall_confidence,
            floor_boundary_index: 0,
          }]
        : []).filter((target) => shouldDisplayWallOutline(target.confidence));
    if (active && wallTargets.length > 0) {
      wallTargetsRef.current = wallTargets;
      if (wallCurrentRef.current.length !== wallTargets.length) {
        wallCurrentRef.current = wallTargets.map((target) => target.outline);
      }
    } else {
      wallTargetsRef.current = [];
    }
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

      const sourceWidth = video.videoWidth;
      const sourceHeight = video.videoHeight;
      const canDraw = (
        active
        && sourceWidth > 0
        && sourceHeight > 0
        && viewportWidth > 0
        && viewportHeight > 0
      );
      const deltaMs = Math.min(now - previousFrameAt, 100);
      const smoothing = 1 - Math.exp(-deltaMs / 90);
      const viewport = { width: viewportWidth, height: viewportHeight };
      const source = { width: sourceWidth, height: sourceHeight };

      if (canDraw && floorTargetsRef.current.length > 0) {
        floorCurrentRef.current = floorTargetsRef.current.map(
          (target, index) => floorCurrentRef.current[index]
            ? interpolateLine(floorCurrentRef.current[index], target.line, smoothing)
            : target.line,
        );
        const ageMs = now - lastDetectionAtRef.current;
        const alpha = Math.max(0, Math.min(1, (1600 - ageMs) / 600));
        floorCurrentRef.current.forEach((line, index) => {
          const target = floorTargetsRef.current[index];
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
          const color = confidenceColor(target.confidence);

          context.save();
          context.globalAlpha = alpha;
          context.strokeStyle = color;
          context.lineWidth = index === 0 ? 4 : 3;
          context.lineCap = 'round';
          context.shadowColor = 'rgba(0, 0, 0, 0.7)';
          context.shadowBlur = 6;
          context.beginPath();
          context.moveTo(start.x, start.y);
          context.lineTo(end.x, end.y);
          context.stroke();

          const label = `Floor ${index + 1} ${Math.round(target.confidence * 100)}%`;
          const labelX = Math.max(8, Math.min(viewportWidth - 130, start.x));
          const labelY = Math.max(
            22,
            Math.min(viewportHeight - 8, start.y - 10),
          );
          context.shadowBlur = 0;
          context.fillStyle = 'rgba(8, 18, 31, 0.82)';
          context.fillRect(labelX - 5, labelY - 16, 126, 22);
          context.fillStyle = color;
          context.font = '600 12px Segoe UI, sans-serif';
          context.fillText(label, labelX, labelY);
          context.restore();
        });
      }
      if (canDraw && wallTargetsRef.current.length > 0) {
        wallCurrentRef.current = wallTargetsRef.current.map(
          (target, index) => wallCurrentRef.current[index]
            ? interpolateWallOutline(
              wallCurrentRef.current[index],
              target.outline,
              smoothing,
            )
            : target.outline,
        );
        const wallColor = '#35c8ff';
        wallCurrentRef.current.forEach((wallOutline, index) => {
          const target = wallTargetsRef.current[index];
          const mappedOutline: WallOutline = {
            top_left: mapCapturedPointToCover(
              wallOutline.top_left,
              source,
              viewport,
            ),
            top_right: mapCapturedPointToCover(
              wallOutline.top_right,
              source,
              viewport,
            ),
            bottom_right: mapCapturedPointToCover(
              wallOutline.bottom_right,
              source,
              viewport,
            ),
            bottom_left: mapCapturedPointToCover(
              wallOutline.bottom_left,
              source,
              viewport,
            ),
          };

          context.save();
          context.strokeStyle = wallColor;
          context.lineWidth = index === 0 ? 3 : 2;
          context.lineCap = 'round';
          context.shadowColor = 'rgba(0, 0, 0, 0.7)';
          context.shadowBlur = 6;
          context.beginPath();
          for (const [edgeStart, edgeEnd] of wallOutlineSegments(mappedOutline)) {
            context.moveTo(edgeStart.x, edgeStart.y);
            context.lineTo(edgeEnd.x, edgeEnd.y);
          }
          context.stroke();

          const wallLabelX = Math.max(
            8,
            Math.min(viewportWidth - 130, mappedOutline.top_left.x),
          );
          const wallLabelY = Math.max(
            22,
            Math.min(viewportHeight - 8, mappedOutline.top_left.y - 10),
          );
          context.shadowBlur = 0;
          context.fillStyle = 'rgba(8, 18, 31, 0.82)';
          context.fillRect(wallLabelX - 5, wallLabelY - 16, 126, 22);
          context.fillStyle = wallColor;
          context.font = '600 12px Segoe UI, sans-serif';
          context.fillText(
            `Wall ${index + 1} ${Math.round(target.confidence * 100)}%`,
            wallLabelX,
            wallLabelY,
          );
          context.restore();
        });
      }


      previousFrameAt = now;
      animationFrame = requestAnimationFrame(draw);
    };

    animationFrame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationFrame);
  }, [active, videoRef]);

  return <canvas ref={canvasRef} className="structural-line-overlay" aria-hidden="true" />;
}
