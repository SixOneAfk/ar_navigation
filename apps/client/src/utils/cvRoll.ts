export function calculateRollBiasDeg(
  sensorGammaDeg: number,
  cameraRollDeg: number,
): number {
  // Image-space vertical deviation has the opposite sign to camera rotation.
  return sensorGammaDeg + cameraRollDeg;
}
