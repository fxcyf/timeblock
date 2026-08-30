export const COLOR_PRESETS = Object.freeze({
  apricot: "#e8c2a6",
  sage: "#cad9c5",
  blue: "#c8d8e8",
  lilac: "#d8cce6",
  rose: "#e3c7ca",
  sand: "#ddd2b8",
  teal: "#bcd8d3",
  plum: "#d5c4d2",
});

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function normalizeColorValue(value, fallback = "#cad9c5") {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (HEX_COLOR.test(normalized)) return normalized;
  if (Object.hasOwn(COLOR_PRESETS, normalized)) return normalized;
  const safeFallback = typeof fallback === "string" ? fallback.trim().toLowerCase() : "#cad9c5";
  return HEX_COLOR.test(safeFallback) || Object.hasOwn(COLOR_PRESETS, safeFallback) ? safeFallback : "#cad9c5";
}

export function resolveColor(value, fallback = "#cad9c5") {
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

export function colorTokens(value) {
  const accent = resolveColor(value, "#486f65");
  const onAccent = contrastRatio(accent, "#ffffff") >= 4.5 ? "#ffffff" : "#18201d";
  return {
    accent,
    onAccent,
    soft: mix(accent, "#ffffff", 0.78),
    deep: mix(accent, "#18201d", 0.34),
    focus: mix(accent, "#18201d", 0.18),
  };
}
