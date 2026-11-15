// All motion in CharacterTest is a pure function of the frame number, so any
// frame renders identically no matter the order or which browser tab renders it.

import { Easing, interpolate } from "remotion";
import { Vector3 } from "three";

export const FPS = 30;
export const DURATION_IN_FRAMES = 150;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Smooth cinematic ease: gentle start, long soft landing. */
const cine = Easing.bezier(0.42, 0, 0.18, 1);

/** Camera progress 0..1 over the shot. */
const camT = (frame: number) =>
  interpolate(frame, [0, DURATION_IN_FRAMES - 1], [0, 1], {
    ...clamp,
    easing: cine,
  });

/**
 * Push-in combined with a slight orbit: starts as a knees-up shot from the
 * character's right, ends as a head-and-shoulders close-up nearly face-on.
 */
export const cameraAt = (frame: number) => {
  const t = camT(frame);
  const azimuth = interpolate(t, [0, 1], [-0.36, 0.1]);
  const distance = interpolate(t, [0, 1], [2.75, 1.18]);
  const height = interpolate(t, [0, 1], [1.28, 1.6]);
  const target = new Vector3(
    0,
    interpolate(t, [0, 1], [1.12, 1.55]),
    interpolate(t, [0, 1], [0, 0.03]),
  );
  const position = new Vector3(
    Math.sin(azimuth) * distance,
    height,
    Math.cos(azimuth) * distance,
  );
  return { position, target, azimuth };
};

/** Layered sines with unrelated periods: organic but fully deterministic. */
export const drift = (frame: number, seed: number) => {
  const t = frame / FPS;
  return (
    Math.sin(t * 0.9 + seed * 1.7) * 0.6 +
    Math.sin(t * 1.63 + seed * 3.1) * 0.3 +
    Math.sin(t * 2.71 + seed * 5.3) * 0.1
  );
};

/** Breathing cycle, -1..1, roughly 3.6 s per breath. */
export const breath = (frame: number) =>
  Math.sin((frame / FPS) * ((Math.PI * 2) / 3.6) - 0.6);

/** 0 = eyes open, 1 = closed. Blinks follow the gaze shift, then once more. */
export const blinkAt = (frame: number) => {
  const one = (start: number) =>
    interpolate(frame, [start, start + 2, start + 3, start + 7], [0, 1, 1, 0], clamp);
  return Math.max(one(38), one(116));
};

/**
 * Where the character looks. Eyes first rest off to the side, then make a
 * quick saccade to the lens at ~1.2 s. The head follows more slowly.
 */
export const gazeAt = (frame: number) => {
  const toCamera = interpolate(frame, [34, 39], [0, 1], {
    ...clamp,
    easing: Easing.out(Easing.quad),
  });
  const headTurn = interpolate(frame, [30, 100], [0, 1], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });
  return { toCamera, headTurn };
};

/** Small brow raise as the character makes eye contact. */
export const browRaise = (frame: number) =>
  interpolate(frame, [42, 58, 96, 120], [0, 1, 1, 0.35], {
    ...clamp,
    easing: Easing.inOut(Easing.sin),
  });
