// Procedural geometry helpers for the CharacterTest composition.
// Everything is generated once from code (no external model files), so the
// scene stays fully deterministic and needs no downloads or paid assets.

import {
  BufferGeometry,
  CatmullRomCurve3,
  Float32BufferAttribute,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from "three";

/** One cross-section of a loft. Sections are stacked along the Y axis. */
export type Section = {
  y: number;
  /** Half-width along X. */
  rx: number;
  /** Half-depth along Z. */
  rz: number;
  /** Offset of the section centre. */
  cx?: number;
  cz?: number;
  /** Superellipse exponent: 2 = ellipse, higher = boxier. */
  p?: number;
  /** Extra forward bulge on the +Z half (e.g. chest, calves via negative). */
  front?: number;
};

const catmull = (p0: number, p1: number, p2: number, p3: number, t: number) => {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
};

const KEYS: (keyof Section)[] = ["y", "rx", "rz", "cx", "cz", "p", "front"];

/** Smoothly resamples sections with Catmull-Rom so silhouettes stay organic. */
const resample = (sections: Section[], steps: number): Required<Section>[] => {
  const full = sections.map((s) => ({
    cx: 0,
    cz: 0,
    p: 2,
    front: 0,
    ...s,
  }));
  if (full.length < 2) {
    return full;
  }
  const out: Required<Section>[] = [];
  for (let i = 0; i < full.length - 1; i++) {
    const s0 = full[Math.max(0, i - 1)];
    const s1 = full[i];
    const s2 = full[i + 1];
    const s3 = full[Math.min(full.length - 1, i + 2)];
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const s = {} as Required<Section>;
      for (const key of KEYS) {
        s[key] = catmull(
          s0[key] as number,
          s1[key] as number,
          s2[key] as number,
          s3[key] as number,
          t,
        );
      }
      out.push(s);
    }
  }
  out.push(full[full.length - 1]);
  return out;
};

/**
 * Averages normals of vertices that share a position. Removes the lighting
 * seams that appear where UV seams duplicate vertices (spheres, lofts).
 */
export const smoothNormalsByPosition = (geo: BufferGeometry) => {
  geo.computeVertexNormals();
  const pos = geo.getAttribute("position");
  const nrm = geo.getAttribute("normal");
  const groups = new Map<string, number[]>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${Math.round(pos.getX(i) * 1e5)},${Math.round(
      pos.getY(i) * 1e5,
    )},${Math.round(pos.getZ(i) * 1e5)}`;
    const list = groups.get(key);
    if (list) {
      list.push(i);
    } else {
      groups.set(key, [i]);
    }
  }
  const n = new Vector3();
  for (const list of groups.values()) {
    if (list.length < 2) {
      continue;
    }
    n.set(0, 0, 0);
    for (const i of list) {
      n.x += nrm.getX(i);
      n.y += nrm.getY(i);
      n.z += nrm.getZ(i);
    }
    n.normalize();
    for (const i of list) {
      nrm.setXYZ(i, n.x, n.y, n.z);
    }
  }
  nrm.needsUpdate = true;
  return geo;
};

/**
 * Builds a smooth closed surface from cross-sections stacked along Y.
 * Used for the torso, limbs, neck and clothing.
 */
export const loft = (
  sections: Section[],
  {
    radial = 32,
    steps = 4,
    capTop = false,
    capBottom = false,
    uScale = 1,
    vScale = 1,
  }: {
    radial?: number;
    steps?: number;
    capTop?: boolean;
    capBottom?: boolean;
    uScale?: number;
    vScale?: number;
  } = {},
) => {
  const sorted = [...sections].sort((a, b) => a.y - b.y);
  const rings = resample(sorted, steps);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const cols = radial + 1;

  // Arc length along the profile for even V texture coordinates.
  let acc = 0;
  const vAt: number[] = [0];
  for (let j = 1; j < rings.length; j++) {
    const a = rings[j - 1];
    const b = rings[j];
    acc += Math.hypot(b.y - a.y, (b.rx + b.rz) / 2 - (a.rx + a.rz) / 2);
    vAt.push(acc);
  }

  for (let j = 0; j < rings.length; j++) {
    const r = rings[j];
    for (let i = 0; i < cols; i++) {
      const th = (i / radial) * Math.PI * 2;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const e = 2 / r.p;
      const x = Math.sign(c) * Math.pow(Math.abs(c), e) * r.rx;
      let z = Math.sign(s) * Math.pow(Math.abs(s), e) * r.rz;
      if (s > 0) {
        z += r.front * Math.pow(s, 2) * (1 - Math.pow(Math.abs(c), 3));
      }
      positions.push(x + r.cx, r.y, z + r.cz);
      uvs.push((i / radial) * uScale, vAt[j] * vScale);
    }
  }

  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < radial; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const addCap = (ringIndex: number, top: boolean) => {
    const r = rings[ringIndex];
    const center = positions.length / 3;
    positions.push(r.cx, r.y, r.cz);
    uvs.push(0.5, vAt[ringIndex] * vScale);
    for (let i = 0; i < radial; i++) {
      const a = ringIndex * cols + i;
      const b = a + 1;
      if (top) {
        indices.push(center, b, a);
      } else {
        indices.push(center, a, b);
      }
    }
  };
  if (capBottom) {
    addCap(0, false);
  }
  if (capTop) {
    addCap(rings.length - 1, true);
  }

  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return smoothNormalsByPosition(geo);
};

/**
 * Sphere whose every vertex is passed through `fn` (input: point on the unit
 * sphere, +Z = forward). Used to sculpt the head, nose, lips, shoes, etc.
 */
export const sculptSphere = (
  fn: (v: Vector3) => Vector3,
  widthSegments = 48,
  heightSegments = 32,
  colorFn?: (v: Vector3) => [number, number, number],
) => {
  const geo = new SphereGeometry(1, widthSegments, heightSegments);
  const pos = geo.getAttribute("position");
  const colors: number[] = [];
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    if (colorFn) {
      colors.push(...colorFn(v.clone()));
    }
    const out = fn(v.clone());
    pos.setXYZ(i, out.x, out.y, out.z);
  }
  pos.needsUpdate = true;
  if (colorFn) {
    geo.setAttribute("color", new Float32BufferAttribute(colors, 3));
  }
  return smoothNormalsByPosition(geo);
};

/**
 * Tube along a smooth curve whose radius varies along its length.
 * Used for eyebrows, lash lines, hair clumps, ear rims and laces.
 */
export const taperedTube = (
  points: [number, number, number][],
  radius: (t: number) => number,
  tubular = 24,
  radialSegments = 8,
) => {
  const curve = new CatmullRomCurve3(points.map((p) => new Vector3(...p)));
  const geo = new TubeGeometry(curve, tubular, 1, radialSegments, false);
  const pos = geo.getAttribute("position");
  const p = new Vector3();
  const center = new Vector3();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    curve.getPointAt(t, center);
    const r = radius(t);
    for (let j = 0; j <= radialSegments; j++) {
      const idx = i * (radialSegments + 1) + j;
      p.set(pos.getX(idx), pos.getY(idx), pos.getZ(idx));
      p.sub(center).multiplyScalar(r).add(center);
      pos.setXYZ(idx, p.x, p.y, p.z);
    }
  }
  pos.needsUpdate = true;
  return smoothNormalsByPosition(geo);
};

/** Gaussian falloff by angular distance between two unit directions. */
export const bump = (v: Vector3, target: Vector3, width: number) => {
  const d = v.distanceTo(target);
  return Math.exp(-(d * d) / (width * width));
};

export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
