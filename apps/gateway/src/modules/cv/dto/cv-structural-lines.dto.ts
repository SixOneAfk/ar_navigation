type WorldPointDto = {
  x: number;
  y: number;
  z: number;
};

type CameraIntrinsicsDto = {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  distortion?: number[];
};

type WallReferenceDto = {
  id: string;
  corners: [WorldPointDto, WorldPointDto, WorldPointDto, WorldPointDto];
};

export class CvStructuralLinesDto {
  session_id?: string;
  timestamp?: number;
  image_payload?: string;
  device_roll_deg?: number;
  estimated_position?: WorldPointDto;
  camera_intrinsics?: CameraIntrinsicsDto;
  wall_reference?: WallReferenceDto;
  reference_confidence?: number;
  intrinsics_confidence?: number;
  sequence_number?: number;
  frame_id?: string;

  deviceId?: string;
  frameBase64?: string;
  frameId?: string;
}
