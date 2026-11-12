import { MAX_AIM_PITCH, clampAimPitch } from "./shot-geometry.js";

export const MAX_CAMERA_PITCH = MAX_AIM_PITCH;

export function applyCameraPitch(current = 0, delta = 0) {
  const safeCurrent = Number.isFinite(current) ? current : 0;
  const safeDelta = Number.isFinite(delta) ? delta : 0;
  return clampAimPitch(safeCurrent + safeDelta);
}
