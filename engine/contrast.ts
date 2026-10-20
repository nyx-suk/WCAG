export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

function linearizeSrgbChannel(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: RgbColor): number {
  return (
    0.2126 * linearizeSrgbChannel(color.r) +
    0.7152 * linearizeSrgbChannel(color.g) +
    0.0722 * linearizeSrgbChannel(color.b)
  );
}

export function contrastRatio(first: RgbColor, second: RgbColor): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export function getAaThreshold(textSize: "large" | "normal"): number {
  return textSize === "large" ? 3 : 4.5;
}

