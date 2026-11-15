// Small procedural textures drawn on a canvas. A seeded random generator keeps
// them identical on every render, in every browser tab.

import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";

const mulberry32 = (seed: number) => {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const makeCanvas = (size: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D canvas not available");
  }
  return { canvas, ctx };
};

const toTexture = (canvas: HTMLCanvasElement, color: boolean) => {
  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  if (color) {
    tex.colorSpace = SRGBColorSpace;
  }
  return tex;
};

/** Knitted stitch pattern (columns of V-shaped loops) used as a bump map. */
export const makeKnitBump = () => {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size);
  const rand = mulberry32(7);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  const cols = 16;
  const rows = 16;
  const w = size / cols;
  const h = size / rows;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows + 1; r++) {
      const x = c * w;
      const y = r * h;
      const shade = 170 + Math.floor(rand() * 60);
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      for (const side of [0, 1]) {
        ctx.save();
        ctx.translate(x + w / 2 + (side ? w * 0.22 : -w * 0.22), y + h / 2);
        ctx.rotate(side ? -0.55 : 0.55);
        ctx.beginPath();
        ctx.ellipse(0, 0, w * 0.2, h * 0.75, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }
  return toTexture(canvas, false);
};

/** Diagonal twill weave with slight fading, used for the jeans. */
export const makeDenim = () => {
  const size = 256;
  const color = makeCanvas(size);
  const bumpC = makeCanvas(size);
  const rand = mulberry32(21);
  color.ctx.fillStyle = "#2b3d63";
  color.ctx.fillRect(0, 0, size, size);
  bumpC.ctx.fillStyle = "#555";
  bumpC.ctx.fillRect(0, 0, size, size);
  for (let i = -size; i < size * 2; i += 4) {
    const light = 55 + Math.floor(rand() * 25);
    color.ctx.strokeStyle = `rgba(${light + 40},${light + 60},${light + 100},0.35)`;
    color.ctx.lineWidth = 1.4;
    color.ctx.beginPath();
    color.ctx.moveTo(i, 0);
    color.ctx.lineTo(i + size, size);
    color.ctx.stroke();
    bumpC.ctx.strokeStyle = "#ddd";
    bumpC.ctx.lineWidth = 1.6;
    bumpC.ctx.beginPath();
    bumpC.ctx.moveTo(i, 0);
    bumpC.ctx.lineTo(i + size, size);
    bumpC.ctx.stroke();
  }
  // Soft slubs: faded flecks typical of real denim.
  for (let i = 0; i < 260; i++) {
    const x = rand() * size;
    const y = rand() * size;
    color.ctx.fillStyle = `rgba(160,180,215,${0.05 + rand() * 0.08})`;
    color.ctx.fillRect(x, y, 1 + rand() * 2, 4 + rand() * 10);
  }
  return {
    map: toTexture(color.canvas, true),
    bump: toTexture(bumpC.canvas, false),
  };
};

/** Fine directional strands for the hair bump map. */
export const makeHairBump = () => {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size);
  const rand = mulberry32(99);
  ctx.fillStyle = "#777";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    const x = rand() * size;
    const shade = Math.floor(rand() * 255);
    ctx.strokeStyle = `rgba(${shade},${shade},${shade},0.55)`;
    ctx.lineWidth = 0.6 + rand() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, -10);
    ctx.bezierCurveTo(
      x + (rand() - 0.5) * 12,
      size * 0.33,
      x + (rand() - 0.5) * 12,
      size * 0.66,
      x + (rand() - 0.5) * 8,
      size + 10,
    );
    ctx.stroke();
  }
  return toTexture(canvas, false);
};

/** Very fine noise for skin pores and micro-variation. */
export const makeSkinBump = () => {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size);
  const rand = mulberry32(3);
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = 128 + (rand() - 0.5) * 70;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // Soft blur so the pores read as gentle dimples, not sharp grain.
  ctx.filter = "blur(0.7px)";
  ctx.drawImage(canvas, 0, 0);
  return toTexture(canvas, false);
};

/** Eye texture: pupil at the top pole (rotated to face forward), iris rings. */
export const makeEyeMap = () => {
  const w = 512;
  const h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D canvas not available");
  }
  const rand = mulberry32(42);
  // Sclera with a faint warm tint towards the edges.
  const sclera = ctx.createLinearGradient(0, 0, 0, h);
  sclera.addColorStop(0, "#f4efe8");
  sclera.addColorStop(0.5, "#ebe1d6");
  sclera.addColorStop(1, "#d9c4b5");
  ctx.fillStyle = sclera;
  ctx.fillRect(0, 0, w, h);
  // Iris band (v from the top pole).
  const pupilEnd = h * 0.07;
  const irisEnd = h * 0.165;
  const iris = ctx.createLinearGradient(0, pupilEnd, 0, irisEnd);
  iris.addColorStop(0, "#4b3220");
  iris.addColorStop(0.45, "#6e4a2a");
  iris.addColorStop(0.85, "#3b2a1a");
  iris.addColorStop(1, "#1d140d");
  ctx.fillStyle = iris;
  ctx.fillRect(0, pupilEnd, w, irisEnd - pupilEnd);
  // Radial iris fibres.
  for (let i = 0; i < 260; i++) {
    const x = rand() * w;
    ctx.strokeStyle = `rgba(${150 + rand() * 60},${110 + rand() * 40},${60 + rand() * 30},0.35)`;
    ctx.lineWidth = 1 + rand() * 1.5;
    ctx.beginPath();
    ctx.moveTo(x, pupilEnd);
    ctx.lineTo(x + (rand() - 0.5) * 6, irisEnd - 2);
    ctx.stroke();
  }
  ctx.fillStyle = "#070505";
  ctx.fillRect(0, 0, w, pupilEnd);
  // Limbal ring softening into the sclera.
  const limbal = ctx.createLinearGradient(0, irisEnd - 3, 0, irisEnd + 6);
  limbal.addColorStop(0, "rgba(20,14,10,0.9)");
  limbal.addColorStop(1, "rgba(20,14,10,0)");
  ctx.fillStyle = limbal;
  ctx.fillRect(0, irisEnd - 3, w, 9);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
};

/** Radial falloff used for the soft contact shadow under the feet. */
export const makeRadialAlpha = () => {
  const size = 128;
  const { canvas, ctx } = makeCanvas(size);
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.5, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return toTexture(canvas, false);
};
