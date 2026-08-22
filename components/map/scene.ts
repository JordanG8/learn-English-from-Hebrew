/**
 * THE ROAD — the 3D world behind the level select.
 *
 * Deliberately NOT a React component. React owns the HUD and the one button;
 * this owns a canvas and a render loop, and the two talk through the tiny API
 * at the bottom of this file (`focus`, `select`, `dispose`). Mixing them means
 * a re-render of a star counter rebuilds a forest.
 *
 * WHAT THE SCENE HAS TO DO, in the order that matters:
 *   1. Say where you are.      The pencil stands on the level you just finished.
 *   2. Say where you go next.  The next pad is lit, raised and ringed; every
 *                              other pad is quiet.
 *   3. Make the road read as a journey, not a list — it curves away and over a
 *      rise, so "ahead" is a direction you can see, the way Candy Crush and
 *      chess.com both do it.
 *   4. Be worth looking at while it does the first three.
 *
 * PERFORMANCE. This runs on a school tablet, so: one directional shadow at
 * 1024, pixel ratio capped at 1.75, low-poly everything, and only a window of
 * pads around the focus is ever built. Under `prefers-reduced-motion` the wind,
 * the leaves and the camera drift all stop and the pencil teleports instead of
 * hopping — the scene still renders, it just holds still.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { ADV_CROUCH, ADV_FLIGHT, ADV_IMPACT, ADV_SETTLE, ADV_STILL } from "./timing";
import { PAD_WINDOW_BACK, PAD_WINDOW_FORWARD, padWindowIndices } from "./window";

export interface LevelNode {
  id: string;
  /** Digits on the pad. Not words — a number is not a reading demand. */
  label: string;
  unlocked: boolean;
  done: boolean;
  /** The one to play next: lit, raised, ringed. */
  isNext: boolean;
  /** Conversation mode gets a different pad. */
  isChat: boolean;
}

export interface WorldOptions {
  onSelect: (index: number) => void;
  reducedMotion: boolean;
  /**
   * The beats of the level-up cinematic, as they happen. The scene owns the
   * timing — it is the thing that knows when the pencil actually lands — and
   * the UI hangs a sound and a lock on each beat. See `advance()`.
   */
  onAdvance?: (phase: "launch" | "land" | "done") => void;
}

/* ------------------------------------------------------------------ */
/* Palette — the ground truth for the whole scene                       */
/* ------------------------------------------------------------------ */

const C = {
  sky: 0xdff0fb,
  haze: 0xe8f3fb,
  grass: 0x75aa58,
  grassDark: 0x416f38,
  grassLight: 0x9bc875,
  roadBed: 0x5e3b32,
  brickA: 0x934f3a,
  brickB: 0xa96146,
  brickC: 0x743d31,
  grout: 0xc8a27c,
  stone: 0x9aa2a9,
  stoneDark: 0x626c76,
  stoneLight: 0xc7cdd2,
  trunk: 0x8a6444,
  leafA: 0x4f9d4a,
  leafB: 0x6fb95a,
  leafC: 0x3d8442,
  wood: 0x9b6550,
  woodDark: 0x6f4033,
  padLocked: 0x9ba3ad,
  next: 0x173d4f,
  number: 0x78e7ff,
  pencilBody: 0xf2c14b,
  pencilWood: 0xe8cfa3,
  graphite: 0x3a3a42,
  eraser: 0xe4574f,
  ferrule: 0xc9ccd2,
};

/* ------------------------------------------------------------------ */
/* Deterministic noise — the same world every time you open the app     */
/* ------------------------------------------------------------------ */

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gentle rolling ground. Cheap, smooth, and it keeps the road from looking flat. */
function terrainHeight(x: number, z: number): number {
  return (
    Math.sin(x * 0.16) * 0.55 +
    Math.cos(z * 0.12) * 0.7 +
    Math.sin((x + z) * 0.05) * 0.9
  );
}

/* ------------------------------------------------------------------ */
/* The path every level sits on                                         */
/* ------------------------------------------------------------------ */

const SPACING = 8.4;


/*
 * The camera looks down the (1, 1.08, 1) diagonal, so the direction that
 * recedes straight UP the screen is the -X/-Z diagonal — not -Z. Running the
 * road along it is what makes "ahead" mean "further up the picture", the way
 * it does on the chess.com track. Get this wrong and the road slides off the
 * side of the screen after four levels, which is exactly what it did.
 */
const FWD = new THREE.Vector3(-1, 0, -1).normalize();
const SIDE = new THREE.Vector3(-1, 0, 1).normalize();

/** Where level `i` stands. Two sine terms so the road wanders without looping. */
function nodePosition(i: number): THREE.Vector3 {
  const wob = Math.sin(i * 0.42) * 4.2 + Math.sin(i * 0.17) * 2.4;
  const x = FWD.x * i * SPACING + SIDE.x * wob;
  const z = FWD.z * i * SPACING + SIDE.z * wob;
  return new THREE.Vector3(x, terrainHeight(x, z), z);
}

/* ------------------------------------------------------------------ */
/* Label textures — digits and the lock glyph, drawn once each          */
/* ------------------------------------------------------------------ */

const labelCache = new Map<string, THREE.CanvasTexture>();

function labelTexture(text: string, color: string, outline = "#073b5c"): THREE.CanvasTexture {
  const key = `${text}|${color}|${outline}`;
  const hit = labelCache.get(key);
  if (hit) return hit;
  const s = 128;
  const cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const g = cv.getContext("2d")!;
  g.clearRect(0, 0, s, s);
  g.font = `800 ${text.length > 2 ? 52 : 68}px system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.lineWidth = 15;
  g.strokeStyle = outline;
  g.shadowColor = "rgba(4, 34, 52, 0.35)";
  g.shadowBlur = 5;
  g.strokeText(text, s / 2, s / 2 + 4);
  g.shadowBlur = 0;
  g.fillStyle = color;
  g.fillText(text, s / 2, s / 2 + 4);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  labelCache.set(key, tex);
  return tex;
}

/* ------------------------------------------------------------------ */
/* Letter shapes for the ruin — hand-built, so no font file to load     */
/* ------------------------------------------------------------------ */

function letterA(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-1, 0);
  s.lineTo(-0.42, 3);
  s.lineTo(0.42, 3);
  s.lineTo(1, 0);
  s.lineTo(0.5, 0);
  s.lineTo(0.33, 0.85);
  s.lineTo(-0.33, 0.85);
  s.lineTo(-0.5, 0);
  s.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-0.22, 1.35);
  hole.lineTo(0.22, 1.35);
  hole.lineTo(0.08, 2.25);
  hole.lineTo(-0.08, 2.25);
  hole.closePath();
  s.holes.push(hole);
  return s;
}

function letterB(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-0.85, 0);
  s.lineTo(-0.85, 3);
  s.lineTo(0.35, 3);
  s.absarc(0.35, 2.25, 0.75, Math.PI / 2, -Math.PI / 2, true);
  s.lineTo(0.35, 1.5);
  s.absarc(0.35, 0.75, 0.75, Math.PI / 2, -Math.PI / 2, true);
  s.lineTo(-0.85, 0);
  const h1 = new THREE.Path();
  h1.absarc(0.2, 2.25, 0.34, 0, Math.PI * 2, false);
  const h2 = new THREE.Path();
  h2.absarc(0.2, 0.75, 0.34, 0, Math.PI * 2, false);
  s.holes.push(h1, h2);
  return s;
}

function letterC(): THREE.Shape {
  const s = new THREE.Shape();
  s.absarc(0, 1.5, 1.5, Math.PI * 0.28, Math.PI * 1.72, false);
  s.absarc(0, 1.5, 0.8, Math.PI * 1.72, Math.PI * 0.28, true);
  s.closePath();
  return s;
}

/* ------------------------------------------------------------------ */
/* The world                                                            */
/* ------------------------------------------------------------------ */

export function createWorld(canvas: HTMLCanvasElement, opts: WorldOptions) {
  const rnd = mulberry(0x5eed);

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  } catch {
    throw new Error("no-webgl");
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = !opts.reducedMotion;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(C.sky);
  // Fog is what makes "up ahead" a direction rather than a list: the road
  // dissolves into haze instead of ending at a hard edge.
  // The camera stands STANDOFF units back, so fog distances are measured from
  // there, not from the target. Setting these as if the camera were at the
  // target is what turned the whole scene into white soup.
  scene.fog = new THREE.Fog(C.haze, 52, 132);

  /* --- camera: fixed isometric, like chess.com ---------------------- */
  const ISO = new THREE.Vector3(1, 1.08, 1).normalize();
  const VIEW = 27; // half-height of the frustum in world units, on a wide screen
  const STANDOFF = 60;
  const camera = new THREE.OrthographicCamera(-VIEW, VIEW, VIEW, -VIEW, 0.1, 260);
  const camTarget = new THREE.Vector3();
  const camGoal = new THREE.Vector3();

  /*
   * FRAMING IS PER-DEVICE, not a constant.
   *
   * A phone is not a small desktop. The frustum that suits a 16:9 window puts
   * the pad you are standing on in the lower third — which on a 9:19.5 screen
   * is exactly where the play button lives, so the pencil sat *behind* the
   * button. Three aspect-driven corrections, all applied in `applyFrustum`:
   *
   *   · a portrait screen zooms IN, so a pad is a thumb and not a pea;
   *   · the frustum is shifted up the screen (`bias`), clearing the HUD;
   *   · the camera looks less far ahead, so "where I am" stays in frame.
   *
   * `zoom` is the pinch, `punch` is the momentary kick on a landing.
   */
  let zoom = 1;
  let punch = 0;
  let lookAhead = 0.8;
  let viewW = 1;
  let viewH = 1;

  const ZOOM_MIN = 0.7;
  const ZOOM_MAX = 1.75;

  function applyFrustum() {
    const aspect = viewW / viewH;
    const portrait = aspect < 1;
    const halfH = (VIEW * (portrait ? 0.8 : 1)) / (zoom * (1 + punch));
    // Negative bias raises the visible band, pushing the road up the screen.
    const bias = -halfH * (portrait ? 0.24 : 0.06);
    lookAhead = portrait ? 0.25 : 0.8;
    camera.left = -halfH * aspect;
    camera.right = halfH * aspect;
    camera.top = halfH + bias;
    camera.bottom = -halfH + bias;
    camera.updateProjectionMatrix();
  }

  /** Decaying kick applied to the lens on a landing. */
  let shake = 0;

  function placeCamera() {
    camera.position.copy(camTarget).addScaledVector(ISO, STANDOFF);
    camera.lookAt(camTarget);
    if (shake > 0) {
      // Applied AFTER lookAt, so the shake is a nudge of the lens rather than
      // a swing of the whole rig — the horizon stays level.
      const s = shake * shake * 1.6;
      camera.position.x += (rnd() - 0.5) * s;
      camera.position.y += (rnd() - 0.5) * s;
      camera.position.z += (rnd() - 0.5) * s;
    }
  }

  /* --- light --------------------------------------------------------- */
  scene.add(new THREE.HemisphereLight(0xdcefff, 0x5f8a48, 0.72));
  const sun = new THREE.DirectionalLight(0xffe9b8, 2.55);
  sun.position.set(14, 26, 10);
  if (!opts.reducedMotion) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const c = sun.shadow.camera;
    c.left = -44;
    c.right = 44;
    c.top = 44;
    c.bottom = -44;
    c.near = 1;
    c.far = 130;
    sun.shadow.bias = -0.0015;
    sun.shadow.normalBias = 0.03;
  }
  scene.add(sun);
  scene.add(sun.target);

  /* --- ground -------------------------------------------------------- */
  // Big enough to hold the whole diagonal run of the track, so the ground never
  // ends inside the shot.
  const GROUND_W = 780;
  const GROUND_L = 780;
  const ground = new THREE.PlaneGeometry(GROUND_W, GROUND_L, 56, 56);
  ground.rotateX(-Math.PI / 2);
  {
    const pos = ground.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const a = new THREE.Color(C.grass);
    const b = new THREE.Color(C.grassDark);
    const c3 = new THREE.Color(C.grassLight);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) - 250;
      const z = pos.getZ(i) - 250;
      pos.setY(i, terrainHeight(x, z));
      // Two greens, mixed by a smooth field — flat green reads as plastic.
      // Three greens over two frequencies: broad meadow bands from the low
      // frequency, patchiness from the high one. One lerp between two greens
      // was what made this look like felt.
      const broad = (Math.sin(x * 0.045) + Math.cos(z * 0.052)) * 0.25 + 0.5;
      const patch = (Math.sin(x * 0.41 + z * 0.13) + Math.cos(z * 0.37)) * 0.25 + 0.5;
      tmp.copy(a).lerp(b, broad).lerp(c3, patch * 0.45);
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    ground.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    ground.computeVertexNormals();
  }
  const groundMesh = new THREE.Mesh(
    ground,
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  );
  groundMesh.position.set(-250, 0, -250);
  groundMesh.receiveShadow = !opts.reducedMotion;
  scene.add(groundMesh);

  /* --- the road ------------------------------------------------------ */
  function buildRoad(count: number): THREE.Group {
    const pts: THREE.Vector3[] = [];
    for (let i = -2; i < count + 3; i++) pts.push(nodePosition(i));
    const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.4);
    const steps = pts.length * 7;
    const verts: number[] = [];
    const idx: number[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const p = curve.getPoint(t);
      const tan = curve.getTangent(t);
      const side = new THREE.Vector3().crossVectors(tan, up).normalize();
      const w = 2.72;
      const l = p.clone().addScaledVector(side, -w);
      const r = p.clone().addScaledVector(side, w);
      verts.push(l.x, terrainHeight(l.x, l.z) + 0.045, l.z);
      verts.push(r.x, terrainHeight(r.x, r.z) + 0.045, r.z);
      if (i < steps) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const group = new THREE.Group();
    const bed = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: C.grout }));
    bed.receiveShadow = !opts.reducedMotion;
    group.add(bed);

    /* One box per brick, one draw call; adjacent columns form a running bond. */
    const rowStep = 1.08;
    const columns = 5;
    const roadLength = curve.getLength();
    const rows = Math.ceil(roadLength / rowStep);
    const brickGeo = new THREE.BoxGeometry(0.94, 0.22, 1.28);
    const brickMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
    const bricks = new THREE.InstancedMesh(brickGeo, brickMat, rows * columns);
    const dummy = new THREE.Object3D();
    const cross = new THREE.Vector3();
    const palette = [C.brickA, C.brickB, C.brickC].map((color) => new THREE.Color(color));
    let instance = 0;
    for (let row = 0; row < rows; row++) {
      const t = rows <= 1 ? 0 : row / (rows - 1);
      const p = curve.getPoint(t);
      const tangent = curve.getTangent(t).normalize();
      cross.crossVectors(tangent, up).normalize();
      for (let column = 0; column < columns; column++) {
        const across = (column - (columns - 1) / 2) * 1.03;
        const bond = column % 2 === 0 ? 0 : rowStep * 0.5;
        const x = p.x + cross.x * across + tangent.x * bond;
        const z = p.z + cross.z * across + tangent.z * bond;
        const noise = mulberry((row + 1) * 4099 + column * 131)();
        dummy.position.set(x, terrainHeight(x, z) + 0.16 + noise * 0.045, z);
        dummy.rotation.set(
          (noise - 0.5) * 0.025,
          Math.atan2(tangent.x, tangent.z) + (noise - 0.5) * 0.035,
          (noise - 0.5) * 0.025,
        );
        dummy.scale.set(0.94 + noise * 0.08, 0.9 + noise * 0.22, 0.94 + noise * 0.07);
        dummy.updateMatrix();
        bricks.setMatrixAt(instance, dummy.matrix);
        bricks.setColorAt(instance, palette[Math.min(2, Math.floor(noise * 3))]);
        instance++;
      }
    }
    bricks.count = instance;
    bricks.instanceMatrix.needsUpdate = true;
    if (bricks.instanceColor) bricks.instanceColor.needsUpdate = true;
    bricks.castShadow = false;
    bricks.receiveShadow = !opts.reducedMotion;
    group.add(bricks);
    return group;
  }

  /* --- scenery ------------------------------------------------------- */
  const scenery = new THREE.Group();
  scene.add(scenery);

  /*
   * Ten CC0 landmarks from Quaternius' Medieval Village Pack. They are local
   * GLBs, loaded only when their chapter approaches the camera. Navigation and
   * pads never wait for a model download, which keeps long jumps dependable.
   */
  const landmarkLayer = new THREE.Group();
  scenery.add(landmarkLayer);
  const landmarkLoader = new GLTFLoader();
  const landmarkSpecs = [
    { level: 5, file: "fantasy-house", side: -1, offset: 15, height: 7.5, turn: 0.5 },
    { level: 15, file: "well", side: 1, offset: 11, height: 4.4, turn: -0.35 },
    { level: 25, file: "market-stand", side: -1, offset: 13, height: 5.2, turn: 0.8 },
    { level: 35, file: "mill", side: 1, offset: 17, height: 10.5, turn: -0.7 },
    { level: 45, file: "bell-tower", side: -1, offset: 18, height: 11.5, turn: 0.45 },
    { level: 55, file: "bench", side: 1, offset: 10, height: 2.8, turn: -0.2 },
    { level: 65, file: "cart", side: -1, offset: 12, height: 4.3, turn: 0.65 },
    { level: 75, file: "gazebo", side: 1, offset: 15, height: 7.2, turn: -0.55 },
    { level: 85, file: "rocks", side: -1, offset: 12, height: 4.6, turn: 0.3 },
    { level: 95, file: "fence", side: 1, offset: 11, height: 3.8, turn: -0.45 },
  ] as const;
  const landmarkObjects = new Map<string, THREE.Group>();
  const loadingLandmarks = new Set<string>();

  function syncLandmarks(index: number) {
    for (const spec of landmarkSpecs) {
      const near = Math.abs(spec.level - index) <= 18;
      const existing = landmarkObjects.get(spec.file);
      if (existing) {
        existing.visible = near;
        continue;
      }
      if (!near || loadingLandmarks.has(spec.file)) continue;
      loadingLandmarks.add(spec.file);
      landmarkLoader.load(
        `/models/map/${spec.file}.glb`,
        (gltf) => {
          loadingLandmarks.delete(spec.file);
          if (disposed) {
            gltf.scene.traverse((object) => {
              if (!(object instanceof THREE.Mesh)) return;
              object.geometry.dispose();
              const material = object.material as THREE.Material | THREE.Material[];
              if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
              else material.dispose();
            });
            return;
          }
          const model = gltf.scene;
          const bounds = new THREE.Box3().setFromObject(model);
          const size = bounds.getSize(new THREE.Vector3());
          const center = bounds.getCenter(new THREE.Vector3());
          const scale = spec.height / Math.max(size.y, 0.001);
          model.scale.setScalar(scale);
          model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
          model.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            object.castShadow = !opts.reducedMotion && spec.height >= 5;
            object.receiveShadow = !opts.reducedMotion;
          });

          const anchor = nodePosition(spec.level);
          const x = anchor.x + SIDE.x * spec.side * spec.offset;
          const z = anchor.z + SIDE.z * spec.side * spec.offset;
          const wrapper = new THREE.Group();
          wrapper.name = `landmark-${spec.file}`;
          wrapper.position.set(x, terrainHeight(x, z), z);
          wrapper.rotation.y = Math.PI * 0.25 + spec.turn;
          wrapper.visible = Math.abs(spec.level - focusIndex) <= 18;
          wrapper.add(model);
          landmarkObjects.set(spec.file, wrapper);
          landmarkLayer.add(wrapper);
        },
        undefined,
        () => loadingLandmarks.delete(spec.file),
      );
    }
  }

  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 1.4, 6);
  const leafGeo = new THREE.IcosahedronGeometry(1, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: C.trunk });
  const leafMats = [C.leafA, C.leafB, C.leafC].map(
    (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true }),
  );

  /** Low-poly tree. The canopy is three offset blobs — one sphere reads as a lollipop. */
  function tree(x: number, z: number, scale: number): THREE.Group {
    const g = new THREE.Group();
    const t = new THREE.Mesh(trunkGeo, trunkMat);
    t.position.y = 0.7;
    t.castShadow = !opts.reducedMotion;
    g.add(t);
    const blobs = 3;
    for (let i = 0; i < blobs; i++) {
      const b = new THREE.Mesh(leafGeo, leafMats[i % leafMats.length]);
      const r = 0.55 + rnd() * 0.35;
      b.scale.setScalar(r);
      b.position.set(
        (rnd() - 0.5) * 0.7,
        1.35 + i * 0.42 + rnd() * 0.2,
        (rnd() - 0.5) * 0.7,
      );
      b.castShadow = !opts.reducedMotion;
      g.add(b);
    }
    g.position.set(x, terrainHeight(x, z), z);
    g.scale.setScalar(scale);
    g.rotation.y = rnd() * Math.PI;
    return g;
  }

  const swayers: { g: THREE.Group; phase: number; amp: number }[] = [];
  const floaters: {
    g: THREE.Object3D;
    home: THREE.Vector3;
    phase: number;
    drift: number;
    lift: number;
  }[] = [];

  const bushGeo = new THREE.IcosahedronGeometry(0.55, 0);
  const rockGeo = new THREE.DodecahedronGeometry(0.45, 0);
  const bushMat = new THREE.MeshLambertMaterial({ color: 0x4a8f42, flatShading: true });
  const rockMat = new THREE.MeshLambertMaterial({ color: 0xa8adb4, flatShading: true });
  const petalGeo = new THREE.CircleGeometry(0.13, 5);
  const petalMats = [0xffffff, 0xffd7e8, 0xfff2a8].map(
    (c) => new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide }),
  );

  /** Low cover. Trees alone leave the ground reading as a bare sheet. */
  function undergrowth(x: number, z: number): THREE.Object3D {
    const roll = rnd();
    if (roll < 0.42) {
      const g = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const b = new THREE.Mesh(bushGeo, bushMat);
        b.position.set((rnd() - 0.5) * 0.8, 0.3 + rnd() * 0.25, (rnd() - 0.5) * 0.8);
        b.scale.setScalar(0.6 + rnd() * 0.6);
        b.castShadow = !opts.reducedMotion;
        g.add(b);
      }
      g.position.set(x, terrainHeight(x, z), z);
      return g;
    }
    if (roll < 0.7) {
      const r = new THREE.Mesh(rockGeo, rockMat);
      r.position.set(x, terrainHeight(x, z) + 0.1, z);
      r.scale.set(0.6 + rnd() * 0.7, 0.4 + rnd() * 0.4, 0.6 + rnd() * 0.7);
      r.rotation.set(rnd(), rnd(), rnd());
      r.castShadow = !opts.reducedMotion;
      return r;
    }
    // Flower clump: flat petals just above the grass, cheap and cheerful.
    const g = new THREE.Group();
    const mat = petalMats[Math.floor(rnd() * petalMats.length)];
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Mesh(petalGeo, mat);
      f.rotation.x = -Math.PI / 2;
      f.position.set((rnd() - 0.5) * 1.4, 0.06, (rnd() - 0.5) * 1.4);
      g.add(f);
    }
    g.position.set(x, terrainHeight(x, z), z);
    return g;
  }

  /**
   * The ABC ruin: three letters the size of a building, sunk to different
   * depths and leaning apart, as if the alphabet were an old civilisation the
   * grass has been growing over for a long time.
   */
  function ruin(): THREE.Group {
    const g = new THREE.Group();
    const stone = new THREE.MeshLambertMaterial({ color: C.stone, flatShading: true });
    const stoneDark = new THREE.MeshLambertMaterial({ color: C.stoneDark, flatShading: true });
    const specs: [THREE.Shape, number, number, number, number, number][] = [
      // shape, x, z, sink (how deep), lean (radians), scale
      [letterA(), -1.9, 0.4, -0.55, -0.16, 1.35],
      [letterB(), 1.5, -1.1, -1.5, 0.22, 1.15],
      [letterC(), 4.3, 0.9, -2.15, -0.34, 1.0],
    ];
    specs.forEach(([shape, x, z, sink, lean, s], i) => {
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.85,
        bevelEnabled: true,
        bevelSize: 0.07,
        bevelThickness: 0.07,
        bevelSegments: 1,
      });
      geo.center();
      const m = new THREE.Mesh(geo, i === 1 ? stoneDark : stone);
      m.scale.setScalar(s);
      m.position.set(x, sink + 1.5 * s, z);
      m.rotation.set(0.06, -0.5 + i * 0.18, lean);
      m.castShadow = !opts.reducedMotion;
      m.receiveShadow = !opts.reducedMotion;
      g.add(m);
    });
    // Broken plinth stones around the base, so the letters look excavated
    // rather than dropped.
    const rubbleGeo = new THREE.DodecahedronGeometry(0.4, 0);
    for (let i = 0; i < 9; i++) {
      const r = new THREE.Mesh(rubbleGeo, i % 2 ? stoneDark : stone);
      const a = rnd() * Math.PI * 2;
      const d = 2.2 + rnd() * 4;
      r.position.set(Math.cos(a) * d, -0.1 + rnd() * 0.2, Math.sin(a) * d * 0.6);
      r.scale.setScalar(0.4 + rnd() * 0.8);
      r.rotation.set(rnd(), rnd(), rnd());
      r.castShadow = !opts.reducedMotion;
      g.add(r);
    }
    return g;
  }

  /* --- storybook landmarks ------------------------------------------- */
  /*
   * These are intentionally made from a tiny shared geometry vocabulary.
   * The scene can feel hand-authored without asking a school tablet to carry
   * imported models or dozens of textures.
   */
  const bookCoverGeo = new THREE.BoxGeometry(4.8, 0.22, 3.25);
  const bookPageGeo = new THREE.BoxGeometry(4.4, 0.48, 2.9);
  const bookPageMat = new THREE.MeshLambertMaterial({ color: 0xfff7dc });
  const bookCoverMats = [0x4d6fa7, 0x7a5a91, 0x3e7b78, 0x9a5f6f].map(
    (color) => new THREE.MeshLambertMaterial({ color }),
  );
  const bookmarkMat = new THREE.MeshLambertMaterial({ color: 0xe4a94f });

  function bookStack(seed: number): THREE.Group {
    const random = mulberry(seed);
    const g = new THREE.Group();
    const count = 2 + Math.floor(random() * 3);
    for (let i = 0; i < count; i++) {
      const layer = new THREE.Group();
      const pages = new THREE.Mesh(bookPageGeo, bookPageMat);
      pages.castShadow = !opts.reducedMotion;
      pages.receiveShadow = !opts.reducedMotion;
      layer.add(pages);

      const coverMat = bookCoverMats[(seed + i) % bookCoverMats.length];
      for (const y of [-0.34, 0.34]) {
        const cover = new THREE.Mesh(bookCoverGeo, coverMat);
        cover.position.y = y;
        cover.castShadow = !opts.reducedMotion;
        layer.add(cover);
      }
      layer.position.y = 0.36 + i * 0.78;
      layer.rotation.y = (random() - 0.5) * 0.55;
      layer.scale.setScalar(0.82 + random() * 0.23);
      g.add(layer);
    }
    const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.05, 3.75), bookmarkMat);
    ribbon.position.set(0.7, count * 0.77 + 0.08, 0.45);
    ribbon.rotation.y = 0.2;
    g.add(ribbon);
    return g;
  }

  function openBook(): THREE.Group {
    const g = new THREE.Group();
    const pageGeo = new THREE.BoxGeometry(4.5, 0.18, 3.2);
    for (const side of [-1, 1]) {
      const page = new THREE.Mesh(pageGeo, bookPageMat);
      page.position.set(side * 2.05, 0.35, 0);
      page.rotation.z = side * -0.13;
      page.rotation.y = side * 0.07;
      page.castShadow = !opts.reducedMotion;
      g.add(page);

      // Three printed rules are enough to read as a page at map distance.
      for (let line = 0; line < 3; line++) {
        const rule = new THREE.Mesh(
          new THREE.BoxGeometry(2.3 - line * 0.25, 0.035, 0.09),
          new THREE.MeshBasicMaterial({ color: 0x9aa7b8 }),
        );
        rule.position.set(side * (1.6 + line * 0.06), 0.57, -0.7 + line * 0.7);
        rule.rotation.z = side * -0.13;
        rule.rotation.y = side * 0.07;
        g.add(rule);
      }
    }
    const spine = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 3.3, 8),
      bookCoverMats[1],
    );
    spine.rotation.x = Math.PI / 2;
    spine.position.y = 0.18;
    g.add(spine);
    return g;
  }

  function pond(seed: number): THREE.Group {
    const random = mulberry(seed);
    const g = new THREE.Group();
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(5.3, 28),
      new THREE.MeshPhongMaterial({
        color: 0x76b7c5,
        emissive: 0x153d49,
        emissiveIntensity: 0.08,
        shininess: 90,
        transparent: true,
        opacity: 0.82,
        side: THREE.DoubleSide,
      }),
    );
    water.rotation.x = -Math.PI / 2;
    water.scale.set(1.35, 0.78, 1);
    water.position.y = 0.13;
    g.add(water);

    const bankMat = new THREE.MeshLambertMaterial({ color: 0xb9aa7c, flatShading: true });
    const bankGeo = new THREE.DodecahedronGeometry(0.42, 0);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const bank = new THREE.Mesh(bankGeo, bankMat);
      bank.position.set(Math.cos(a) * 6.3, 0.16, Math.sin(a) * 4.25);
      bank.scale.set(0.7 + random() * 0.8, 0.45 + random() * 0.35, 0.7 + random() * 0.8);
      bank.rotation.set(random(), random(), random());
      bank.castShadow = !opts.reducedMotion;
      g.add(bank);
    }

    const reedMat = new THREE.MeshLambertMaterial({ color: 0x567a3f });
    for (let i = 0; i < 16; i++) {
      const a = random() * Math.PI * 2;
      const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.055, 1.4, 4), reedMat);
      reed.position.set(Math.cos(a) * (4.8 + random()), 0.72, Math.sin(a) * (3.2 + random() * 0.7));
      reed.rotation.z = (random() - 0.5) * 0.16;
      g.add(reed);
    }
    return g;
  }

  function cloud(seed: number): THREE.Group {
    const random = mulberry(seed);
    const g = new THREE.Group();
    const material = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      flatShading: true,
    });
    for (let i = 0; i < 5; i++) {
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(1.7, 1), material);
      puff.position.set((i - 2) * 1.75, Math.sin(i * 1.7) * 0.55, (random() - 0.5) * 1.8);
      puff.scale.set(1 + random() * 0.7, 0.65 + random() * 0.45, 0.8 + random() * 0.5);
      g.add(puff);
    }
    return g;
  }

  function paperPlane(): THREE.Mesh {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [0, 0, -1.9, -1.35, 0, 1.2, 0, 0.22, 0.55, 0, 0.22, 0.55, 1.35, 0, 1.2, 0, 0, -1.9],
        3,
      ),
    );
    geometry.computeVertexNormals();
    return new THREE.Mesh(
      geometry,
      new THREE.MeshLambertMaterial({ color: 0xf8f3e8, side: THREE.DoubleSide }),
    );
  }

  /* --- leaves on the wind -------------------------------------------- */
  const LEAF_COUNT = 48;
  let leaves: THREE.InstancedMesh | null = null;
  const leafState: { p: THREE.Vector3; v: THREE.Vector3; spin: number; rot: number }[] = [];
  if (!opts.reducedMotion) {
    const g = new THREE.PlaneGeometry(0.5, 0.34);
    const m = new THREE.MeshLambertMaterial({
      color: 0xc8e08a,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
    });
    leaves = new THREE.InstancedMesh(g, m, LEAF_COUNT);
    leaves.frustumCulled = false;
    leaves.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < LEAF_COUNT; i++) {
      leafState.push({
        p: new THREE.Vector3((rnd() - 0.5) * 60, rnd() * 9, (rnd() - 0.5) * 60),
        v: new THREE.Vector3(),
        spin: (rnd() - 0.5) * 3,
        rot: rnd() * Math.PI,
      });
    }
    scene.add(leaves);
  }

  /* --- level pads ----------------------------------------------------- */
  const padGroup = new THREE.Group();
  scene.add(padGroup);

  const baseGeo = new THREE.CylinderGeometry(1.86, 2.08, 0.28, 10);
  const stumpGeo = new THREE.CylinderGeometry(1.42, 1.66, 0.94, 10);
  const trimGeo = new THREE.CylinderGeometry(1.72, 1.58, 0.18, 10);
  const padGeo = new THREE.CylinderGeometry(1.62, 1.78, 0.42, 10);
  const ringGeo = new THREE.TorusGeometry(1.92, 0.11, 6, 28);
  /*
   * TAP TARGET. A pad is about 40 physical pixels across on a phone, and a
   * fingertip is nearer 45 — so an accurate tap on the number still missed.
   * Every pad carries an invisible column, roughly twice as wide, and that is
   * what the raycaster actually hits. Nothing about the picture changes.
   */
  const hitGeo = new THREE.CylinderGeometry(3.1, 3.1, 7, 6);

  interface Pad {
    group: THREE.Group;
    index: number;
    node: LevelNode;
    signature: string;
    ring: THREE.Mesh | null;
    top: THREE.Mesh;
  }
  let pads: Pad[] = [];
  const padMap = new Map<number, Pad>();

  function padSignature(node: LevelNode): string {
    return [node.id, node.label, node.unlocked, node.done, node.isNext, node.isChat].join("|");
  }

  function buildPad(node: LevelNode, index: number): Pad {
    const g = new THREE.Group();
    const p = nodePosition(index);
    g.position.copy(p);
    // Tiny deterministic variations keep the pedestals authored, never noisy.
    const wob = mulberry(index * 2654435761)();
    g.scale.setScalar(0.97 + wob * 0.06);

    const stumpMat = new THREE.MeshLambertMaterial({
      color: node.unlocked ? C.stoneDark : C.padLocked,
    });
    const baseMat = new THREE.MeshLambertMaterial({
      color: node.unlocked ? C.stone : C.padLocked,
    });
    const trimMat = new THREE.MeshLambertMaterial({
      color: node.done ? 0xd6a94b : node.unlocked ? C.stoneLight : C.padLocked,
    });
    const topMat = new THREE.MeshLambertMaterial({
      color: node.isNext ? C.next : node.unlocked ? C.woodDark : C.padLocked,
    });

    const base = new THREE.Mesh(baseGeo, baseMat);
    base.rotation.y = wob * Math.PI * 2;
    base.position.y = 0.14;
    base.castShadow = !opts.reducedMotion;
    base.receiveShadow = !opts.reducedMotion;
    g.add(base);

    const stump = new THREE.Mesh(stumpGeo, stumpMat);
    stump.rotation.y = wob * Math.PI * 2;
    stump.position.y = 0.64;
    stump.castShadow = !opts.reducedMotion;
    stump.receiveShadow = !opts.reducedMotion;
    g.add(stump);

    const trim = new THREE.Mesh(trimGeo, trimMat);
    trim.rotation.y = wob * Math.PI * 2;
    trim.position.y = 1.17;
    trim.castShadow = !opts.reducedMotion;
    g.add(trim);

    const top = new THREE.Mesh(padGeo, topMat);
    top.rotation.y = wob * Math.PI * 2;
    top.position.y = 1.45;
    top.castShadow = !opts.reducedMotion;
    top.receiveShadow = !opts.reducedMotion;
    g.add(top);

    /*
     * A locked pad gets a lock and NOTHING else — no title, no requirement,
     * no progress line. That is the whole instruction: come back later. An
     * unlocked pad gets its number, and the chat pad gets its glyph.
     */
    const face = node.isChat ? "💬" : node.unlocked ? node.label : "🔒";
    const faceColor = node.unlocked ? "#78e7ff" : "#eef1f4";
    const faceOutline = node.unlocked ? "#073b5c" : "#535d68";
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 1.9),
      new THREE.MeshBasicMaterial({
        map: labelTexture(face, faceColor, faceOutline),
        transparent: true,
        depthWrite: false,
      }),
    );
    // YXZ order so the Y turn happens in WORLD space, after the flat-lay:
    // the plane's text-up ends on FWD, which is straight up the screen.
    decal.rotation.order = "YXZ";
    decal.rotation.set(-Math.PI / 2, Math.PI / 4, 0);
    decal.position.y = 1.67;
    g.add(decal);

    /*
     * "You are going HERE." A ground ring alone is lost among the pads at this
     * zoom, so the next level also gets a chevron floating over it — the one
     * piece of the scene allowed to bob and glow, because it is the only piece
     * a child has to find.
     */
    let ring: THREE.Mesh | null = null;
    if (node.isNext) {
      ring = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 1.73;
      g.add(ring);

      const chevron = new THREE.Shape();
      // Apex at the origin, arms rising: a V that points down at its pad.
      chevron.moveTo(0, 0);
      chevron.lineTo(-1.15, 1.25);
      chevron.lineTo(-0.55, 1.25);
      chevron.lineTo(0, 0.62);
      chevron.lineTo(0.55, 1.25);
      chevron.lineTo(1.15, 1.25);
      chevron.closePath();
      const mark = new THREE.Mesh(
        new THREE.ExtrudeGeometry(chevron, { depth: 0.22, bevelEnabled: false }),
        new THREE.MeshLambertMaterial({ color: C.number, emissive: 0x145a75 }),
      );
      /*
       * Height is a readability decision, not a taste one: seen down an
       * isometric camera, "up" is also "further up the screen", so a chevron
       * parked eight units over its pad drew level with the pad two ahead and
       * pointed at the wrong one. At four it stays over the pad it means —
       * which matters more now that a phone zooms in on all this.
       */
      mark.position.y = 4.4;
      mark.scale.setScalar(1.5);
      mark.name = "chevron";
      mark.castShadow = false;
      g.add(mark);
    }

    // Stars earned, as three small discs — shape and count, never colour alone.
    if (node.done) {
      for (let i = 0; i < 3; i++) {
        const s = new THREE.Mesh(
          new THREE.CircleGeometry(0.16, 5),
          new THREE.MeshBasicMaterial({ color: 0xf2c14b }),
        );
        s.rotation.order = "YXZ";
        s.rotation.set(-Math.PI / 2, Math.PI / 4, 0);
        s.position.set((i - 1) * 0.45, 1.69, 1.05);
        g.add(s);
      }
    }

    const hit = new THREE.Mesh(
      hitGeo,
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
    );
    hit.position.y = 3;
    hit.renderOrder = -1;
    hit.name = "hit";
    g.add(hit);

    padGroup.add(g);
    return { group: g, index, node, signature: padSignature(node), ring, top };
  }

  /* --- the player: a pencil standing on its eraser --------------------- */
  function pencil(): THREE.Group {
    const g = new THREE.Group();
    const seg = 6; // hexagonal, like a real pencil
    const eraser = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.34, 0.45, seg),
      new THREE.MeshLambertMaterial({ color: C.eraser }),
    );
    eraser.position.y = 0.225;
    g.add(eraser);

    const ferrule = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 0.28, seg),
      new THREE.MeshLambertMaterial({ color: C.ferrule }),
    );
    ferrule.position.y = 0.58;
    g.add(ferrule);

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.34, 2.6, seg),
      new THREE.MeshLambertMaterial({ color: C.pencilBody, flatShading: true }),
    );
    body.position.y = 2.02;
    g.add(body);

    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.34, 0.62, seg),
      new THREE.MeshLambertMaterial({ color: C.pencilWood, flatShading: true }),
    );
    cone.position.y = 3.63;
    g.add(cone);

    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.11, 0.26, seg),
      new THREE.MeshLambertMaterial({ color: C.graphite }),
    );
    tip.position.y = 4.02;
    g.add(tip);

    g.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = !opts.reducedMotion;
    });
    return g;
  }

  const player = pencil();
  player.scale.setScalar(1.85);
  scene.add(player);

  // A soft contact shadow so the pencil never looks like it is floating, even
  // where the real shadow falls off the edge of the shadow camera.
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 16),
    new THREE.MeshBasicMaterial({ color: 0x2d4a22, transparent: true, opacity: 0.22 }),
  );
  blob.rotation.x = -Math.PI / 2;
  scene.add(blob);

  /* --- level-up effects: sparks and a shockwave ------------------------ */
  /*
   * Pooled and hidden up front. Allocating a geometry in the middle of the one
   * animation the whole reward hangs on is how you get a stutter exactly where
   * it hurts most.
   */
  const SPARK_COUNT = 26;
  const sparkGeo = new THREE.PlaneGeometry(0.62, 0.62);
  const sparkMat = new THREE.MeshBasicMaterial({
    color: 0xffd257,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const sparks = new THREE.InstancedMesh(sparkGeo, sparkMat, SPARK_COUNT);
  sparks.frustumCulled = false;
  sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sparks.visible = false;
  scene.add(sparks);
  const sparkState = Array.from({ length: SPARK_COUNT }, () => ({
    p: new THREE.Vector3(),
    v: new THREE.Vector3(),
    life: 0,
    spin: 0,
    rot: 0,
  }));

  const shockMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const shock = new THREE.Mesh(new THREE.RingGeometry(0.78, 1, 36), shockMat);
  shock.rotation.x = -Math.PI / 2;
  shock.visible = false;
  scene.add(shock);
  let shockT = -1;

  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _roll = new THREE.Quaternion();
  const _sc = new THREE.Vector3();
  const _axisZ = new THREE.Vector3(0, 0, 1);

  /** Throw `count` sparks up and out from `at`. */
  function burst(at: THREE.Vector3, up: number, count: number) {
    if (opts.reducedMotion) return;
    for (let i = 0; i < Math.min(count, SPARK_COUNT); i++) {
      const st = sparkState[i];
      const a = rnd() * Math.PI * 2;
      const speed = 3 + rnd() * 6;
      st.p.set(at.x, at.y + 1.7, at.z);
      st.v.set(Math.cos(a) * speed, up * (0.45 + rnd()), Math.sin(a) * speed);
      st.life = 0.5 + rnd() * 0.45;
      st.spin = (rnd() - 0.5) * 11;
      st.rot = rnd() * Math.PI;
    }
    sparks.visible = true;
  }

  function updateSparks(dt: number) {
    if (!sparks.visible) return;
    let longest = 0;
    for (let i = 0; i < SPARK_COUNT; i++) {
      const st = sparkState[i];
      if (st.life > 0) {
        st.life -= dt;
        st.v.y -= 15 * dt;
        st.p.addScaledVector(st.v, dt);
        st.rot += st.spin * dt;
        if (st.life > longest) longest = st.life;
      }
      const k = Math.max(0, Math.min(1, st.life * 2.4));
      // Billboarded, or a flat quad seen edge-on from an isometric camera is
      // simply not there — the same trap the chevron fell into.
      _q.copy(camera.quaternion).multiply(_roll.setFromAxisAngle(_axisZ, st.rot));
      _sc.setScalar(k);
      _m.compose(st.p, _q, _sc);
      sparks.setMatrixAt(i, _m);
    }
    sparks.instanceMatrix.needsUpdate = true;
    sparkMat.opacity = Math.min(1, longest * 3);
    if (longest <= 0) sparks.visible = false;
  }

  function updateShock(dt: number) {
    if (shockT < 0) return;
    shockT += dt;
    const k = shockT / 0.6;
    if (k >= 1) {
      shockT = -1;
      shock.visible = false;
      return;
    }
    shock.scale.setScalar(1 + k * 5.6);
    shockMat.opacity = (1 - k) * 0.8;
  }

  /* --- state ---------------------------------------------------------- */
  let levels: LevelNode[] = [];
  let focusIndex = 0;
  let playerIndex = 0;
  let hop: { from: number; to: number; t: number } | null = null;
  /**
   * The level-up cinematic. `phase` counts the beats already announced; `still`
   * is the reduced-motion version, which has all of the event and none of the
   * movement.
   */
  let advancing: { from: number; to: number; t: number; phase: number; still: boolean } | null =
    null;
  let road: THREE.Group | null = null;
  let built = false;
  let disposed = false;

  const WINDOW_MEMORY_MS = 1200;
  const WINDOW_MEMORY_COUNT = 3;
  let focusTrail: { index: number; until: number }[] = [];
  let nextPadPruneAt = 0;

  function disposePad(p: Pad) {
    p.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        if (
          o.geometry !== padGeo &&
          o.geometry !== baseGeo &&
          o.geometry !== stumpGeo &&
          o.geometry !== trimGeo &&
          o.geometry !== ringGeo &&
          o.geometry !== hitGeo
        ) {
          o.geometry.dispose();
        }
        const m = o.material as THREE.Material | THREE.Material[];
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m.dispose();
      }
    });
    padGroup.remove(p.group);
    padMap.delete(p.index);
  }

  function clearPads() {
    for (const p of [...padMap.values()]) disposePad(p);
    pads = [];
    focusTrail = [];
    nextPadPruneAt = 0;
  }

  /**
   * Keep the last few destinations alive for one camera glide. The old
   * implementation deleted every source pad the instant a destination was
   * tapped. A second quick tap therefore landed on empty space even though
   * the old pad was still visibly under the pointer.
   */
  function rememberFocus(index: number, now = performance.now()) {
    focusTrail = focusTrail.filter((entry) => entry.index !== index && entry.until > now);
    focusTrail.unshift({ index, until: now + WINDOW_MEMORY_MS });
    focusTrail = focusTrail.slice(0, WINDOW_MEMORY_COUNT);
  }

  function desiredPadIndices(now: number): Set<number> {
    focusTrail = focusTrail.filter((entry) => entry.until > now);
    const anchors = [focusIndex, ...focusTrail.map((entry) => entry.index)];
    const desired = new Set(
      padWindowIndices(levels.length, anchors, PAD_WINDOW_BACK, PAD_WINDOW_FORWARD),
    );
    nextPadPruneAt = focusTrail.length
      ? Math.min(...focusTrail.map((entry) => entry.until))
      : 0;
    return desired;
  }

  /** Incrementally reconcile the live pad windows instead of blanking them. */
  function refreshPads(now = performance.now()) {
    const desired = desiredPadIndices(now);

    for (const [index, pad] of [...padMap.entries()]) {
      const node = levels[index];
      if (!desired.has(index) || !node || pad.signature !== padSignature(node)) {
        disposePad(pad);
      }
    }

    for (const index of desired) {
      if (padMap.has(index)) continue;
      const node = levels[index];
      if (!node) continue;
      const pad = buildPad(node, index);
      padMap.set(index, pad);
    }

    pads = [...padMap.values()].sort((a, b) => a.index - b.index);
  }

  function buildScenery(count: number) {
    const extent = Math.max(count, 46);

    // A distant silhouette gives the road depth without occupying its edges.
    const hillMat = new THREE.MeshLambertMaterial({ color: 0x7ca968, flatShading: true });
    for (let i = 0; i < 12; i++) {
      const along = extent * 0.5 + i * 4.2;
      const base = nodePosition(along);
      const off = (rnd() - 0.5) * 160;
      const hill = new THREE.Mesh(
        new THREE.ConeGeometry(18 + rnd() * 18, 9 + rnd() * 11, 5),
        hillMat,
      );
      hill.position.set(base.x + SIDE.x * off - 28, -1.7, base.z + SIDE.z * off - 28);
      hill.rotation.y = rnd() * Math.PI;
      scenery.add(hill);
    }

    /*
     * Quiet roadside composition: one grove per chapter, leaving long bands of
     * open meadow around the brick road and every interactive pedestal.
     */
    for (let chapter = 0, at = 7; at < extent; chapter++, at += 14) {
      const anchor = nodePosition(at);
      const side = chapter % 2 === 0 ? -1 : 1;
      for (let i = 0; i < 3; i++) {
        const off = side * (15 + i * 3.2 + rnd() * 2);
        const along = (i - 1) * 3.4;
        const x = anchor.x + SIDE.x * off + FWD.x * along;
        const z = anchor.z + SIDE.z * off + FWD.z * along;
        const item = tree(x, z, 1.1 + rnd() * 0.55);
        scenery.add(item);
        swayers.push({ g: item, phase: rnd() * Math.PI * 2, amp: 0.018 + rnd() * 0.018 });
      }
      for (let i = 0; i < 2; i++) {
        const off = side * (11.5 + i * 2.8);
        const along = (rnd() - 0.5) * 5;
        scenery.add(
          undergrowth(
            anchor.x + SIDE.x * off + FWD.x * along,
            anchor.z + SIDE.z * off + FWD.z * along,
          ),
        );
      }
    }

    // Sparse instanced grass supplies texture without turning into roadside noise.
    const grassCount = Math.min(260, extent * 3);
    const tuftGeo = new THREE.ConeGeometry(0.12, 0.72, 3);
    tuftGeo.translate(0, 0.36, 0);
    const tufts = new THREE.InstancedMesh(
      tuftGeo,
      new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }),
      grassCount,
    );
    const dummy = new THREE.Object3D();
    const grassColors = [0x4f8d3e, 0x69a94d, 0x88bc59, 0x3f7a33].map(
      (color) => new THREE.Color(color),
    );
    for (let i = 0; i < grassCount; i++) {
      const at = Math.floor(rnd() * extent);
      const base = nodePosition(at);
      const side = rnd() < 0.5 ? -1 : 1;
      const off = side * (8 + rnd() * 25);
      const along = (rnd() - 0.5) * SPACING;
      const x = base.x + SIDE.x * off + FWD.x * along;
      const z = base.z + SIDE.z * off + FWD.z * along;
      dummy.position.set(x, terrainHeight(x, z), z);
      dummy.rotation.set((rnd() - 0.5) * 0.14, rnd() * Math.PI, (rnd() - 0.5) * 0.18);
      const scale = 0.55 + rnd() * 1.25;
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      tufts.setMatrixAt(i, dummy.matrix);
      tufts.setColorAt(i, grassColors[Math.floor(rnd() * grassColors.length)]);
    }
    tufts.instanceMatrix.needsUpdate = true;
    if (tufts.instanceColor) tufts.instanceColor.needsUpdate = true;
    tufts.frustumCulled = false;
    scenery.add(tufts);
  }

  /* --- picking --------------------------------------------------------- */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function pick(clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(padGroup.children, true);
    if (!hits.length) return;
    let o: THREE.Object3D | null = hits[0].object;
    while (o && o.parent !== padGroup) o = o.parent;
    const pad = pads.find((p) => p.group === o);
    if (pad && pad.node.unlocked) opts.onSelect(pad.index);
  }

  /* --- pointer: tap to choose, drag to travel, pinch to zoom ----------- */
  /*
   * WHAT WAS WRONG WITH THIS ON A PHONE, and what each part fixes:
   *
   *   · Drag was vertical pixels times a magic 0.035. On a short phone that
   *     is a different distance than on a tablet, and a drag along the road —
   *     which runs diagonally up the screen — did nothing sideways. Now the
   *     finger delta is projected onto the road's own direction *on screen*
   *     and divided by the on-screen length of one level, so one finger-width
   *     of travel moves the same number of levels on every device at every
   *     zoom.
   *   · The content did not follow the finger. It does now: drag down and the
   *     road ahead comes toward you, exactly like scrolling anything else.
   *   · Letting go stopped dead. Now it flicks, with friction and a rubber
   *     band at both ends, and drifts back to where you are when you rest.
   *   · There was no zoom at all. Two fingers now do the obvious thing.
   */
  // Bounded by the pads that actually exist: WINDOW_BACK/WINDOW_FWD decide how
  // much road is built around the focus, and panning past that end shows an
  // empty track, which reads as the game having run out.
  const PAN_MIN = -3;
  const PAN_MAX = 7;
  const RECENTRE_AFTER = 5000; // ms of stillness before the camera drifts home

  const pointers = new Map<number, { x: number; y: number }>();
  let down: { x: number; y: number; t: number; id: number; pan: number } | null = null;
  let panOffset = 0;
  let panGoal = 0;
  let panVel = 0; // levels per second, carried out of a flick
  let dragged = false;
  let pinchPx = 0;
  let pinchZoom = 1;
  let lastTouchAt = 0;

  const _pa = new THREE.Vector3();
  const _pb = new THREE.Vector3();
  const _dir = new THREE.Vector2();

  /**
   * The road's direction on screen, and how many screen pixels one level is.
   * Measured from the projection rather than assumed, so it stays right under
   * pinch zoom, rotation, and the aspect-driven framing above.
   */
  function roadOnScreen(): { dir: THREE.Vector2; pxPerLevel: number } {
    const rect = canvas.getBoundingClientRect();
    const at = Math.round(focusIndex + panOffset);
    _pa.copy(nodePosition(at)).project(camera);
    _pb.copy(nodePosition(at + 1)).project(camera);
    const dx = ((_pb.x - _pa.x) * rect.width) / 2;
    const dy = (-(_pb.y - _pa.y) * rect.height) / 2;
    const len = Math.hypot(dx, dy) || 1;
    _dir.set(dx / len, dy / len);
    return { dir: _dir, pxPerLevel: len };
  }

  /** Past either end the pan still moves, but at a third — it pushes back. */
  function rubber(v: number): number {
    if (v < PAN_MIN) return PAN_MIN + (v - PAN_MIN) * 0.35;
    if (v > PAN_MAX) return PAN_MAX + (v - PAN_MAX) * 0.35;
    return v;
  }

  const onDown = (e: PointerEvent) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastTouchAt = performance.now();
    panVel = 0;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchPx = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      pinchZoom = zoom;
      down = null; // a second finger cancels the tap in progress
      return;
    }
    dragged = false;
    down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, pan: panGoal };
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* not every browser allows capture on every pointer type */
    }
  };

  const onMove = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastTouchAt = performance.now();

    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      zoom = THREE.MathUtils.clamp((pinchZoom * d) / pinchPx, ZOOM_MIN, ZOOM_MAX);
      applyFrustum();
      return;
    }
    if (!down || e.pointerId !== down.id) return;

    const fdx = e.clientX - down.x;
    const fdy = e.clientY - down.y;
    if (!dragged && Math.hypot(fdx, fdy) > 12) dragged = true;
    if (!dragged) return;

    const { dir, pxPerLevel } = roadOnScreen();
    // Content follows the finger: pulling down brings the road ahead to you.
    const along = fdx * dir.x + fdy * dir.y;
    const next = down.pan - along / pxPerLevel;
    panVel = (next - panGoal) * 9;
    panGoal = rubber(next);
  };

  const onUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    lastTouchAt = performance.now();
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* see above */
    }
    if (pointers.size === 1) {
      // Lifting one of two fingers must not teleport the view: re-anchor the
      // drag on whichever finger is still down.
      const [only] = [...pointers.entries()];
      down = { x: only[1].x, y: only[1].y, t: performance.now(), id: only[0], pan: panGoal };
      dragged = true;
      return;
    }
    if (!down || e.pointerId !== down.id) return;
    const quick = performance.now() - down.t < 500;
    if (!dragged && quick) {
      panVel = 0;
      pick(e.clientX, e.clientY);
    }
    down = null;
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

  // A phone browser will happily zoom the *page* on a pinch over a canvas, and
  // scroll the page on a wheel. Both belong to the world here.
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    lastTouchAt = performance.now();
    if (e.ctrlKey) {
      zoom = THREE.MathUtils.clamp(zoom * (1 - e.deltaY * 0.01), ZOOM_MIN, ZOOM_MAX);
      applyFrustum();
    } else {
      const { pxPerLevel } = roadOnScreen();
      panGoal = rubber(panGoal + e.deltaY / pxPerLevel);
    }
  };
  canvas.addEventListener("wheel", onWheel, { passive: false });

  /* --- resize ---------------------------------------------------------- */
  function resize() {
    viewW = canvas.clientWidth || 1;
    viewH = canvas.clientHeight || 1;
    applyFrustum();
    renderer.setSize(viewW, viewH, false);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  /* --- loop ------------------------------------------------------------ */
  const clock = new THREE.Clock();
  let raf = 0;

  function frame() {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    // Once the camera has had time to leave an old destination, release its
    // retained pads. This is one small reconcile, not a rebuild every frame.
    if (nextPadPruneAt > 0 && performance.now() >= nextPadPruneAt) refreshPads();

    /* --- pan physics: flick, friction, rubber band, drift home -------- */
    if (!down && !opts.reducedMotion) {
      if (Math.abs(panVel) > 0.01) {
        panGoal = rubber(panGoal + panVel * dt);
        panVel *= Math.pow(0.12, dt); // friction
      } else {
        panVel = 0;
      }
      // Past an end, the band pulls back.
      const clamped = THREE.MathUtils.clamp(panGoal, PAN_MIN, PAN_MAX);
      if (clamped !== panGoal) {
        panGoal += (clamped - panGoal) * Math.min(1, dt * 9);
        panVel = 0;
      } else if (
        panGoal !== 0 &&
        Math.abs(panVel) < 0.05 &&
        performance.now() - lastTouchAt > RECENTRE_AFTER
      ) {
        // Nobody is holding it, so the road comes back to where the child is
        // standing. Slowly — this must read as the camera settling, never as
        // the view being snatched away mid-look.
        panGoal += (0 - panGoal) * Math.min(1, dt * 0.9);
        if (Math.abs(panGoal) < 0.02) panGoal = 0;
      }
    }

    // Camera: sit between the pencil and the level ahead, plus whatever the
    // finger has dragged. During the level-up the camera belongs to the
    // cinematic and follows the landing instead.
    const shown = focusIndex + panOffset;
    // Look PAST the focus: that pushes the pad you are on down the frame and
    // leaves the road climbing away above it, which is the whole point of the
    // perspective. How far past is `lookAhead`, which a phone shortens so the
    // pencil clears the play button.
    const look = advancing
      ? nodePosition(advancing.to + lookAhead * 0.5)
      : nodePosition(shown + lookAhead);
    camGoal.set(look.x, look.y + 1.2, look.z);
    camTarget.lerp(camGoal, opts.reducedMotion ? 1 : 1 - Math.pow(advancing ? 0.0008 : 0.002, dt));
    panOffset += (panGoal - panOffset) * (opts.reducedMotion ? 1 : Math.min(1, dt * 8));
    if (shake > 0) shake = Math.max(0, shake - dt * 2.2);
    if (punch !== 0) {
      punch += (0 - punch) * Math.min(1, dt * 6);
      if (Math.abs(punch) < 0.002) punch = 0;
      applyFrustum();
    }
    placeCamera();
    sun.target.position.copy(camTarget);
    sun.position.copy(camTarget).add(new THREE.Vector3(14, 26, 10));

    // The hop: a parabola with a squash on landing. This is the whole
    // "you moved forward" feedback, so it is worth the twelve lines.
    const PSCALE = 1.85;
    if (advancing) {
      /*
       * THE LEVEL-UP. This is the only thing on this screen a child is made to
       * wait for, so it has to earn the wait: a crouch, a launch with a full
       * turn in the air, a landing that hits hard enough to shake the lens and
       * throw sparks, and an elastic settle. The beats are announced through
       * `opts.onAdvance` so the sound lands on the frame, not near it.
       */
      advancing.t += dt;
      const a = nodePosition(advancing.from);
      const b = nodePosition(advancing.to);
      const t0 = advancing.t;

      if (advancing.still) {
        /*
         * REDUCED MOTION IS NOT NO CELEBRATION. Asking a system not to animate
         * is not asking it to say nothing: the pencil is simply already on the
         * new pad, and the beat still fires — so the sound plays, the banner
         * appears, and the gate holds for long enough to read it.
         */
        player.position.copy(b);
        player.scale.setScalar(PSCALE);
        player.rotation.set(0, 0, 0);
        if (advancing.phase < 2) {
          advancing.phase = 2;
          opts.onAdvance?.("land");
        } else if (t0 >= ADV_STILL) {
          advancing = null;
          opts.onAdvance?.("done");
        }
      } else if (t0 < ADV_CROUCH) {
        const k = t0 / ADV_CROUCH;
        const dip = Math.sin(k * Math.PI);
        player.position.copy(a);
        player.position.y -= dip * 0.5;
        const sq = 1 - dip * 0.3;
        player.scale.set(PSCALE / Math.sqrt(sq), PSCALE * sq, PSCALE / Math.sqrt(sq));
        player.rotation.set(0, 0, -dip * 0.16);
      } else if (t0 < ADV_CROUCH + ADV_FLIGHT) {
        if (advancing.phase < 1) {
          advancing.phase = 1;
          burst(a, 7, 12);
          opts.onAdvance?.("launch");
        }
        const k = (t0 - ADV_CROUCH) / ADV_FLIGHT;
        player.position.lerpVectors(a, b, k * k * (3 - 2 * k));
        player.position.y += Math.sin(k * Math.PI) * 9.5;
        player.rotation.set(0, k * Math.PI * 2, Math.sin(k * Math.PI * 2) * 0.22);
        const st = 1 + Math.sin(k * Math.PI) * 0.14;
        player.scale.set(PSCALE * (2 - st), PSCALE * st, PSCALE * (2 - st));
      } else if (t0 < ADV_CROUCH + ADV_FLIGHT + ADV_IMPACT) {
        if (advancing.phase < 2) {
          advancing.phase = 2;
          burst(b, 6, SPARK_COUNT);
          shock.position.set(b.x, b.y + 1.63, b.z);
          shock.scale.setScalar(1);
          shock.visible = !opts.reducedMotion;
          shockT = opts.reducedMotion ? -1 : 0;
          shake = opts.reducedMotion ? 0 : 0.85;
          punch = opts.reducedMotion ? 0 : -0.07;
          opts.onAdvance?.("land");
        }
        const k = (t0 - ADV_CROUCH - ADV_FLIGHT) / ADV_IMPACT;
        const sq = 1 - Math.sin(k * Math.PI) * 0.34;
        player.position.copy(b);
        player.rotation.set(0, 0, 0);
        player.scale.set(PSCALE / Math.sqrt(sq), PSCALE * sq, PSCALE / Math.sqrt(sq));
      } else {
        const k = Math.min(1, (t0 - ADV_CROUCH - ADV_FLIGHT - ADV_IMPACT) / ADV_SETTLE);
        const e = Math.sin(k * Math.PI * 2.6) * (1 - k) * 0.17;
        player.position.copy(b);
        player.rotation.set(0, 0, 0);
        player.scale.set(PSCALE * (1 - e), PSCALE * (1 + e), PSCALE * (1 - e));
        if (k >= 1) {
          advancing = null;
          player.scale.setScalar(PSCALE);
          opts.onAdvance?.("done");
        }
      }
    } else if (hop) {
      hop.t += dt * 1.9;
      const k = Math.min(1, hop.t);
      const a = nodePosition(hop.from);
      const b = nodePosition(hop.to);
      player.position.lerpVectors(a, b, k);
      player.position.y += Math.sin(k * Math.PI) * 3.4;
      const squash = 1 + Math.sin(k * Math.PI) * 0.14;
      player.scale.set(PSCALE * (2 - squash), PSCALE * squash, PSCALE * (2 - squash));
      player.rotation.y = Math.sin(k * Math.PI * 2) * 0.5;
      if (k >= 1) {
        hop = null;
        player.scale.setScalar(PSCALE);
        player.rotation.y = 0;
      }
    } else {
      /*
       * Idle. The bob and sway are what make the pencil read as a character
       * rather than a prop — but the POSITION has to be set either way. It
       * used to live inside a `!reducedMotion` branch, which left the pencil
       * parked at the world origin, off-camera: a reduced-motion player had no
       * avatar at all.
       */
      const p = nodePosition(playerIndex);
      const bob = opts.reducedMotion ? 0 : Math.sin(t * 2.4) * 0.09;
      player.position.set(p.x, p.y + bob, p.z);
      player.rotation.y = opts.reducedMotion ? 0 : Math.sin(t * 0.9) * 0.12;
    }
    player.position.y += 1.6; // stand on the pad, not in it

    // The contact shadow sits on the pad the pencil is over, and shrinks as it
    // leaves the ground — a shadow that stays full size under a pencil nine
    // units up is what makes a jump look like a slide.
    const groundY = terrainHeight(player.position.x, player.position.z) + 1.58;
    const air = Math.max(0, player.position.y - groundY - 0.1);
    blob.position.set(player.position.x, groundY, player.position.z);
    const k = Math.max(0.28, 1 - air * 0.075);
    blob.scale.setScalar(k);
    (blob.material as THREE.MeshBasicMaterial).opacity = 0.22 * k;

    updateSparks(dt);
    updateShock(dt);

    if (!opts.reducedMotion) {
      for (const s of swayers) {
        s.g.rotation.z = Math.sin(t * 1.1 + s.phase) * s.amp;
      }
      for (const f of floaters) {
        const wave = t * 0.22 + f.phase;
        f.g.position.set(
          f.home.x + Math.cos(wave) * f.drift,
          f.home.y + Math.sin(wave * 1.7) * f.lift,
          f.home.z + Math.sin(wave) * f.drift,
        );
        f.g.rotation.z = Math.sin(wave * 1.35) * 0.045;
      }
      for (const p of pads) {
        if (p.ring) {
          const k = 1 + Math.sin(t * 3) * 0.08;
          p.ring.scale.set(k, k, 1);
          (p.ring.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(t * 3) * 0.3;
        }
        if (p.node.isNext) {
          p.top.position.y = 1.45 + Math.sin(t * 2.2) * 0.07;
          const mark = p.group.getObjectByName("chevron");
          if (mark) {
            mark.position.y = 4.4 + Math.sin(t * 2.6) * 0.38;
            // Billboard: a fixed rotation shows this edge-on from an
            // isometric camera, which is exactly how it disappeared.
            mark.quaternion.copy(camera.quaternion);
          }
        }
      }

      // Wind: leaves drift across the camera and wrap around it, so the same
      // ninety instances follow you up the whole road.
      if (leaves) {
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const sc = new THREE.Vector3(1, 1, 1);
        for (let i = 0; i < LEAF_COUNT; i++) {
          const L = leafState[i];
          L.v.set(
            2.6 + Math.sin(t * 0.7 + i) * 0.9,
            Math.sin(t * 1.7 + i * 0.3) * 0.5 - 0.35,
            Math.cos(t * 0.5 + i * 0.7) * 1.1,
          );
          L.p.addScaledVector(L.v, dt);
          L.rot += L.spin * dt;
          const c = camTarget;
          if (L.p.x - c.x > 34) L.p.x -= 62;
          if (L.p.y < 0.2) L.p.y = 8 + rnd() * 2;
          if (L.p.y > 11) L.p.y = 0.4;
          if (L.p.z - c.z > 32) L.p.z -= 60;
          if (L.p.z - c.z < -32) L.p.z += 60;
          q.setFromEuler(new THREE.Euler(L.rot, L.rot * 0.7, L.rot * 0.4));
          m.compose(L.p, q, sc);
          leaves.setMatrixAt(i, m);
        }
        leaves.instanceMatrix.needsUpdate = true;
      }
    }

    renderer.render(scene, camera);
  }

  /* --- public API ------------------------------------------------------ */
  return {
    /** Hand the world the track. Safe to call again when progress changes. */
    setLevels(next: LevelNode[], focus: number, player: number) {
      levels = next;
      if (focusIndex !== focus) rememberFocus(focusIndex);
      focusIndex = focus;
      rememberFocus(focus);
      if (!built) {
        built = true;
        road = buildRoad(Math.max(next.length, 46));
        scene.add(road);
        buildScenery(Math.max(next.length, 46));
        camTarget.copy(nodePosition(focus + 0.8));
        placeCamera();
        resize();
        frame();
      }
      syncLandmarks(focusIndex);
      refreshPads();
      if (advancing) return; // the cinematic owns the pencil until it finishes
      if (playerIndex !== player) {
        if (opts.reducedMotion) playerIndex = player;
        else hop = { from: playerIndex, to: player, t: 0 };
        playerIndex = player;
      }
    },

    /**
     * Move the spotlight — used when a child taps a different pad.
     *
     * It deliberately does NOT move the pencil any more. The pencil is where
     * the child has actually got to, and the one thing that moves it is
     * finishing a level; making a tap teleport it spent the only piece of
     * feedback the road has on browsing.
     */
    focus(index: number) {
      if (focusIndex !== index) rememberFocus(focusIndex);
      focusIndex = index;
      rememberFocus(index);
      panGoal = 0;
      panVel = 0;
      lastTouchAt = performance.now();
      syncLandmarks(index);
      refreshPads();
    },

    /**
     * THE LEVEL-UP. Play the full cinematic from `from` to `to` and report each
     * beat through `opts.onAdvance`. The caller holds the play button shut
     * until "done" comes back — see LevelSelect.
     *
     * Under reduced motion the pencil is simply put down on the new pad and
     * the beats fire on a short still hold — the sound and the banner are not
     * motion, and a child who asked their system to stop things moving has not
     * asked to stop being told they finished a level.
     */
    advance(from: number, to: number) {
      if (focusIndex !== to) rememberFocus(focusIndex);
      focusIndex = to;
      rememberFocus(to);
      panGoal = 0;
      panOffset = 0;
      panVel = 0;
      playerIndex = to;
      hop = null;
      syncLandmarks(to);
      refreshPads();
      if (from === to) {
        advancing = null;
        opts.onAdvance?.("done");
        return;
      }
      advancing = { from, to, t: 0, phase: 0, still: opts.reducedMotion };
    },

    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
      clearPads();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.InstancedMesh) {
          o.geometry.dispose();
          const m = o.material as THREE.Material | THREE.Material[];
          if (Array.isArray(m)) m.forEach((x) => x.dispose());
          else m.dispose();
        }
      });
      labelCache.forEach((t) => t.dispose());
      labelCache.clear();
      renderer.dispose();
    },
  };
}

export type World = ReturnType<typeof createWorld>;
