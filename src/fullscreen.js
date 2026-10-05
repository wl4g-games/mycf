const REQUEST_METHODS = [
  "requestFullscreen",
  "webkitRequestFullscreen",
  "webkitRequestFullScreen",
  "mozRequestFullScreen",
  "msRequestFullscreen",
];

const EXIT_METHODS = [
  "exitFullscreen",
  "webkitExitFullscreen",
  "webkitCancelFullScreen",
  "mozCancelFullScreen",
  "msExitFullscreen",
];

const ENABLED_FLAGS = Object.freeze({
  requestFullscreen: "fullscreenEnabled",
  webkitRequestFullscreen: "webkitFullscreenEnabled",
  webkitRequestFullScreen: "webkitFullscreenEnabled",
  mozRequestFullScreen: "mozFullScreenEnabled",
  msRequestFullscreen: "msFullscreenEnabled",
});

function availableMethod(owner, names) {
  if (!owner) return null;
  return names.find(name => typeof owner[name] === "function") || null;
}

export function fullscreenElement(documentValue) {
  return documentValue?.fullscreenElement
    || documentValue?.webkitFullscreenElement
    || documentValue?.mozFullScreenElement
    || documentValue?.msFullscreenElement
    || null;
}

export function supportsFullscreen(documentValue, target) {
  if (!documentValue || !target) return false;
  const requestMethod = availableMethod(target, REQUEST_METHODS);
  const exitMethod = availableMethod(documentValue, EXIT_METHODS);
  if (!requestMethod || !exitMethod) return false;
  const enabledFlag = ENABLED_FLAGS[requestMethod];
  return !enabledFlag || documentValue[enabledFlag] !== false;
}

export async function toggleFullscreen(documentValue, target) {
  const active = Boolean(fullscreenElement(documentValue));
  const owner = active ? documentValue : target;
  const method = availableMethod(owner, active ? EXIT_METHODS : REQUEST_METHODS);
  if (!method) return { active, supported: false, changed: false };

  try {
    await owner[method]();
    const current = Boolean(fullscreenElement(documentValue));
    return {
      active: current === active ? !active : current,
      supported: true,
      changed: true,
    };
  } catch (error) {
    return {
      active: Boolean(fullscreenElement(documentValue)),
      supported: true,
      changed: false,
    };
  }
}
