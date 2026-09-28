export const DEFAULT_ACCENT_COLOR = "#a8d2cc";
export const DEFAULT_CONTENT_COLOR = "apricot";
export const DEFAULT_RULE_COLOR = "sage";

export const STATIC_THEME_TOKENS = Object.freeze({
  canvas: "#f2f4f3",
  surface: "#ffffff",
  "surface-muted": "#e9eeec",
  text: "#1f2925",
  "text-muted": "#65706b",
  border: "#d7dedb",
  "border-strong": "#c3cdc9",
  danger: "#a83f43",
  "danger-surface": "#fff1f1",
  "danger-border": "#e8c0c1",
  warning: "#795b2e",
  "warning-surface": "#fff8e9",
  "warning-border": "#dfcca8",
  "shadow-subtle": "rgba(29,42,36,.07)",
  "shadow-soft": "rgba(30,35,30,.12)",
  "shadow-medium": "rgba(29,42,36,.16)",
  "shadow-raised": "rgba(30,35,30,.18)",
  "shadow-dialog": "rgba(30,34,30,.22)",
  "shadow-toast": "rgba(25,29,25,.2)",
  overlay: "rgba(31,34,31,.4)",
  "swatch-outline": "rgba(0,0,0,.09)",
  "toast-text": "#ffffff",
  "toast-border": "rgba(255,255,255,.3)",
});

export const COLOR_PRESETS = Object.freeze({
  apricot: "#f2b7a4",
  sage: "#b9d3b0",
  blue: "#abc8e7",
  lilac: "#c7b6e1",
  rose: "#e5b3be",
  sand: "#ccbfad",
  teal: "#9ed4cb",
  plum: "#d1b5ca",
});

export const ACCENT_COLOR_PRESETS = Object.freeze([
  [DEFAULT_ACCENT_COLOR, "薄荷青"],
  ["#d7b7a9", "陶粉"],
  ["#abc8e7", "雾蓝"],
  ["#c7b6e1", "薰衣草"],
].map(([value, label]) => Object.freeze({ value, label })));

export const CUSTOM_COLOR_CHOICES = Object.freeze([
  ["#efaaa8", "雾红"], ["#f2b7a4", "蜜桃"], ["#f4c18b", "杏橙"], ["#efd38f", "奶油黄"], ["#d9d79d", "柔橄榄"], ["#bdd8a7", "嫩绿"],
  ["#a8d6b9", "薄荷"], ["#9ed4cb", "海盐"], ["#a5d4dc", "水蓝"], ["#abc8e7", "天空蓝"], ["#b7c0e5", "长春花"], ["#c7b6e1", "薰衣草"],
  ["#d6b4df", "丁香紫"], ["#e2b2cf", "樱花粉"], ["#e5b3be", "玫瑰粉"], ["#d7b7a9", "陶粉"], ["#ccbfad", "燕麦"], ["#c3cac7", "云灰"],
].map(([value, label]) => Object.freeze({ value, label })));

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const INTERFACE_INK = STATIC_THEME_TOKENS.text;
const WHITE = STATIC_THEME_TOKENS.surface;

export function normalizeColorValue(value, fallback = DEFAULT_RULE_COLOR) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (HEX_COLOR.test(normalized)) return normalized;
  if (Object.hasOwn(COLOR_PRESETS, normalized)) return normalized;
  const safeFallback = typeof fallback === "string" ? fallback.trim().toLowerCase() : DEFAULT_RULE_COLOR;
  return HEX_COLOR.test(safeFallback) || Object.hasOwn(COLOR_PRESETS, safeFallback) ? safeFallback : DEFAULT_RULE_COLOR;
}

export function resolveColor(value, fallback = DEFAULT_RULE_COLOR) {
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
  const accent = resolveColor(value, DEFAULT_ACCENT_COLOR);
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

function readableEventSurface(base) {
  if (contrastRatio(INTERFACE_INK, base) >= 7) return base;
  for (let step = 1; step <= 20; step += 1) {
    const candidate = mix(base, WHITE, step / 20);
    if (contrastRatio(INTERFACE_INK, candidate) >= 7) return candidate;
  }
  return WHITE;
}

export function eventColorTokens(value) {
  const base = resolveColor(value, DEFAULT_CONTENT_COLOR);
  const surface = readableEventSurface(base);
  return {
    base,
    surface,
    border: towardContrast(mix(base, INTERFACE_INK, 0.14), surface, 1.5),
    marker: base,
    text: INTERFACE_INK,
  };
}
