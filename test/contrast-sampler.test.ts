import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { sampleContrast } from "../engine/contrast-sampler";

function png(width: number, height: number, pixel: (x: number, y: number) => [number, number, number]): Uint8Array {
  const rows: number[] = [];
  for (let y = 0; y < height; y += 1) {
    rows.push(0);
    for (let x = 0; x < width; x += 1) rows.push(...pixel(x, y), 255);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const chunk = (type: string, data: Buffer) => {
    const name = Buffer.from(type);
    return Buffer.concat([Buffer.from([data.length >> 24, data.length >> 16, data.length >> 8, data.length]), name, data, Buffer.alloc(4)]);
  };
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.from(rows))), chunk("IEND", Buffer.alloc(0))]);
}

test("samples known foreground and background pixels", async () => {
  const result = await sampleContrast({
    checkId: "tc3-contrast",
    pageUrl: "http://localhost:4000/tc3",
    screenshot: { kind: "data", data: png(20, 20, (x, y) => x >= 7 && x < 13 && y >= 7 && y < 13 ? [128, 128, 128] : [255, 255, 255]), mimeType: "image/png" },
    target: { text: "text", boundingBox: { x: 6, y: 6, width: 8, height: 8 } },
    wcagCriterion: "1.4.3",
    requiredRatio: 4.5,
  });
  assert.equal(result.status, "fail");
  assert.ok(result.evidence.measuredRatio !== undefined);
  assert.ok(Math.abs(result.evidence.measuredRatio - 3.949439) < 0.001);
  assert.ok(result.evidence.samples.length > 0);
});

test("returns incomplete without a distinct sampled background", async () => {
  const result = await sampleContrast({
    checkId: "tc3-contrast",
    pageUrl: "http://localhost:4000/tc3",
    screenshot: { kind: "data", data: png(10, 10, () => [128, 128, 128]), mimeType: "image/png" },
    target: { text: "text", boundingBox: { x: 2, y: 2, width: 4, height: 4 } },
    wcagCriterion: "1.4.3",
    requiredRatio: 4.5,
  });
  assert.equal(result.status, "incomplete");
  assert.equal(result.evidence.measuredRatio, undefined);
});
