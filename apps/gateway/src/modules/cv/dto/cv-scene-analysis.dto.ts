export class CvSceneAnalysisDto {
  session_id?: string;
  timestamp?: number;
  image_payload?: string;
  sequence_number?: number;
  minimum_confidence?: number;
  include_text?: boolean;
}
