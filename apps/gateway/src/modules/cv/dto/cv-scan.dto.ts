export class CvScanDto {
  session_id?: string;
  timestamp?: number;
  estimated_position?: {
    x: number;
    y: number;
    floor: number;
  };
  image_payload?: string;
  device_heading?: number;

  deviceId?: string;
  frameBase64?: string;
  mimeType?: string;
  frameId?: string;
}
