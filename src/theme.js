export const COLOR_PRESETS = Object.freeze({
  apricot: "#b96f4c",
  sage: "#6f8b73",
  blue: "#6683a3",
  lilac: "#816f99",
  rose: "#a46f79",
  sand: "#8e7c59",
  teal: "#568783",
  plum: "#856c7d",
});

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const INTERFACE_INK = "#1f2925";
const WHITE = "#ffffff";

export function normalizeColorValue(value, fallback = "sage") {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (HEX_COLOR.test(normalized)) return normalized;
  if (Object.hasOwn(COLOR_PRESETS, normalized)) return normalized;
  const safeFallback = typeof fallback === "string" ? fallback.trim().toLowerCase() : "sage";
  return HEX_COLOR.test(safeFallback) || Object.hasOwn(COLOR_PRESETS, safeFallback) ? safeFallback : "sage";
}

export function resolveColor(value, fallback = "sage") {
  const normalized = normalizeColorValue(value, fallback);
  return COLOR_PRESETS[normalized] || normalized;
}

function rgb(hex) {
  const value = resolveColor(hex).slice(1);
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
}

function hex(values) {
  return `#${values.map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("")}`;
}

function mix(color, target, amount) {
  const source = rgb(color);
  const destination = rgb(target);
  return hex(source.map((value, index) => value + (destination[index] - value) * amount));
}

function luminance(color) {
  const channels = rgb(color).map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(left, right) {
  const [light, dark] = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

function towardContrast(color, background, minimum, target = INTERFACE_INK) {
  if (contrastRatio(color, background) >= minimum) return color;
  for (let step = 1; step <= 20; step += 1) {
    const candidate = mix(color, target, step / 20);
    if (contrastRatio(candidate, background) >= minimum) return candidate;
  }
  return target;
}

export function accentColorTokens(value) {
  const accent = resolveColor(value, "#486f65");
  const solid = towardContrast(accent, WHITE, 3);
  const onAccent = contrastRatio(solid, WHITE) >= contrastRatio(solid, INTERFACE_INK) ? WHITE : INTERFACE_INK;
  return {
    accent: solid,
    onAccent,
    soft: mix(accent, WHITE, 0.88),
    strong: towardContrast(accent, WHITE, 4.5),
    focus: solid,
  };
}

export function eventColorTokens(value) {
  const base = resolveColor(value, "sage");
  const surface = mix(base, WHITE, 0.82);
  return {
    surface,
    border: towardContrast(mix(base, WHITE, 0.48), surface, 1.5),
    marker: towardContrast(base, WHITE, 3),
    text: towardContrast(mix(base, INTERFACE_INK, 0.38), surface, 4.5),
  };
}
