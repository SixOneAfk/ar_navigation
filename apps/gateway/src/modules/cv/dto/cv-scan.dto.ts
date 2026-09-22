export class CvScanDto {
  session_id?: string;
  timestamp?: number;
  estimated_position?: {
    x: number;
    y: number;
    z?: number;
    floor: number;
  };
  image_payload?: string;
  device_heading?: number;
  pose_confidence?: number;
  velocity_hint_mps?: number;
  device_pitch_deg?: number;
  device_roll_deg?: number;
  sequence_number?: number;
  frame_id?: string;

  deviceId?: string;
  frameBase64?: string;
  mimeType?: string;
  frameId?: string;
}
