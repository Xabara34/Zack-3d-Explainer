import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import React, { useLayoutEffect, useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import {
  BackSide,
  BufferAttribute,
  Color,
  DirectionalLight,
  Mesh,
  MeshBasicMaterial,
  NeutralToneMapping,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SphereGeometry,
} from "three";
import { Character } from "./Character";
import { cameraAt } from "./motion";
import { makeRadialAlpha } from "./textures";

// Turquoise studio look. The stage colour is a little deeper than the
// background so the floor reads as a surface while the horizon melts away.
const BACKGROUND = "#34bdb8";
const STAGE = "#2fb3ae";

/** Moves the default camera every frame (push-in + slight orbit). */
const CameraRig: React.FC = () => {
  const frame = useCurrentFrame();
  const camera = useThree((s) => s.camera);
  useLayoutEffect(() => {
    const { position, target } = cameraAt(frame);
    camera.position.copy(position);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }, [camera, frame]);
  return null;
};

/**
 * Renderer settings plus a tiny procedural environment map (turquoise
 * surroundings, bright overhead softbox). It gives materials soft, coloured
 * reflections at a one-off cost, instead of expensive real-time GI.
 */
const Look: React.FC = () => {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  const envMap = useMemo(() => {
    const envScene = new Scene();
    const sphere = new SphereGeometry(10, 32, 16);
    const colors: number[] = [];
    const pos = sphere.getAttribute("position");
    const low = new Color("#16706c");
    const mid = new Color(BACKGROUND);
    const high = new Color("#e9fffd");
    const c = new Color();
    for (let i = 0; i < pos.count; i++) {
      const h = pos.getY(i) / 10;
      if (h < 0) {
        c.copy(mid).lerp(low, Math.min(1, -h * 1.5));
      } else {
        c.copy(mid).lerp(high, Math.pow(h, 0.8));
      }
      colors.push(c.r, c.g, c.b);
    }
    sphere.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
    envScene.add(
      new Mesh(sphere, new MeshBasicMaterial({ vertexColors: true, side: BackSide })),
    );
    // Large softbox up front-left, matching the key light direction.
    const softbox = new Mesh(
      new PlaneGeometry(6, 4),
      new MeshBasicMaterial({ color: new Color(6, 5.7, 5.2), side: BackSide }),
    );
    softbox.position.set(-5, 6, 5);
    softbox.lookAt(0, 0, 0);
    envScene.add(softbox);
    const pmrem = new PMREMGenerator(gl);
    const target = pmrem.fromScene(envScene, 0.03);
    pmrem.dispose();
    return target.texture;
  }, [gl]);

  useLayoutEffect(() => {
    gl.toneMapping = NeutralToneMapping;
    gl.toneMappingExposure = 1.0;
    scene.environment = envMap;
    scene.environmentIntensity = 0.4;
    return () => {
      scene.environment = null;
    };
  }, [gl, scene, envMap]);

  return null;
};

/** Floor that curves up into a back wall (a photo-studio "cyclorama"). */
const useCycloramaGeometry = () =>
  useMemo(() => {
    const geo = new PlaneGeometry(40, 1, 1, 80);
    const pos = geo.getAttribute("position");
    const floorFront = 10;
    const floorBack = -4;
    const radius = 4;
    const wallHeight = 14;
    const arc = (Math.PI / 2) * radius;
    const total = floorFront - floorBack + arc + wallHeight;
    for (let i = 0; i < pos.count; i++) {
      // PlaneGeometry Y runs -0.5..0.5; map it along the profile.
      const s = (0.5 - pos.getY(i)) * total;
      let y: number;
      let z: number;
      if (s <= floorFront - floorBack) {
        y = 0;
        z = floorFront - s;
      } else if (s <= floorFront - floorBack + arc) {
        const a = (s - (floorFront - floorBack)) / radius;
        y = radius - Math.cos(a) * radius;
        z = floorBack - Math.sin(a) * radius;
      } else {
        y = radius + (s - (floorFront - floorBack) - arc);
        z = floorBack - radius;
      }
      pos.setXYZ(i, pos.getX(i), y, z);
    }
    geo.computeVertexNormals();
    // Flip so the visible side faces the camera.
    const index = geo.getIndex();
    if (index) {
      const arr = index.array as Uint16Array;
      for (let i = 0; i < arr.length; i += 3) {
        const t = arr[i];
        arr[i] = arr[i + 2];
        arr[i + 2] = t;
      }
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

const Stage: React.FC = () => {
  const cyclo = useCycloramaGeometry();
  const contact = useMemo(() => makeRadialAlpha(), []);
  return (
    <>
      <mesh geometry={cyclo} receiveShadow>
        <meshStandardMaterial color={STAGE} roughness={0.92} envMapIntensity={0.4} />
      </mesh>
      {/* Soft ambient-occlusion pool under the feet, grounding the character. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0.03]}>
        <planeGeometry args={[0.75, 0.55]} />
        <meshBasicMaterial
          color="#0b4c4a"
          alphaMap={contact}
          transparent
          opacity={0.55}
          depthWrite={false}
        />
      </mesh>
    </>
  );
};

/** Shadow setup for the key light: one 2K map tightly framed on the character. */
const configureKeyShadow = (light: DirectionalLight | null) => {
  if (!light) {
    return;
  }
  const cam = light.shadow.camera;
  cam.left = -1.5;
  cam.right = 1.5;
  cam.top = 1.5;
  cam.bottom = -1.5;
  cam.near = 1;
  cam.far = 12;
  cam.updateProjectionMatrix();
  light.shadow.mapSize.set(2048, 2048);
  light.shadow.bias = -0.0004;
  light.shadow.normalBias = 0.012;
  light.shadow.radius = 4;
  light.target.position.set(0, 0.9, 0);
  light.target.updateMatrixWorld();
};

const Lights: React.FC = () => (
  <>
    {/* Key: warm, high and to camera-left. The only shadow caster. */}
    <directionalLight
      ref={configureKeyShadow}
      position={[-3.3, 3.8, 2.2]}
      intensity={3.4}
      color="#fff0de"
      castShadow
    />
    {/* Fill: soft and cool from camera-right, no shadows. */}
    <directionalLight position={[3, 1.6, 2.5]} intensity={0.8} color="#fff4ec" />
    {/* Turquoise bounce from the floor and sky. */}
    <hemisphereLight args={["#d8fffb", "#1f8c87", 0.3]} />
    {/* Rims: two back lights carving the silhouette off the background. */}
    <directionalLight position={[3, 1.9, -2.8]} intensity={6} color="#fff7ec" />
    <directionalLight position={[-3, 1.7, -2.6]} intensity={4.5} color="#e6fffb" />
  </>
);

export const CharacterTest: React.FC = () => {
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: BACKGROUND }}>
      <ThreeCanvas
        width={width}
        height={height}
        shadows="soft"
        camera={{ fov: 30, near: 0.05, far: 60 }}
      >
        <color attach="background" args={[BACKGROUND]} />
        <fog attach="fog" args={[BACKGROUND, 6, 22]} />
        <Look />
        <CameraRig />
        <Lights />
        <Stage />
        <Character />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
