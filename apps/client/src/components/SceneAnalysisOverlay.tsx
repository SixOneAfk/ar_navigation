import { useEffect, useRef, type RefObject } from 'react';
import { isSceneResultFresh, sceneDetectionLabel, type SceneAnalysisResult } from '../utils/sceneAnalysis';
import { mapCapturedPointToCover } from './StructuralLineOverlay';

type SceneAnalysisOverlayProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  result: SceneAnalysisResult | null;
  capturedAt: number;
  active: boolean;
};

export function SceneAnalysisOverlay({
  videoRef, result, capturedAt, active,
}: SceneAnalysisOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active) return;
    let animationFrame = 0;
    let previousDrawKey = '';
    const draw = (now: number) => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const fresh = active && result && isSceneResultFresh(capturedAt, now);
      const drawKey = `${width}-${height}-${ratio}-${video.videoWidth}-${video.videoHeight}-${Boolean(fresh)}`;
      if (drawKey === previousDrawKey) {
        animationFrame = requestAnimationFrame(draw);
        return;
      }
      previousDrawKey = drawKey;
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
      }
      const context = canvas.getContext('2d');
      if (context) {
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, width, height);
        if (active && result && width > 0 && height > 0
          && video.videoWidth > 0 && video.videoHeight > 0
          && fresh) {
          const occupied: Array<{ x: number; y: number; width: number }> = [];
          for (const detection of result.detections) {
            if (detection.polygon.length < 3) continue;
            const points = detection.polygon.map((point) => mapCapturedPointToCover(
              point,
              { width: video.videoWidth, height: video.videoHeight },
              { width, height },
            ));
            const color = detection.kind === 'text' ? '#ff8ee5' : '#70e4ff';
            context.save();
            context.strokeStyle = color;
            context.fillStyle = detection.kind === 'text'
              ? 'rgba(255, 142, 229, 0.08)' : 'rgba(112, 228, 255, 0.08)';
            context.lineWidth = 2;
            context.beginPath();
            points.forEach((point, index) => {
              if (index === 0) context.moveTo(point.x, point.y);
              else context.lineTo(point.x, point.y);
            });
            context.closePath();
            context.fill();
            context.stroke();
            context.font = '600 12px Segoe UI, sans-serif';
            const label = sceneDetectionLabel(detection);
            const labelWidth = Math.min(context.measureText(label).width + 12, width - 12);
            const x = Math.max(6, Math.min(width - labelWidth - 6, Math.min(...points.map((p) => p.x))));
            let y = Math.max(22, Math.min(height - 6, Math.min(...points.map((p) => p.y)) - 6));
            for (let attempt = 0; attempt < 8; attempt++) {
              if (!occupied.some((other) => Math.abs(other.y - y) < 23
                && x < other.x + other.width && x + labelWidth > other.x)) break;
              y += 24;
              if (y > height - 6) { y = 22; break; }
            }
            occupied.push({ x, y, width: labelWidth });
            context.fillStyle = 'rgba(8, 18, 31, 0.88)';
            context.fillRect(x, y - 17, labelWidth, 23);
            context.fillStyle = color;
            context.fillText(label, x + 6, y, labelWidth - 12);
            context.restore();
          }
        }
      }
      animationFrame = requestAnimationFrame(draw);
    };
    animationFrame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationFrame);
  }, [active, capturedAt, result, videoRef]);

  return active
    ? <canvas ref={canvasRef} className="scene-analysis-overlay" aria-hidden="true" />
    : null;
}
