// Sculpted head and facial features, built from deformed spheres and tubes.
// Coordinates are in metres, local to the head centre. +Z faces forward,
// +X is the character's left.

import { Color, Vector3 } from "three";
import { bump, sculptSphere, smoothstep, taperedTube } from "./geometry";

const dir = (x: number, y: number, z: number) => new Vector3(x, y, z).normalize();

export const SKIN = "#e2a98c";
const SKIN_LINEAR = new Color(SKIN);
const LIP_LINEAR = new Color("#c27464");
const NOSTRIL_LINEAR = new Color("#5a2a20");
export const HAIR = "#3a2416";
const HAIR_LINEAR = new Color(HAIR);

const mixColor = (a: Color, b: Color, t: number): [number, number, number] => {
  const c = a.clone().lerp(b, Math.min(1, Math.max(0, t)));
  return [c.r, c.g, c.b];
};

/** Half-extents of the base skull ellipsoid. */
const HEAD = { rx: 0.074, ry: 0.113, rz: 0.096 };

export const EYE_RADIUS = 0.0127;
export const EYE_DIR = dir(0.37, 0.03, 0.93);

/** Maps a unit direction to a point on the sculpted head surface. */
export const headPoint = (u: Vector3): Vector3 => {
  const lower = smoothstep(0.15, -0.95, u.y);
  const x =
    u.x *
    HEAD.rx *
    (1 - 0.13 * lower * (0.55 + 0.45 * smoothstep(-0.2, 0.8, u.z)));
  let y = u.y * HEAD.ry * (1 - 0.04 * lower);
  let z = u.z * HEAD.rz;
  // Fuller back of the skull (occiput).
  if (u.z < 0) {
    z *= 1 + 0.1 * smoothstep(-0.7, 0.5, u.y);
  }
  // Flatter face plane.
  z -= 0.008 * smoothstep(0.55, 1, u.z) * smoothstep(-0.6, 0.3, u.y);
  // Lift the underside behind the jaw so the jawline reads clearly.
  y += 0.022 * smoothstep(-0.5, -1, u.y) * smoothstep(0.55, -0.3, u.z);

  const p = new Vector3(x, y, z);
  let disp = 0;
  for (const s of [-1, 1]) {
    disp -= 0.0115 * bump(u, dir(0.37 * s, 0.05, 0.93), 0.21); // eye socket
    disp += 0.0055 * bump(u, dir(0.33 * s, 0.27, 0.9), 0.22); // brow ridge
    disp += 0.0065 * bump(u, dir(0.62 * s, -0.12, 0.78), 0.3); // cheekbone
    disp -= 0.004 * bump(u, dir(0.88 * s, 0.32, 0.36), 0.3); // temple
    disp -= 0.0035 * bump(u, dir(0.52 * s, -0.5, 0.7), 0.24); // cheek hollow
    disp += 0.004 * bump(u, dir(0.66 * s, -0.66, 0.2), 0.32); // jaw angle
  }
  disp += 0.007 * bump(u, dir(0, -0.5, 0.87), 0.38); // muzzle
  disp += 0.008 * bump(u, dir(0, -0.8, 0.6), 0.5); // chin
  disp += 0.004 * bump(u, dir(0, 0.12, 1), 0.18); // root of the nose
  p.addScaledVector(u, disp);
  return p;
};

/**
 * Subtle skin tone variation baked into vertex colours (multiplied with the
 * shared skin colour): warmer cheeks, slightly darker under the eyes, and a
 * faint stubble shadow around the jaw and upper lip.
 */
const headColor = (u: Vector3): [number, number, number] => {
  let r = 1;
  let g = 1;
  let b = 1;
  for (const s of [-1, 1]) {
    const cheek = bump(u, dir(0.55 * s, -0.25, 0.8), 0.3);
    r *= 1 + 0.08 * cheek;
    g *= 1 - 0.1 * cheek;
    b *= 1 - 0.08 * cheek;
    const underEye = bump(u, dir(0.36 * s, -0.08, 0.93), 0.12);
    r *= 1 - 0.1 * underEye;
    g *= 1 - 0.12 * underEye;
    b *= 1 - 0.04 * underEye;
  }
  const stubble = Math.min(
    1,
    smoothstep(-0.35, -0.75, u.y) * smoothstep(-0.1, 0.5, u.z) +
      0.6 * bump(u, dir(0, -0.42, 0.9), 0.18),
  );
  r *= 1 - 0.2 * stubble;
  g *= 1 - 0.16 * stubble;
  b *= 1 - 0.08 * stubble;
  return [r, g, b];
};

export const makeHeadGeometry = () => sculptSphere(headPoint, 128, 96, headColor);

/** Where an eyeball sits for a given side (+1 = character's left). */
export const eyeCenter = (side: number) => {
  const d = EYE_DIR.clone();
  d.x *= side;
  const p = headPoint(d);
  p.z -= EYE_RADIUS - 0.0048;
  return p;
};

/** Scalp hairline height as a function of the angle around the head. */
const hairline = (u: Vector3) => {
  const phi = Math.atan2(u.x, u.z);
  // Slight recession at the temples, like a natural adult hairline.
  const temples =
    0.09 * Math.exp(-((Math.abs(phi) - 0.62) ** 2) / 0.03);
  return (
    0.075 +
    0.5 * Math.cos(phi) -
    0.075 * Math.cos(2 * phi) +
    temples +
    0.018 * Math.sin(phi * 7 + 1.3) +
    0.012 * Math.sin(phi * 19 + 0.4) -
    0.03 * Math.exp(-(phi * phi) / 0.02)
  );
};

/**
 * Hair shell: follows the skull, lifts away where there is hair and tucks
 * under the skin where there isn't. Clumpy displacement gives tousled volume.
 */
export const makeHairGeometry = () =>
  sculptSphere(
    (u) => {
      const phi = Math.atan2(u.x, u.z);
      const h = hairline(u);
      const mask = smoothstep(h - 0.04, h + 0.05, u.y);
      // Thin at the hairline, fuller towards the crown: no helmet edge.
      const ramp = smoothstep(h, h + 0.6, u.y);
      const clumps =
        0.0018 * Math.sin(phi * 7 + u.y * 9 + Math.sin(phi * 3) * 2) +
        0.0013 * Math.sin(phi * 13 - u.y * 8 + 2) +
        0.0008 * Math.sin(phi * 23 + u.y * 17);
      const volume =
        0.003 +
        0.011 * smoothstep(0.05, 1, u.y) +
        0.005 * bump(u, dir(0.2, 0.8, 0.5), 0.5);
      const off = -0.006 + mask * 0.0068 + mask * ramp * (volume + clumps);
      const p = headPoint(u);
      const n = p.clone().normalize();
      return p.addScaledVector(n, off);
    },
    96,
    72,
    (u) => {
      // Sparse hair at the hairline lets skin show through: fade to skin.
      const h = hairline(u);
      const density = smoothstep(h - 0.03, h + 0.16, u.y);
      const hair = HAIR_LINEAR.clone().multiplyScalar(
        0.85 + 0.3 * smoothstep(0.4, 1, u.y),
      );
      return mixColor(SKIN_LINEAR, hair, density);
    },
  );

/** Eyebrow following the brow ridge; thicker at the inner end. */
export const makeBrowGeometry = (side: number) => {
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= 4; i++) {
    const k = i / 4;
    const p = headPoint(
      dir((0.13 + k * 0.4) * side, 0.235 + 0.06 * Math.sin(k * Math.PI * 0.85), 0.95 - k * 0.2),
    );
    p.addScaledVector(p.clone().normalize(), 0.0016);
    pts.push([p.x, p.y, p.z]);
  }
  return taperedTube(pts, (t) => 0.0032 * (1 - 0.65 * t) * Math.min(1, t * 8 + 0.4), 24, 8);
};

/**
 * Nose: straight bridge, rounded tip and nostril wings (alae) sculpted into
 * one surface. Nostrils are darkened through vertex colours. Local to its root.
 */
export const makeNoseGeometry = () =>
  sculptSphere(
    (u) => {
      const t = (u.y + 1) / 2; // 0 = base, 1 = bridge top
      const y = -0.047 + t * 0.057;
      const base = 1 - smoothstep(0.08, 0.5, t);
      const width = 0.0058 + 0.0055 * (1 - smoothstep(0.2, 0.85, t)) + 0.0072 * base;
      const tip = 0.0185;
      let depth =
        t > 0.22
          ? tip - (t - 0.22) * 0.0145
          : tip - Math.pow((0.22 - t) / 0.22, 1.6) * 0.009;
      // Wings sit further back than the tip, so the sides recede.
      depth *= 1 - 0.45 * base * Math.pow(Math.abs(u.x), 1.5);
      const x = u.x * width;
      const z = u.z > 0 ? u.z * depth : u.z * 0.006;
      return new Vector3(x, y, z);
    },
    48,
    48,
    (u) => {
      const nostril =
        smoothstep(-0.55, -0.85, u.y) *
        Math.exp(-((Math.abs(u.x) - 0.42) ** 2) / 0.03) *
        smoothstep(-0.1, 0.35, u.z);
      const warm = new Color("#e09a80");
      return mixColor(warm, NOSTRIL_LINEAR, nostril * 1.4);
    },
  );

/** One lip. Upper lip has a cupid's bow; both taper into the mouth corners. */
export const makeLipGeometry = (upper: boolean) =>
  sculptSphere(
    (u) => {
      const w = upper ? 0.0235 : 0.021;
      const h = upper ? 0.0058 : 0.0072;
      const d = upper ? 0.0052 : 0.006;
      const taper = 1 - 0.75 * Math.pow(Math.abs(u.x), 2.2);
      // Corners lift slightly: a relaxed, friendly resting expression.
      let y = u.y * h * taper + 0.0016 * Math.pow(Math.abs(u.x), 2.4);
      if (upper && u.y > 0) {
        // Cupid's bow: two peaks either side of a central dip.
        y += 0.0014 * (Math.exp(-((Math.abs(u.x) - 0.28) ** 2) / 0.02) - 0.6 * Math.exp(-(u.x ** 2) / 0.006));
      }
      return new Vector3(u.x * w, y, Math.max(u.z, -0.3) * d * taper);
    },
    40,
    20,
    (u) => {
      // Lip colour fades into skin at the corners and the outer border.
      const edge = Math.max(
        smoothstep(0.6, 0.95, Math.abs(u.x)),
        smoothstep(0.55, 0.95, upper ? u.y : -u.y) * 0.7,
      );
      return mixColor(LIP_LINEAR, SKIN_LINEAR, edge);
    },
  );

/** Ear: flattened shell plus a rolled rim (helix). Local to the ear centre. */
export const makeEarGeometries = () => {
  const shell = sculptSphere(
    (u) => new Vector3(u.x * 0.0055, u.y * 0.029, u.z * 0.018 - 0.004 * u.y * u.y),
    24,
    20,
  );
  const rimPts: [number, number, number][] = [];
  for (let i = 0; i <= 8; i++) {
    const a = -0.4 + (i / 8) * (Math.PI + 0.9);
    rimPts.push([0.004, Math.sin(a) * 0.026, -Math.cos(a) * 0.016]);
  }
  const rim = taperedTube(rimPts, (t) => 0.0032 * Math.sin(Math.PI * (0.1 + 0.8 * t)), 24, 8);
  return { shell, rim };
};
