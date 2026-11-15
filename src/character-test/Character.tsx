import React, { useLayoutEffect, useMemo, useRef } from "react";
import { useCurrentFrame } from "remotion";
import {
  BoxGeometry,
  CapsuleGeometry,
  Color,
  Group,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import { loft, Section, sculptSphere, smoothstep, taperedTube } from "./geometry";
import {
  EYE_RADIUS,
  eyeCenter,
  makeBrowGeometry,
  makeEarGeometries,
  makeHairGeometry,
  makeHeadGeometry,
  makeLipGeometry,
  makeNoseGeometry,
  headPoint,
  SKIN,
} from "./head";
import {
  blinkAt,
  breath,
  browRaise,
  cameraAt,
  drift,
  gazeAt,
} from "./motion";
import {
  makeDenim,
  makeEyeMap,
  makeHairBump,
  makeKnitBump,
  makeSkinBump,
} from "./textures";

// Key body landmarks, in metres. The character stands at the origin facing +Z.
const HIP_Y = 0.86;
const HIP_X = 0.088;
const SPINE_Y = 0.95;
// Belt loops sit on the belt's superellipse surface at x = ±0.1.
const BELT_LOOP_Z =
  0.1065 * Math.pow(1 - Math.pow(0.1 / 0.1585, 2.3), 1 / 2.3) + 0.0015;
const SHOULDER = new Vector3(0.152, 1.372, -0.012);
const NECK_BASE = new Vector3(0, 1.47, -0.015);
const HEAD_CENTER = new Vector3(0, 1.628, 0.014);
const THIGH = 0.41;
const SHIN = 0.37;
const UPPER_ARM = 0.29;
const FOREARM = 0.255;

const useMaterials = () =>
  useMemo(() => {
    const skinBump = makeSkinBump();
    skinBump.repeat.set(18, 9);
    const knit = makeKnitBump();
    const denim = makeDenim();
    const hairBump = makeHairBump();
    hairBump.repeat.set(9, 3);

    const skinProps = {
      roughness: 0.5,
      sheen: 0.35,
      sheenRoughness: 0.55,
      sheenColor: new Color("#ff8a6a"),
      bumpMap: skinBump,
      bumpScale: 0.35,
    };
    const fabricKnit = (color: string) =>
      new MeshPhysicalMaterial({
        color,
        roughness: 0.92,
        sheen: 0.6,
        sheenRoughness: 0.8,
        sheenColor: new Color("#ffc09a"),
        bumpMap: knit,
        bumpScale: 1.1,
      });

    return {
      skin: new MeshPhysicalMaterial({ color: SKIN, ...skinProps }),
      face: new MeshPhysicalMaterial({
        color: SKIN,
        vertexColors: true,
        ...skinProps,
      }),
      // Nose and lips carry their own colours in vertex colours.
      nose: new MeshPhysicalMaterial({ vertexColors: true, ...skinProps }),
      ear: new MeshPhysicalMaterial({ color: "#d9957a", ...skinProps }),
      lip: new MeshPhysicalMaterial({
        vertexColors: true,
        roughness: 0.36,
        sheen: 0.3,
        sheenColor: new Color("#ff9a8a"),
      }),
      mouth: new MeshStandardMaterial({ color: "#3e1a15", roughness: 0.8 }),
      nail: new MeshPhysicalMaterial({
        color: "#e8b4a2",
        roughness: 0.25,
        clearcoat: 0.6,
      }),
      eye: new MeshPhysicalMaterial({
        map: makeEyeMap(),
        roughness: 0.06,
        clearcoat: 1,
        clearcoatRoughness: 0.02,
      }),
      lash: new MeshStandardMaterial({ color: "#1d120c", roughness: 0.7 }),
      brow: new MeshStandardMaterial({ color: "#2e1c11", roughness: 0.75 }),
      hair: new MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.72,
        envMapIntensity: 0.5,
        bumpMap: hairBump,
        bumpScale: 1.4,
      }),
      sweater: fabricKnit("#c4602c"),
      sweaterRib: fabricKnit("#b9582a"),
      shirt: new MeshStandardMaterial({ color: "#efebe4", roughness: 0.9 }),
      denim: new MeshStandardMaterial({
        map: denim.map,
        bumpMap: denim.bump,
        bumpScale: 1.5,
        roughness: 0.86,
      }),
      stitch: new MeshStandardMaterial({ color: "#c98b3e", roughness: 0.8 }),
      belt: new MeshStandardMaterial({ color: "#3b2519", roughness: 0.45 }),
      metal: new MeshStandardMaterial({
        color: "#b9a27a",
        metalness: 1,
        roughness: 0.35,
        envMapIntensity: 0.6,
      }),
      shoe: new MeshStandardMaterial({ color: "#f2f1ee", roughness: 0.62 }),
      sole: new MeshStandardMaterial({ color: "#e6dfd2", roughness: 0.8 }),
      shoeAccent: new MeshStandardMaterial({ color: "#264b6e", roughness: 0.55 }),
    };
  }, []);

type Mats = ReturnType<typeof useMaterials>;

/** Shadow-casting mesh shorthand. */
const M: React.FC<
  React.ComponentProps<"mesh"> & { readonly shadow?: boolean }
> = ({ shadow = true, ...props }) => (
  <mesh castShadow={shadow} receiveShadow {...props} />
);

/** Rotates its children around a point given in the parent's coordinates. */
const Pivot: React.FC<{
  readonly at: Vector3;
  readonly rotation?: [number, number, number];
  readonly position?: [number, number, number];
  readonly scale?: [number, number, number];
  readonly children: React.ReactNode;
}> = ({ at, rotation = [0, 0, 0], position = [0, 0, 0], scale, children }) => (
  <group
    position={[at.x + position[0], at.y + position[1], at.z + position[2]]}
    rotation={[rotation[0], rotation[1], rotation[2], "YXZ"]}
    scale={scale}
  >
    <group position={[-at.x, -at.y, -at.z]}>{children}</group>
  </group>
);

// ---------------------------------------------------------------- geometry

const useBodyGeometry = () =>
  useMemo(() => {
    const knitUV = { uScale: 18, vScale: 16 };
    const ribUV = { uScale: 40, vScale: 4 };
    const denimUV = { uScale: 6, vScale: 12 };

    const torsoSections: Section[] = [
      { y: 0.97, rx: 0.161, rz: 0.106, p: 2.3 },
      { y: 1.04, rx: 0.152, rz: 0.1, p: 2.3 },
      { y: 1.1, rx: 0.147, rz: 0.098, p: 2.3, front: 0.004 },
      { y: 1.19, rx: 0.158, rz: 0.104, p: 2.3, front: 0.012 },
      { y: 1.28, rx: 0.162, rz: 0.104, p: 2.4, front: 0.018 },
      { y: 1.34, rx: 0.168, rz: 0.1, p: 2.5, front: 0.014, cz: -0.004 },
      { y: 1.38, rx: 0.166, rz: 0.093, p: 2.5, cz: -0.009 },
      { y: 1.41, rx: 0.148, rz: 0.084, p: 2.3, cz: -0.013 },
      { y: 1.44, rx: 0.112, rz: 0.073, p: 2.1, cz: -0.015 },
      { y: 1.462, rx: 0.084, rz: 0.066, p: 2, cz: -0.014 },
      { y: 1.478, rx: 0.068, rz: 0.06, p: 2, cz: -0.013 },
    ];

    // Outer edge of the leg, used to place the outseam stitching.
    const seam = (sections: Section[], side: number) =>
      sections.map(
        (s) =>
          [side * (s.rx + 0.0009), s.y, s.cz ?? 0] as [number, number, number],
      );

    const thigh: Section[] = [
      { y: 0.09, rx: 0.088, rz: 0.094 },
      { y: 0, rx: 0.087, rz: 0.091 },
      { y: -0.1, rx: 0.08, rz: 0.084 },
      { y: -0.25, rx: 0.068, rz: 0.07 },
      { y: -0.41, rx: 0.058, rz: 0.06 },
    ];
    const shin: Section[] = [
      { y: 0.01, rx: 0.058, rz: 0.06 },
      { y: -0.1, rx: 0.054, rz: 0.06, cz: -0.006 },
      { y: -0.22, rx: 0.05, rz: 0.052 },
      { y: -0.33, rx: 0.052, rz: 0.054 },
    ];

    const shoeTop = (z: number) =>
      -0.002 - 0.04 * smoothstep(-0.02, 0.15, z);

    return {
      torso: loft(torsoSections, { radial: 48, steps: 5, ...knitUV }),
      hemRib: loft(
        [
          { y: 0.952, rx: 0.165, rz: 0.11, p: 2.3 },
          { y: 0.975, rx: 0.166, rz: 0.111, p: 2.3 },
          { y: 0.995, rx: 0.164, rz: 0.109, p: 2.3 },
        ],
        { radial: 48, ...ribUV },
      ),
      collarRib: loft(
        [
          { y: 1.456, rx: 0.076, rz: 0.068, cz: -0.012 },
          { y: 1.472, rx: 0.075, rz: 0.067, cz: -0.012 },
          { y: 1.488, rx: 0.067, rz: 0.06, cz: -0.012 },
        ],
        { radial: 40, ...ribUV },
      ),
      shirtCollar: loft(
        [
          { y: 1.47, rx: 0.065, rz: 0.06, cz: -0.012 },
          { y: 1.494, rx: 0.061, rz: 0.057, cz: -0.012 },
        ],
        { radial: 40 },
      ),
      pelvis: loft(
        [
          { y: 0.772, rx: 0.06, rz: 0.045, p: 2 },
          { y: 0.81, rx: 0.122, rz: 0.084, p: 2.1 },
          { y: 0.86, rx: 0.152, rz: 0.1, p: 2.3 },
          { y: 0.94, rx: 0.154, rz: 0.102, p: 2.3 },
          // Continues up inside the sweater so its open hem never shows a gap.
          { y: 1.01, rx: 0.145, rz: 0.096, p: 2.3 },
        ],
        { radial: 48, capTop: true, ...denimUV },
      ),
      belt: loft(
        [
          { y: 0.904, rx: 0.1585, rz: 0.1065, p: 2.3 },
          { y: 0.931, rx: 0.1585, rz: 0.1065, p: 2.3 },
        ],
        { radial: 48, steps: 1 },
      ),
      buckle: new BoxGeometry(0.042, 0.033, 0.006),
      buckleInner: new BoxGeometry(0.03, 0.021, 0.007),
      beltLoop: new BoxGeometry(0.012, 0.04, 0.004),
      neck: loft(
        [
          { y: 1.4, rx: 0.062, rz: 0.056, cz: -0.012 },
          { y: 1.47, rx: 0.058, rz: 0.054, cz: -0.012 },
          { y: 1.52, rx: 0.056, rz: 0.053, cz: -0.009, front: 0.004 },
          { y: 1.57, rx: 0.054, rz: 0.052, cz: -0.006 },
          { y: 1.6, rx: 0.05, rz: 0.05, cz: -0.004 },
        ],
        { radial: 32 },
      ),
      upperSleeve: loft(
        [
          { y: 0.036, rx: 0.02, rz: 0.022 },
          { y: 0.026, rx: 0.04, rz: 0.043 },
          { y: 0.0, rx: 0.049, rz: 0.052 },
          { y: -0.06, rx: 0.047, rz: 0.049 },
          { y: -0.16, rx: 0.043, rz: 0.045 },
          { y: -0.26, rx: 0.04, rz: 0.041 },
          { y: -0.3, rx: 0.039, rz: 0.04 },
        ],
        { radial: 28, capTop: true, ...knitUV },
      ),
      elbow: new SphereGeometry(0.0395, 20, 14),
      forearmSleeve: loft(
        [
          { y: 0.01, rx: 0.039, rz: 0.04 },
          { y: -0.08, rx: 0.038, rz: 0.04 },
          { y: -0.17, rx: 0.034, rz: 0.035 },
          { y: -0.21, rx: 0.032, rz: 0.033 },
        ],
        { radial: 28, ...knitUV },
      ),
      cuff: loft(
        [
          { y: -0.2, rx: 0.034, rz: 0.035 },
          { y: -0.222, rx: 0.035, rz: 0.036 },
          { y: -0.243, rx: 0.03, rz: 0.031 },
        ],
        { radial: 28, ...ribUV },
      ),
      wrist: loft(
        [
          { y: -0.215, rx: 0.019, rz: 0.026 },
          { y: -0.262, rx: 0.018, rz: 0.025 },
        ],
        { radial: 20, capBottom: true },
      ),
      palm: loft(
        [
          { y: 0.022, rx: 0.014, rz: 0.02 },
          { y: 0.008, rx: 0.018, rz: 0.025 },
          { y: -0.03, rx: 0.02, rz: 0.035 },
          { y: -0.07, rx: 0.017, rz: 0.037 },
          { y: -0.094, rx: 0.013, rz: 0.035 },
          // Rounded off under the knuckles (hidden by the fingers).
          { y: -0.101, rx: 0.009, rz: 0.026 },
          { y: -0.105, rx: 0.003, rz: 0.01 },
        ],
        { radial: 24, capBottom: true, steps: 4 },
      ),
      thigh: loft(thigh, { radial: 32, ...denimUV }),
      knee: new SphereGeometry(0.058, 20, 14),
      shin: loft(shin, { radial: 32, ...denimUV }),
      rolledCuff: loft(
        [
          { y: -0.325, rx: 0.055, rz: 0.057 },
          { y: -0.34, rx: 0.057, rz: 0.059 },
          { y: -0.357, rx: 0.055, rz: 0.057 },
        ],
        { radial: 32, ...denimUV },
      ),
      seamThighL: taperedTube(seam(thigh, 1), () => 0.0012, 24, 4),
      seamThighR: taperedTube(seam(thigh, -1), () => 0.0012, 24, 4),
      seamShinL: taperedTube(seam(shin.slice(0, 4), 1), () => 0.0012, 24, 4),
      seamShinR: taperedTube(seam(shin.slice(0, 4), -1), () => 0.0012, 24, 4),
      shoeUpper: sculptSphere(
        (u) => {
          const z = u.z * 0.122 + 0.04;
          const toe = smoothstep(-0.1, 1, u.z);
          const x = u.x * 0.046 * (1 - 0.18 * toe);
          const top = 0.075 - 0.045 * toe;
          const y = u.y > 0 ? u.y * top : u.y * 0.012;
          return new Vector3(x, y - 0.066, z);
        },
        36,
        24,
      ),
      sole: sculptSphere(
        (u) =>
          new Vector3(
            u.x * 0.05,
            Math.max(-0.75, Math.min(0.75, u.y)) * 0.017 - 0.067,
            u.z * 0.13 + 0.04,
          ),
        36,
        16,
      ),
      laces: [0.035, 0.06, 0.085, 0.108].map((z) =>
        taperedTube(
          [
            [-0.017, shoeTop(z) - 0.012, z],
            [0, shoeTop(z) - 0.0085, z + 0.002],
            [0.017, shoeTop(z) - 0.012, z],
          ],
          () => 0.0024,
          10,
          6,
        ),
      ),
      shoeStripe: (side: number) =>
        taperedTube(
          [
            [side * 0.045, -0.055, -0.04],
            [side * 0.047, -0.04, 0.02],
            [side * 0.042, -0.05, 0.09],
          ],
          (t) => 0.004 * Math.sin(Math.PI * (0.05 + 0.9 * t)),
          16,
          6,
        ),
    };
  }, []);

const useHeadGeometry = () =>
  useMemo(() => {
    const ears = makeEarGeometries();
    // Upper lid covers the top of the eyeball; lower lid the bottom.
    const lidUpper = new SphereGeometry(
      EYE_RADIUS * 1.09,
      28,
      12,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2,
    );
    const lidLower = new SphereGeometry(
      EYE_RADIUS * 1.07,
      28,
      12,
      0,
      Math.PI * 2,
      Math.PI / 2,
      Math.PI / 2,
    );
    const lashArc = (r: number, y: number) => {
      const pts: [number, number, number][] = [];
      for (let i = 0; i <= 8; i++) {
        const a = -1.05 + (i / 8) * 2.1;
        pts.push([Math.sin(a) * r, y, Math.cos(a) * r]);
      }
      return pts;
    };
    const eye = new SphereGeometry(EYE_RADIUS, 32, 24);
    eye.rotateX(Math.PI / 2); // pupil (top pole of the texture) faces +Z
    return {
      head: makeHeadGeometry(),
      hair: makeHairGeometry(),
      browL: makeBrowGeometry(1),
      browR: makeBrowGeometry(-1),
      nose: makeNoseGeometry(),
      upperLip: makeLipGeometry(true),
      lowerLip: makeLipGeometry(false),
      mouthLine: taperedTube(
        [
          [-0.017, 0.0022, 0.0012],
          [0, 0.0012, 0.0056],
          [0.017, 0.0022, 0.0012],
        ],
        (t) => 0.0012 * Math.sin(Math.PI * (0.05 + 0.9 * t)),
        20,
        6,
      ),
      earShell: ears.shell,
      earRim: ears.rim,
      eye,
      lidUpper,
      lidLower,
      upperLash: taperedTube(
        lashArc(EYE_RADIUS * 1.11, 0),
        (t) => 0.0011 * Math.sin(Math.PI * (0.05 + 0.9 * t)),
        24,
        6,
      ),
      lowerLash: taperedTube(
        lashArc(EYE_RADIUS * 1.08, 0),
        (t) => 0.0005 * Math.sin(Math.PI * (0.05 + 0.9 * t)),
        24,
        6,
      ),
      nailGeo: new SphereGeometry(1, 12, 8),
    };
  }, []);

type HeadGeo = ReturnType<typeof useHeadGeometry>;

// --------------------------------------------------------------- body parts

const Finger: React.FC<{
  readonly mats: Mats;
  readonly geo: HeadGeo;
  readonly length: number;
  readonly curl: number;
  readonly side: number;
}> = ({ mats, geo, length, curl, side }) => {
  const lens = useMemo(
    () => [length * 0.45, length * 0.3, length * 0.25],
    [length],
  );
  const segs = useMemo(
    () =>
      lens.map((l, k) => {
        const r = 0.0088 - k * 0.0009;
        return new CapsuleGeometry(r, Math.max(0.001, l - r * 2 + 0.009), 6, 12);
      }),
    [lens],
  );
  const curls = [curl * 0.7, curl * 1.2, curl * 0.9];
  // Nest the three phalanges so each bends from the end of the previous one.
  let content: React.ReactNode = null;
  for (let k = 2; k >= 0; k--) {
    const r = 0.0088 - k * 0.0009;
    content = (
      <group rotation={[0, 0, -side * curls[k]]}>
        <M
          geometry={segs[k]}
          material={mats.skin}
          position={[0, -lens[k] / 2, 0]}
        />
        {k === 2 ? (
          <M
            geometry={geo.nailGeo}
            material={mats.nail}
            position={[side * (r - 0.0012), -lens[k] * 0.55, 0]}
            scale={[0.0018, r * 1.15, r * 0.82]}
            shadow={false}
          />
        ) : null}
        <group position={[0, -lens[k], 0]}>{content}</group>
      </group>
    );
  }
  return <>{content}</>;
};

const Hand: React.FC<{
  readonly mats: Mats;
  readonly body: ReturnType<typeof useBodyGeometry>;
  readonly geo: HeadGeo;
  readonly side: number;
  readonly relax: number;
}> = ({ mats, body, geo, side, relax }) => {
  const fingers = [
    { z: 0.0225, len: 0.074, curl: 0.22 },
    { z: 0.0075, len: 0.082, curl: 0.28 },
    { z: -0.0075, len: 0.077, curl: 0.34 },
    { z: -0.0225, len: 0.062, curl: 0.42 },
  ];
  return (
    <group>
      <M geometry={body.palm} material={mats.skin} />
      {fingers.map((f) => (
        <group key={f.z} position={[0, -0.088, f.z]}>
          <Finger
            mats={mats}
            geo={geo}
            length={f.len}
            curl={f.curl + relax}
            side={side}
          />
        </group>
      ))}
      {/* Thumb sits on the front edge and points down and forward. */}
      <group
        position={[-side * 0.004, -0.026, 0.028]}
        rotation={[-0.12, 0, -side * 0.12]}
      >
        <Finger mats={mats} geo={geo} length={0.062} curl={0.18} side={side} />
      </group>
    </group>
  );
};

const Arm: React.FC<{
  readonly mats: Mats;
  readonly body: ReturnType<typeof useBodyGeometry>;
  readonly geo: HeadGeo;
  readonly side: number;
  readonly frame: number;
}> = ({ mats, body, geo, side, frame }) => {
  const b = breath(frame);
  const sway = drift(frame, side > 0 ? 2 : 5);
  return (
    <group
      position={[side * SHOULDER.x, SHOULDER.y, SHOULDER.z]}
      rotation={[0.03 + 0.015 * sway, 0, side * (0.1 + 0.008 * b)]}
    >
      <M geometry={body.upperSleeve} material={mats.sweater} />
      <group
        position={[0, -UPPER_ARM, 0]}
        rotation={[-0.2 - 0.02 * sway, 0, -side * 0.04]}
      >
        <M geometry={body.elbow} material={mats.sweater} />
        <M geometry={body.forearmSleeve} material={mats.sweater} />
        <M geometry={body.cuff} material={mats.sweaterRib} />
        <M geometry={body.wrist} material={mats.skin} />
        <group position={[0, -FOREARM, 0]} rotation={[0.05, 0, side * 0.06]}>
          <Hand
            mats={mats}
            body={body}
            geo={geo}
            side={side}
            relax={0.03 * b}
          />
        </group>
      </group>
    </group>
  );
};

const Leg: React.FC<{
  readonly mats: Mats;
  readonly body: ReturnType<typeof useBodyGeometry>;
  readonly side: number;
  readonly lean: number;
}> = ({ mats, body, side, lean }) => (
  <group position={[side * HIP_X, HIP_Y, 0]} rotation={[0, 0, lean]}>
    <M geometry={body.thigh} material={mats.denim} />
    <M
      geometry={side > 0 ? body.seamThighL : body.seamThighR}
      material={mats.stitch}
      shadow={false}
    />
    <group position={[0, -THIGH, 0]} rotation={[0.015, 0, 0]}>
      <M geometry={body.knee} material={mats.denim} />
      <M geometry={body.shin} material={mats.denim} />
      <M geometry={body.rolledCuff} material={mats.denim} />
      <M
        geometry={side > 0 ? body.seamShinL : body.seamShinR}
        material={mats.stitch}
        shadow={false}
      />
      <group
        position={[0, -SHIN, 0]}
        rotation={[-0.015, side * 0.12, -lean]}
      >
        <M geometry={body.shoeUpper} material={mats.shoe} />
        <M geometry={body.sole} material={mats.sole} />
        <M geometry={body.shoeStripe(side)} material={mats.shoeAccent} />
        {body.laces.map((g, i) => (
          <M key={i} geometry={g} material={mats.shoe} shadow={false} />
        ))}
      </group>
    </group>
  </group>
);

const Eye: React.FC<{
  readonly mats: Mats;
  readonly geo: HeadGeo;
  readonly side: number;
  readonly blink: number;
  readonly eyeRef: React.RefObject<Group | null>;
}> = ({ mats, geo, side, blink, eyeRef }) => {
  const c = eyeCenter(side);
  // Upper lid: open = tilted back, closed = rotated down over the eye.
  const upper = -0.6 + blink * 1.05;
  const lower = 0.5 - blink * 0.25;
  return (
    <group position={[c.x, c.y, c.z]}>
      <group ref={eyeRef}>
        <mesh geometry={geo.eye} material={mats.eye} />
      </group>
      <group rotation={[upper, 0, side * 0.05]}>
        <M geometry={geo.lidUpper} material={mats.skin} shadow={false} />
        <mesh geometry={geo.upperLash} material={mats.lash} />
      </group>
      <group rotation={[lower, 0, -side * 0.05]}>
        <M geometry={geo.lidLower} material={mats.skin} shadow={false} />
        <mesh geometry={geo.lowerLash} material={mats.lash} />
      </group>
    </group>
  );
};

const Head: React.FC<{
  readonly mats: Mats;
  readonly geo: HeadGeo;
  readonly frame: number;
  readonly eyeL: React.RefObject<Group | null>;
  readonly eyeR: React.RefObject<Group | null>;
}> = ({ mats, geo, frame, eyeL, eyeR }) => {
  const blink = blinkAt(frame);
  const brow = browRaise(frame);
  const nose = headPoint(new Vector3(0, -0.18, 1).normalize());
  const mouth = headPoint(new Vector3(0, -0.56, 0.83).normalize());
  const earL = headPoint(new Vector3(1, -0.1, -0.08).normalize());
  return (
    <group
      position={[HEAD_CENTER.x, HEAD_CENTER.y, HEAD_CENTER.z]}
      scale={1.14}
    >
      <M geometry={geo.head} material={mats.face} />
      <M geometry={geo.hair} material={mats.hair} />
      <group position={[0, 0.0022 * brow, 0.0006 * brow]}>
        <mesh geometry={geo.browL} material={mats.brow} />
        <mesh geometry={geo.browR} material={mats.brow} />
      </group>
      <Eye mats={mats} geo={geo} side={1} blink={blink} eyeRef={eyeL} />
      <Eye mats={mats} geo={geo} side={-1} blink={blink} eyeRef={eyeR} />
      <group position={[nose.x, nose.y + 0.022, nose.z - 0.007]}>
        <M geometry={geo.nose} material={mats.nose} />
      </group>
      <group position={[mouth.x, mouth.y, mouth.z - 0.0045]}>
        <M geometry={geo.upperLip} material={mats.lip} position={[0, 0.0044, 0.0006]} />
        <M geometry={geo.lowerLip} material={mats.lip} position={[0, -0.0054, -0.0004]} />
        <mesh geometry={geo.mouthLine} material={mats.mouth} position={[0, -0.0006, 0.0005]} />
      </group>
      {[-1, 1].map((s) => (
        <group
          key={s}
          position={[s * (earL.x - 0.002), earL.y, earL.z]}
          rotation={[0.08, s * 0.32, s * -0.06]}
        >
          <M geometry={geo.earShell} material={mats.ear} />
          <group scale={[s, 1, 1]}>
            <M geometry={geo.earRim} material={mats.ear} />
          </group>
        </group>
      ))}
    </group>
  );
};

// --------------------------------------------------------------- character

export const Character: React.FC = () => {
  const frame = useCurrentFrame();
  const mats = useMaterials();
  const body = useBodyGeometry();
  const geo = useHeadGeometry();
  const root = useRef<Group>(null);
  const eyeL = useRef<Group>(null);
  const eyeR = useRef<Group>(null);

  const b = breath(frame);
  // Gentle weight shift: pelvis sways, legs compensate so feet stay planted.
  const shift = 0.007 * drift(frame, 1);
  const legLean = -shift / (THIGH + SHIN);
  const hipTilt = 0.6 * shift;

  const { toCamera, headTurn } = gazeAt(frame);
  const cam = cameraAt(frame);
  const headYaw =
    0.24 + (cam.azimuth * 0.85 - 0.24) * headTurn + 0.015 * drift(frame, 7);
  const headPitch = 0.04 - 0.05 * headTurn + 0.01 * drift(frame, 11);
  const headRoll = 0.025 * drift(frame, 13) - 0.02 * headTurn;

  // Eyes aim at a world-space point every frame. Done in a layout effect so
  // it happens before @remotion/three draws the frame.
  useLayoutEffect(() => {
    if (!root.current || !eyeL.current) {
      return;
    }
    root.current.updateWorldMatrix(true, true);
    const headWorld = new Vector3();
    eyeL.current.getWorldPosition(headWorld);
    // Off-camera point roughly where the head is facing at the start.
    const away = headWorld
      .clone()
      .add(new Vector3(Math.sin(0.4) * 2, -0.25, Math.cos(0.4) * 2));
    const target = away.lerp(cam.position, toCamera);
    for (const eye of [eyeL.current, eyeR.current]) {
      eye?.lookAt(target);
    }
  });

  return (
    <group ref={root}>
      <Pivot at={new Vector3(0, HIP_Y, 0)} position={[shift, 0, 0]} rotation={[0, 0, hipTilt]}>
        <M geometry={body.pelvis} material={mats.denim} />
        <M geometry={body.belt} material={mats.belt} />
        <M geometry={body.buckle} material={mats.metal} position={[0, 0.9175, 0.108]} />
        <M geometry={body.buckleInner} material={mats.belt} position={[0, 0.9175, 0.1085]} />
        {[-1, 1].map((s) => (
          <M
            key={s}
            geometry={body.beltLoop}
            material={mats.denim}
            position={[s * 0.1, 0.918, BELT_LOOP_Z]}
            rotation={[0, s * 0.62, 0]}
          />
        ))}
        <Leg mats={mats} body={body} side={1} lean={legLean - hipTilt} />
        <Leg mats={mats} body={body} side={-1} lean={legLean - hipTilt} />

        <Pivot
          at={new Vector3(0, SPINE_Y, 0)}
          rotation={[0.012 * b - 0.01, 0.02 * drift(frame, 3), -hipTilt * 1.4]}
        >
          {/* Breathing expands the chest, mostly front-to-back. */}
          <Pivot
            at={new Vector3(0, 1.0, 0)}
            scale={[1 + 0.006 * b, 1 + 0.004 * b, 1 + 0.014 * b]}
          >
            <M geometry={body.torso} material={mats.sweater} />
            <M geometry={body.hemRib} material={mats.sweaterRib} />
          </Pivot>
          <group position={[0, 0.004 * b, 0]}>
            <M geometry={body.collarRib} material={mats.sweaterRib} />
            <M geometry={body.shirtCollar} material={mats.shirt} />
            <Arm mats={mats} body={body} geo={geo} side={1} frame={frame} />
            <Arm mats={mats} body={body} geo={geo} side={-1} frame={frame} />
            <Pivot at={NECK_BASE} rotation={[headPitch * 0.4, headYaw * 0.3, headRoll * 0.4]}>
              <M geometry={body.neck} material={mats.skin} />
              <Pivot
                at={new Vector3(0, 1.56, -0.005)}
                rotation={[headPitch * 0.6, headYaw * 0.7, headRoll * 0.6]}
              >
                <Head mats={mats} geo={geo} frame={frame} eyeL={eyeL} eyeR={eyeR} />
              </Pivot>
            </Pivot>
          </group>
        </Pivot>
      </Pivot>
    </group>
  );
};

