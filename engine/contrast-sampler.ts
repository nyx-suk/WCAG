import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import {
  contrastRatio,
  relativeLuminance,
  type RgbColor,
} from "./contrast";
import type {
  ContrastCheckInput,
  ContrastCheckResult,
  ContrastSample,
} from "../src/audit/contracts";

interface DecodedImage {
  width: number;
  height: number;
  pixels: Uint8Array;
  channels: 3 | 4;
}

interface ColorCount {
  color: RgbColor;
  count: number;
}

const PNG_SIGNATURE = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10,
]);

function sameBytes(first: Uint8Array, second: Uint8Array): boolean {
  return first.every((value, index) => value === second[index]);
}

function colorKey(color: RgbColor): string {
  return `${color.r},${color.g},${color.b}`;
}

function decodePng(data: Uint8Array): DecodedImage {
  if (!sameBytes(data.subarray(0, PNG_SIGNATURE.length), PNG_SIGNATURE)) {
    throw new Error("Contrast sampling requires a PNG screenshot");
  }

  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let channels: 3 | 4 = 3;
  const imageData: Uint8Array[] = [];

  while (offset < data.length) {
    const length = new DataView(data.buffer, data.byteOffset + offset, 4).getUint32(0);
    offset += 4;
    const type = new TextDecoder().decode(data.subarray(offset, offset + 4));
    offset += 4;
    const chunk = data.subarray(offset, offset + length);
    offset += length + 4;

    if (type === "IHDR") {
      const header = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      width = header.getUint32(0);
      height = header.getUint32(4);
      const bitDepth = chunk[8];
      const colorType = chunk[9];
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
        throw new Error("Contrast sampling supports only 8-bit RGB/RGBA PNGs");
      }
      channels = colorType === 6 ? 4 : 3;
      if (chunk[10] !== 0 || chunk[11] !== 0 || chunk[12] !== 0) {
        throw new Error("Contrast sampling supports only non-interlaced PNGs");
      }
    } else if (type === "IDAT") {
      imageData.push(chunk);
    } else if (type === "IEND") {
      break;
    }
  }

  if (width === 0 || height === 0 || imageData.length === 0) {
    throw new Error("PNG screenshot is missing image data");
  }

  const compressed = Buffer.concat(imageData.map((chunk) => Buffer.from(chunk)));
  const filtered = inflateSync(compressed);
  const rowSize = width * channels;
  const pixels = new Uint8Array(width * height * channels);
  let sourceOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = filtered[sourceOffset];
    sourceOffset += 1;
    const rowOffset = y * rowSize;
    for (let x = 0; x < rowSize; x += 1) {
      const left = x >= channels ? pixels[rowOffset + x - channels] : 0;
      const above = y > 0 ? pixels[rowOffset - rowSize + x] : 0;
      const upperLeft =
        y > 0 && x >= channels ? pixels[rowOffset - rowSize + x - channels] : 0;
      const value = filtered[sourceOffset];
      sourceOffset += 1;
      let decoded = value;
      if (filter === 1) decoded = (value + left) & 255;
      if (filter === 2) decoded = (value + above) & 255;
      if (filter === 3) decoded = (value + Math.floor((left + above) / 2)) & 255;
      if (filter === 4) {
        const estimate = left + above - upperLeft;
        const pa = Math.abs(estimate - left);
        const pb = Math.abs(estimate - above);
        const pc = Math.abs(estimate - upperLeft);
        decoded = (value + (pa <= pb && pa <= pc ? left : pb <= pc ? above : upperLeft)) & 255;
      }
      if (filter < 0 || filter > 4) {
        throw new Error(`Unsupported PNG filter ${filter}`);
      }
      pixels[rowOffset + x] = decoded;
    }
  }

  return { width, height, pixels, channels };
}

function pixelAt(image: DecodedImage, x: number, y: number): RgbColor {
  const offset = (y * image.width + x) * image.channels;
  return {
    r: image.pixels[offset],
    g: image.pixels[offset + 1],
    b: image.pixels[offset + 2],
  };
}

function addColor(counts: Map<string, ColorCount>, color: RgbColor): void {
  const key = colorKey(color);
  const existing = counts.get(key);
  if (existing) {
    existing.count += 1;
  } else {
    counts.set(key, { color, count: 1 });
  }
}

function boundedBox(
  image: DecodedImage,
  input: ContrastCheckInput,
): { left: number; top: number; right: number; bottom: number } | undefined {
  const { x, y, width, height } = input.target.boundingBox;
  const left = Math.max(0, Math.ceil(x));
  const top = Math.max(0, Math.ceil(y));
  const right = Math.min(image.width, Math.floor(x + width));
  const bottom = Math.min(image.height, Math.floor(y + height));
  return right > left && bottom > top ? { left, top, right, bottom } : undefined;
}

export async function sampleContrast(
  input: ContrastCheckInput,
): Promise<ContrastCheckResult> {
  let image: DecodedImage;
  try {
    const bytes = input.screenshot.kind === "path"
      ? await readFile(input.screenshot.path)
      : input.screenshot.data;
    image = decodePng(bytes);
  } catch (error) {
    return incompleteResult(input, error instanceof Error ? error.message : "Unable to decode screenshot");
  }

  const box = boundedBox(image, input);
  const evidenceBase = {
    screenshot: input.screenshot,
    text: input.target.text,
    boundingBox: input.target.boundingBox,
    requiredRatio: input.requiredRatio,
    wcagCriterion: input.wcagCriterion,
    samples: [] as ContrastSample[],
    method: "PNG pixel sampling: perimeter and target-box color frequency",
  };
  if (!box) {
    return { status: "incomplete", summary: "Target bounding box does not intersect the screenshot", evidence: evidenceBase };
  }

  const perimeter = new Map<string, ColorCount>();
  const inside = new Map<string, ColorCount>();
  const perimeterSamples: ContrastSample[] = [];
  for (let y = Math.max(0, box.top - 1); y < Math.min(image.height, box.bottom + 1); y += 1) {
    for (let x = Math.max(0, box.left - 1); x < Math.min(image.width, box.right + 1); x += 1) {
      const color = pixelAt(image, x, y);
      if (x < box.left || x >= box.right || y < box.top || y >= box.bottom) {
        addColor(perimeter, color);
        perimeterSamples.push({
          x,
          y,
          rgb: [color.r, color.g, color.b],
          relativeLuminance: relativeLuminance(color),
        });
      } else {
        addColor(inside, color);
      }
    }
  }
  const background = [...perimeter.values()].sort((a, b) => b.count - a.count)[0];
  const foreground = [...inside.values()]
    .filter((entry) => colorKey(entry.color) !== colorKey(background?.color ?? { r: -1, g: -1, b: -1 }))
    .sort((a, b) => b.count - a.count)[0];
  if (!background || !foreground) {
    return { status: "incomplete", summary: "A distinct text and background color could not be sampled reliably", evidence: evidenceBase };
  }

  const measuredRatio = contrastRatio(foreground.color, background.color);
  return {
    status: measuredRatio >= input.requiredRatio ? "pass" : "fail",
    summary: `Measured contrast ratio is ${measuredRatio.toFixed(2)}:1; required ${input.requiredRatio}:1`,
    evidence: { ...evidenceBase, measuredRatio, samples: perimeterSamples.slice(0, 16) },
  };
}

function incompleteResult(input: ContrastCheckInput, reason: string): ContrastCheckResult {
  return {
    status: "incomplete",
    summary: reason,
    evidence: {
      screenshot: input.screenshot,
      text: input.target.text,
      boundingBox: input.target.boundingBox,
      requiredRatio: input.requiredRatio,
      wcagCriterion: input.wcagCriterion,
      samples: [],
      method: "PNG pixel sampling: perimeter and target-box color frequency",
    },
  };
}
