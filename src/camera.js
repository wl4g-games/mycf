export const MAX_CAMERA_PITCH = .32;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function applyCameraPitch(current = 0, delta = 0) {
  const safeCurrent = Number.isFinite(current) ? current : 0;
  const safeDelta = Number.isFinite(delta) ? delta : 0;
  return clamp(safeCurrent + safeDelta, -MAX_CAMERA_PITCH, MAX_CAMERA_PITCH);
}

export function cameraHorizon(height, pitch = 0) {
  const safeHeight = Math.max(0, Number(height) || 0);
  const safePitch = applyCameraPitch(pitch);
  return safeHeight * (.45 - safePitch * .82);
}
