export const VIEWPORTS = {
  desktop: { width: 1000, height: 720 },
  mobile: { width: 390, height: 760 },
};
export const MAX_BODY = 32_768;
export function localUrl(raw, controlPort) {
  if (typeof raw !== "string" || raw.length > 2048)
    throw new Error("Enter a localhost URL.");
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Enter a complete http://localhost:port URL.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw new Error(
      "Only localhost, 127.0.0.1 and ::1 URLs without credentials are supported.",
    );
  if (
    Number(url.port || (url.protocol === "https:" ? 443 : 80)) ===
      controlPort &&
    !/^\/fixtures\/[abc]$/.test(url.pathname)
  )
    throw new Error("The Audition control server cannot be an app target.");
  return url.href;
}
export function validateTargets(targets, port) {
  if (!Array.isArray(targets) || targets.length < 2 || targets.length > 3)
    throw new Error("Connect two or three app URLs.");
  return targets.map((target, index) => ({
    name:
      typeof target.name === "string"
        ? target.name.trim().slice(0, 60) || `Variant ${index + 1}`
        : `Variant ${index + 1}`,
    url: localUrl(target.url, port),
  }));
}
export function validateAction(action) {
  if (
    !action ||
    !["click", "fill", "press", "scroll", "select"].includes(action.kind)
  )
    throw new Error("Unsupported action.");
  if (action.kind === "scroll") {
    if (![-1, 1].includes(action.direction))
      throw new Error("Scroll direction must be -1 or 1.");
    return action;
  }
  if (
    action.kind === "press" &&
    !["Enter", "Escape", "Tab", "Shift+Tab", "ArrowDown", "ArrowUp"].includes(
      action.value,
    )
  )
    throw new Error("Unsupported key.");
  if (
    action.kind === "fill" &&
    (typeof action.value !== "string" || action.value.length > 4000)
  )
    throw new Error("Text must be at most 4,000 characters.");
  if (
    action.kind === "select" &&
    (typeof action.value !== "string" || action.value.length > 300)
  )
    throw new Error("Option labels must be at most 300 characters.");
  if (action.kind !== "press") {
    const t = action.target;
    if (
      !t ||
      ![
        "button",
        "link",
        "textbox",
        "checkbox",
        "combobox",
        "radio",
        "switch",
      ].includes(t.role) ||
      typeof t.name !== "string" ||
      !t.name.trim() ||
      t.name.length > 300
    )
      throw new Error("Choose a supported named control.");
  }
  return action;
}
