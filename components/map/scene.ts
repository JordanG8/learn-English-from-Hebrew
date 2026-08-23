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

import { ADV_CROUCH, ADV_FLIGHT, ADV_IMPACT, ADV_SETTLE, ADV_STILL } from "./timing";
import { PAD_WINDOW_BACK, PAD_WINDOW_FORWARD, padWindowIndices } from "./window";
import { getModel, preloadModels, SHARED_MODEL_RESOURCES, type ModelKey } from "./assets";

export interface LevelNode {
  id: string;
  /** Digits on the pad. Not words — a number is not a reading demand. */
  label: string;
  unlocked: boolean;
  done: boolean;
  /** The one to play next: lit, raised, ringed. */
  isNext: boolean;
  /** The destination currently framed by the camera. */
  isSelected: boolean;
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
  grass: 0x74b356,
  grassDark: 0x3f7a33,
  grassLight: 0x95cc68,
  dirt: 0xd2a86f,
  dirtEdge: 0xc09a68,
  // The brick road. Warm, reddish masonry — chosen so a cool light-blue
  // number sits on the opposite side of the colour wheel from everything
  // under it, and cannot be lost against the road or the pedestal.
  brick: 0xa8604a,
  brickDark: 0x8c4b39,
  brickLight: 0xc17c5d,
  brickPale: 0xb8705a,
  mortar: 0x6b5a4d,
  kerb: 0xd7c4a2,
  kerbDark: 0xb29a78,
  plinth: 0xcbb190,
  plinthDark: 0xa88f6d,
  // The cap is the ONE dark surface in a warm, bright scene, because it is the
  // one that has to carry a light-blue number. Sandstone under light blue is a
  // pastel on a pastel; near-black under it is a road sign.
  padCap: 0x3c3540,
  stone: 0xbfc4c9,
  stoneDark: 0x9aa1a8,
  trunk: 0x8a6444,
  leafA: 0x4f9d4a,
  leafB: 0x6fb95a,
  leafC: 0x3d8442,
  wood: 0xc98f4e,
  woodDark: 0x9c6a35,
  padLocked: 0x9ba3ad,
  next: 0x2fbd63,
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

function labelTexture(
  text: string,
  color: string,
): THREE.CanvasTexture {
  const key = `${text}|${color}`;
  const hit = labelCache.get(key);
  if (hit) return hit;
  const s = 256; // the digits sit on a lit stone cap now; 128 read as mush
  const cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const g = cv.getContext("2d")!;
  g.clearRect(0, 0, s, s);
  g.font = `800 ${text.length > 2 ? 132 : 174}px system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = color;
  g.fillText(text, s / 2, s / 2 + 8);
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
  // Fire the moment a world is created; every world after the first shares
  // the one cached promise (see assets.ts), so this costs nothing on repeat
  // visits to /map.
  const modelsReady = preloadModels();
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  /*
   * The FIRST pad build always runs before any model has had even one tick
   * to resolve — `refreshPads()` is called synchronously in `setLevels`,
   * same script turn as `preloadModels()` above, and a fetch cannot finish
   * before the code that started it returns. So the pedestal a child sees on
   * first paint is always the hand-built fallback; without this, it would
   * stay that way forever; `padSignature` below reads `modelsLoaded`, so the
   * moment loading finishes this line invalidates every visible pad's
   * signature and `refreshPads()` rebuilds them with the real column.
   */
  let modelsLoaded = false;
  modelsReady.then(() => {
    if (disposed) return;
    modelsLoaded = true;
    refreshPads();
  });

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  } catch {
    throw new Error("no-webgl");
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
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
  /*
   * A dead-symmetric (1, y, 1) rig looks flat — the road runs exactly up the
   * centre of the screen and nothing about the angle says "3D" rather than
   * "diagram". A small yaw off that diagonal is the whole trick: it stays an
   * isometric-style fixed camera (no perspective, no per-frame rotation),
   * but the asymmetry it introduces is what actually reads as depth.
   */
  const ISO_YAW = -9 * (Math.PI / 180); // subtle — see above
  const ISO = new THREE.Vector3(1, 1.08, 1)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), ISO_YAW)
    .normalize();
  // Half-height of the frustum in world units, on a wide screen. 18, not the
  // 27 this used to be — the old framing sat far enough back that the brick
  // and the pedestals barely read until a child pinch-zoomed in by hand.
  const VIEW = 18;
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
  const ground = new THREE.PlaneGeometry(GROUND_W, GROUND_L, 90, 90);
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
  /*
   * A LAID BRICK ROAD, not a painted stripe.
   *
   * The old road was one flat ribbon of dirt-coloured triangles. Seen down an
   * isometric camera that reads as a decal on the grass — there is no edge to
   * catch the sun, so the road has no thickness and the pads look dropped on
   * top of a drawing. This builds it the way a real one is built:
   *
   *   · a mortar bed, the old ribbon, kept as the dark gap between bricks;
   *   · courses of individual bricks laid across the road in running bond,
   *     each one a box with a real top face, a real side, and its own tint;
   *   · a raised kerb of larger stones down both edges, which is what
   *     actually reads as "the road is a thing standing above the field".
   *
   * COST. Three InstancedMesh draw calls for the entire track, whatever its
   * length — the same budget as the two ribbons it replaces. Per-instance
   * colour does the variation, so there is still not one texture to load.
   */
  // Wider than the first pass: at the default (non-pinch-zoomed) camera
  // distance a 2.3-unit half-width read as a footpath — the brick courses
  // barely registered until a child zoomed in. Every dependent measurement
  // below (kerb offset, pedestal footprint, VERGE_CLEAR) reads ROAD_HALF, so
  // widening it here is the whole change.
  const ROAD_HALF = 3.3;

  /** Y of the brick surface at (x, z) — pads and props sit relative to this. */
  function roadSurface(x: number, z: number): number {
    return terrainHeight(x, z) + 0.06;
  }

  function buildRoad(count: number): THREE.Group {
    const group = new THREE.Group();
    const pts: THREE.Vector3[] = [];
    for (let i = -2; i < count + 3; i++) pts.push(nodePosition(i));
    const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.4);
    // The default 200-segment arc table is ~2 world units per entry over a
    // track this long, which is coarser than a brick — courses would bunch on
    // the bends. One entry per third of a brick keeps the spacing honest.
    curve.arcLengthDivisions = pts.length * 40;
    const length = curve.getLength();
    const up = new THREE.Vector3(0, 1, 0);

    /* --- the mortar bed: the old ribbon, darkened and sunk ------------- */
    {
      const steps = pts.length * 8;
      const verts: number[] = [];
      const idx: number[] = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const p = curve.getPoint(t);
        const tan = curve.getTangent(t);
        const side = new THREE.Vector3().crossVectors(tan, up).normalize();
        // Slightly wider than the brick field, so no course ever overhangs
        // into bare grass on a bend.
        const w = ROAD_HALF + 0.34;
        const l = p.clone().addScaledVector(side, -w);
        const r = p.clone().addScaledVector(side, w);
        verts.push(l.x, terrainHeight(l.x, l.z) + 0.05, l.z);
        verts.push(r.x, terrainHeight(r.x, r.z) + 0.05, r.z);
        if (i < steps) {
          const a = i * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const bed = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: C.mortar }));
      bed.receiveShadow = !opts.reducedMotion;
      group.add(bed);
    }

    /* --- the bricks ---------------------------------------------------- */
    const BRICK_L = 0.62; // along the road
    const BRICK_W = 0.9; // across it
    const BRICK_H = 0.24;
    const COURSE = BRICK_L + 0.07; // the mortar joint between courses
    const courses = Math.max(1, Math.floor(length / COURSE));
    const cols = Math.floor((ROAD_HALF * 2) / BRICK_W);

    const dummy = new THREE.Object3D();
    const brickTints = [C.brick, C.brickDark, C.brickLight, C.brickPale].map(
      (c) => new THREE.Color(c),
    );
    const tint = new THREE.Color();

    const bricks = new THREE.InstancedMesh(
      new THREE.BoxGeometry(BRICK_W - 0.09, BRICK_H, BRICK_L - 0.07),
      new THREE.MeshLambertMaterial({ flatShading: true }),
      courses * cols,
    );
    let laid = 0;
    const p = new THREE.Vector3();
    const tan = new THREE.Vector3();
    const side = new THREE.Vector3();
    for (let r = 0; r < courses; r++) {
      const u = (r * COURSE) / length;
      curve.getPointAt(Math.min(u, 1), p);
      curve.getTangentAt(Math.min(u, 1), tan);
      side.crossVectors(tan, up).normalize();
      const yaw = Math.atan2(tan.x, tan.z);
      // Running bond: every other course is offset half a brick, which is what
      // stops the road reading as graph paper.
      const stagger = r % 2 ? BRICK_W * 0.5 : 0;
      for (let c = 0; c < cols; c++) {
        const off = (c - (cols - 1) / 2) * BRICK_W + stagger;
        if (Math.abs(off) + BRICK_W * 0.5 > ROAD_HALF) continue;
        const jx = (rnd() - 0.5) * 0.05;
        const x = p.x + side.x * (off + jx);
        const z = p.z + side.z * (off + jx);
        dummy.position.set(x, roadSurface(x, z) + BRICK_H * 0.5, z);
        // Hand-laid, not machined: a hair of yaw and lean on every brick, and
        // a little settle, so the surface catches the sun unevenly.
        dummy.rotation.set(
          (rnd() - 0.5) * 0.05,
          yaw + (rnd() - 0.5) * 0.05,
          (rnd() - 0.5) * 0.05,
        );
        dummy.scale.set(1, 0.8 + rnd() * 0.45, 1);
        dummy.updateMatrix();
        bricks.setMatrixAt(laid, dummy.matrix);
        tint.copy(brickTints[Math.floor(rnd() * brickTints.length)]);
        const shade = 0.9 + rnd() * 0.2;
        tint.multiplyScalar(shade);
        bricks.setColorAt(laid, tint);
        laid++;
      }
    }
    bricks.count = laid;
    bricks.instanceMatrix.needsUpdate = true;
    if (bricks.instanceColor) bricks.instanceColor.needsUpdate = true;
    bricks.castShadow = !opts.reducedMotion;
    bricks.receiveShadow = !opts.reducedMotion;
    bricks.frustumCulled = false;
    group.add(bricks);

    /* --- the kerb ------------------------------------------------------ */
    /*
     * The single most valuable centimetre in the whole scene: a raised stone
     * lip down both verges. It gives the road a lit top edge and a shadowed
     * face, so it stands up off the field, AND it is a clean hard boundary —
     * which is what lets the verges beyond it be empty without looking unfinished.
     */
    const KERB_STEP = 0.86;
    const kerbCount = Math.max(1, Math.floor(length / KERB_STEP)) * 2;
    const kerb = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.44, 0.42, KERB_STEP - 0.06),
      new THREE.MeshLambertMaterial({ flatShading: true }),
      kerbCount,
    );
    const kerbTints = [C.kerb, C.kerbDark].map((c) => new THREE.Color(c));
    let set = 0;
    for (let i = 0; i * KERB_STEP < length && set + 1 < kerbCount; i++) {
      const u = (i * KERB_STEP) / length;
      curve.getPointAt(Math.min(u, 1), p);
      curve.getTangentAt(Math.min(u, 1), tan);
      side.crossVectors(tan, up).normalize();
      const yaw = Math.atan2(tan.x, tan.z);
      for (const sgn of [-1, 1]) {
        const off = sgn * (ROAD_HALF + 0.28);
        const x = p.x + side.x * off;
        const z = p.z + side.z * off;
        dummy.position.set(x, roadSurface(x, z) + 0.1, z);
        dummy.rotation.set(0, yaw + (rnd() - 0.5) * 0.03, (rnd() - 0.5) * 0.03);
        dummy.scale.set(1, 0.85 + rnd() * 0.3, 1);
        dummy.updateMatrix();
        kerb.setMatrixAt(set, dummy.matrix);
        tint.copy(kerbTints[i % 2]).multiplyScalar(0.94 + rnd() * 0.12);
        kerb.setColorAt(set, tint);
        set++;
      }
    }
    kerb.count = set;
    kerb.instanceMatrix.needsUpdate = true;
    if (kerb.instanceColor) kerb.instanceColor.needsUpdate = true;
    kerb.castShadow = !opts.reducedMotion;
    kerb.receiveShadow = !opts.reducedMotion;
    kerb.frustumCulled = false;
    group.add(kerb);

    return group;
  }

  /* --- scenery ------------------------------------------------------- */
  const scenery = new THREE.Group();
  scene.add(scenery);

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

  const swayers: { g: THREE.Object3D; phase: number; amp: number }[] = [];
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
    if (roll < 0.3) {
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
    if (roll < 0.5) {
      // A real boulder where one has loaded; the same hand-built rock else.
      const real = placeModel("rock", x, z, { rotY: rnd() * Math.PI * 2, scale: 0.9 + rnd() * 0.6 });
      if (real) return real;
      const r = new THREE.Mesh(rockGeo, rockMat);
      r.position.set(x, terrainHeight(x, z) + 0.1, z);
      r.scale.set(0.6 + rnd() * 0.7, 0.4 + rnd() * 0.4, 0.6 + rnd() * 0.7);
      r.rotation.set(rnd(), rnd(), rnd());
      r.castShadow = !opts.reducedMotion;
      return r;
    }
    if (roll < 0.6) {
      const real = placeModel("stump", x, z, { rotY: rnd() * Math.PI * 2, scale: 1.7 + rnd() * 0.8 });
      if (real) return real;
      const r = new THREE.Mesh(rockGeo, rockMat);
      r.position.set(x, terrainHeight(x, z) + 0.1, z);
      r.scale.set(0.5 + rnd() * 0.3, 0.5 + rnd() * 0.3, 0.5 + rnd() * 0.3);
      r.castShadow = !opts.reducedMotion;
      return r;
    }
    if (roll < 0.68) {
      const real = placeModel("mushrooms", x, z, { rotY: rnd() * Math.PI * 2, scale: 2.2 + rnd() * 1.2 });
      if (real) return real;
      const g = new THREE.Group();
      const b = new THREE.Mesh(bushGeo, bushMat);
      b.scale.setScalar(0.4 + rnd() * 0.3);
      b.castShadow = !opts.reducedMotion;
      g.add(b);
      g.position.set(x, terrainHeight(x, z), z);
      return g;
    }
    if (roll < 0.76) {
      const real = placeModel("logStack", x, z, { rotY: rnd() * Math.PI * 2, scale: 1.5 + rnd() * 0.7 });
      if (real) return real;
      const r = new THREE.Mesh(rockGeo, rockMat);
      r.position.set(x, terrainHeight(x, z) + 0.1, z);
      r.scale.set(0.7 + rnd() * 0.3, 0.35 + rnd() * 0.2, 0.4 + rnd() * 0.2);
      r.rotation.set(0, rnd() * Math.PI, 0);
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
  const LEAF_COUNT = 130;
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

  /*
   * A LEVEL IS A PEDESTAL.
   *
   * Not a stump in the grass — a built thing: two stone steps, a brick shaft
   * of the same masonry as the road, a cornice that oversails it, and a cap
   * the number is cut into. Height is the point. A pedestal stands the number
   * a metre and a half clear of the brick around it, so at map distance the
   * eye finds a row of monuments rather than a row of coins, and the pencil
   * on top is unmistakably standing ON something.
   *
   * The numbers below stack: each layer's centre is the previous layer's top
   * plus half its own height, and PAD_TOP is where that stack ends. Everything
   * that has to sit on a level — the pencil, the ring, the stars, the
   * shockwave — is measured from PAD_TOP, so the pedestal can be re-proportioned
   * in one place without anything floating or sinking.
   */
  /*
   * PROPORTION. The first pass made these as wide as the road, and a pedestal
   * wider than its road is a table: it hid the brick, overhung the kerb, and
   * from an isometric camera read as a mushroom. Narrow and tall is the whole
   * trick — the base tucks inside the kerb line (ROAD_HALF is 2.3), the shaft
   * is slim enough to see brick either side of it, and the extra height is
   * what carries the number clear of everything.
   */
  /*
   * The real pedestal is a loaded model — see PEDESTAL_SCALE below — and
   * these four cylinders are what a pad stands on ONLY until that model has
   * loaded, or if it never does. They existed as the whole pedestal in an
   * earlier pass; keeping their geometry around as a fallback was free, and
   * a hand-built stand-in beats an empty column of air for the ~600ms a
   * normal load takes.
   */
  const stepAGeo = new THREE.CylinderGeometry(1.5, 1.74, 0.36, 8);
  const stepBGeo = new THREE.CylinderGeometry(1.28, 1.46, 0.3, 8);
  const shaftGeo = new THREE.CylinderGeometry(0.98, 1.16, 1.7, 8);
  const STEP_A_Y = 0.18;
  const STEP_B_Y = 0.51;
  const SHAFT_Y = 1.51;
  /*
   * The real pedestal is Nature Kit's statue_column — a fluted stone shaft
   * with a flared base and capital, base-to-top in one native unit. Scaled
   * ×2.85 to stand roughly where the old hand-built stack topped out.
   * `PEDESTAL_LIFT` corrects for the model's own -0.05 origin offset (its
   * geometry actually spans y=0..1 but the loaded node sits 0.05 low) so the
   * base still meets the road exactly rather than sinking into it.
   *
   * `FALLBACK_SCALE` reconciles a genuine mismatch: the real column's own
   * width (0.3 native units, ~0.85 at this scale) is a column's width, not a
   * pedestal's — narrower than the three-layer fallback stack it replaces.
   * Both still have to hand off to the SAME cornice and plaque above them
   * (see below), so the fallback stack is rescaled as one unit to top out at
   * exactly the height the real column does, whichever one is showing.
   */
  const PEDESTAL_SCALE = 2.85;
  const PEDESTAL_LIFT = 0.05 * PEDESTAL_SCALE;
  const FALLBACK_TOP = SHAFT_Y + 0.85; // shaft's own top, before rescaling
  const FALLBACK_SCALE = PEDESTAL_SCALE / FALLBACK_TOP;
  /*
   * THE CAPITAL. A real column ~0.85 units wide cannot hand off directly to
   * a ~2.7-wide number plaque — seen at map distance that read as a plaque
   * balanced on a toothpick. `corniceGeo` is what a capital has always been
   * for: it flares from a radius near the column's own (1.02) up to one near
   * the plaque's (1.34), so the width change happens as one deliberate
   * transition instead of a jump. It sits directly on top of the column (or
   * the rescaled fallback stack) and is shared by both.
   */
  // Top radius (1.6) is deliberately WIDER than the plaque sitting on it
  // (padGeo's own 1.26-1.36) — from this camera's steep top-down angle, a
  // capital only NARROWER than the plaque above it is invisible, hidden
  // entirely in the plaque's own shadow. Wider is what makes it read as a
  // capital the plaque rests ON, rather than as part of the plaque itself.
  const corniceGeo = new THREE.CylinderGeometry(1.6, 1.0, 0.3, 8);
  const padGeo = new THREE.CylinderGeometry(1.26, 1.36, 0.26, 8); // the number plaque
  const CORNICE_Y = PEDESTAL_SCALE + 0.15; // its own half-height above the column top
  // The plaque's own half-height (0.13) above the capital's top (CORNICE_Y + 0.15) —
  // get this wrong, as the first pass did by omitting it, and the plaque sinks half
  // its own thickness into the capital instead of resting on it.
  const CROWN_Y = CORNICE_Y + 0.15 + 0.13;
  const PAD_TOP = CROWN_Y + 0.13; // the surface a pencil stands on
  const ringGeo = new THREE.TorusGeometry(1.55, 0.11, 6, 20);
  /*
   * TAP TARGET. A pad is about 40 physical pixels across on a phone, and a
   * fingertip is nearer 45 — so an accurate tap on the number still missed.
   * Every pad carries an invisible column, roughly twice as wide, and that is
   * what the raycaster actually hits. Nothing about the picture changes.
   */
  const hitGeo = new THREE.CylinderGeometry(3.1, 3.1, 9, 6);

  /** Geometry every pad shares, and which therefore outlives any one pad. */
  const SHARED_PAD_GEO: ReadonlySet<THREE.BufferGeometry> = new Set([
    stepAGeo,
    stepBGeo,
    shaftGeo,
    corniceGeo,
    padGeo,
    ringGeo,
    hitGeo,
  ]);

  interface Pad {
    group: THREE.Group;
    index: number;
    node: LevelNode;
    signature: string;
    ring: THREE.Mesh | null;
    /** The cap + number + stars, as one bobbing group. */
    top: THREE.Object3D;
  }
  let pads: Pad[] = [];
  const padMap = new Map<number, Pad>();

  function padSignature(node: LevelNode): string {
    // modelsLoaded is last on purpose: it flips at most once, from false to
    // true, and every already-built pad's signature changes with it — that
    // one-time mismatch is what upgrades a fallback stack to the real column.
    return [node.id, node.label, node.unlocked, node.done, node.isNext, node.isSelected, node.isChat, modelsLoaded].join(
      "|",
    );
  }

  function buildPad(node: LevelNode, index: number): Pad {
    const g = new THREE.Group();
    const p = nodePosition(index);
    g.position.copy(p);
    // A chain of identical stones reads as a loading placeholder. A per-level
    // twist and a hair of scale — deterministic, so a pad never moves between
    // visits — makes the same geometry read as a row of individual stumps.
    const wob = mulberry(index * 2654435761)();
    g.scale.setScalar(0.94 + wob * 0.12);

    const turn = wob * Math.PI * 2;
    const capMat = new THREE.MeshLambertMaterial({
      color: node.isNext ? C.next : node.unlocked ? C.padCap : C.padLocked,
      flatShading: true,
    });

    /*
     * A LEVEL IS A PEDESTAL — and now a real one: a fluted stone column,
     * loaded once and cloned per pad. `uniqueMaterials: true` is what makes
     * the next line safe — every pad gets its own material instance to tint,
     * rather than a shared one every OTHER pad would also change colour.
     *
     * A locked pedestal goes flat grey, matched to the locked plaque above
     * it. An unlocked one keeps the model's own pale stone — it needed no
     * repainting to fit: the map already has grey-stone ABC ruins in the
     * same palette, so a stone monument standing every few levels reads as
     * the same world, not an inserted asset.
     */
    const column = getModel("pedestal", { uniqueMaterials: true });
    if (column) {
      column.scale.setScalar(PEDESTAL_SCALE);
      column.position.y = PEDESTAL_LIFT;
      column.rotation.y = turn;
      column.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        o.castShadow = !opts.reducedMotion;
        o.receiveShadow = !opts.reducedMotion;
        if (!node.unlocked) (o.material as THREE.MeshLambertMaterial).color.set(C.padLocked);
      });
      g.add(column);
    } else {
      // The model has not loaded yet (or never will) — the hand-built stack
      // this pedestal used to be, minus its own cornice (there is now one
      // shared capital below, common to both paths), rescaled by
      // FALLBACK_SCALE so it hands off to that capital at the same height
      // the real column does.
      const stoneMat = new THREE.MeshLambertMaterial({
        color: node.unlocked ? C.plinth : C.padLocked,
        flatShading: true,
      });
      const stoneDarkMat = new THREE.MeshLambertMaterial({
        color: node.unlocked ? C.plinthDark : C.padLocked,
        flatShading: true,
      });
      const shaftMat = new THREE.MeshLambertMaterial({
        color: node.unlocked ? C.brick : C.padLocked,
        flatShading: true,
      });
      const fallback = new THREE.Group();
      fallback.scale.setScalar(FALLBACK_SCALE);
      for (const [geo, y, mat] of [
        [stepAGeo, STEP_A_Y, stoneDarkMat],
        [stepBGeo, STEP_B_Y, stoneMat],
        [shaftGeo, SHAFT_Y, shaftMat],
      ] as [THREE.CylinderGeometry, number, THREE.Material][]) {
        const m = new THREE.Mesh(geo, mat);
        m.position.y = y;
        m.rotation.y = turn;
        m.castShadow = !opts.reducedMotion;
        m.receiveShadow = !opts.reducedMotion;
        fallback.add(m);
      }
      g.add(fallback);
    }

    // The capital: shared by the real column and the fallback stack alike,
    // and the same colour rule as the rest of the stonework beneath it.
    const corniceMat = new THREE.MeshLambertMaterial({
      color: node.unlocked ? C.plinth : C.padLocked,
      flatShading: true,
    });
    const cornice = new THREE.Mesh(corniceGeo, corniceMat);
    cornice.position.y = CORNICE_Y;
    cornice.rotation.y = turn + Math.PI / 8;
    cornice.castShadow = !opts.reducedMotion;
    cornice.receiveShadow = !opts.reducedMotion;
    g.add(cornice);

    /*
     * The crown — cap, number and stars — is one group because they move as
     * one. The next level's cap breathes; if the digits stayed put while the
     * stone under them rose, the number would look printed on the air.
     */
    const top = new THREE.Group();
    top.position.y = CROWN_Y;
    g.add(top);

    const cap = new THREE.Mesh(padGeo, capMat);
    cap.rotation.y = turn + Math.PI / 8;
    cap.castShadow = !opts.reducedMotion;
    cap.receiveShadow = !opts.reducedMotion;
    top.add(cap);

    /*
     * A locked pad gets a lock and NOTHING else — no title, no requirement,
     * no progress line. That is the whole instruction: come back later. An
     * unlocked pad gets its number, and the chat pad gets its glyph.
     */
    const face = node.isChat ? "💬" : node.unlocked ? node.label : "🔒";
    // Level numbers stay plain, high-contrast white: no colour treatment or
    // outline competes with the digit children are choosing.
    const faceColor = node.unlocked ? "#ffffff" : "#eef1f4";
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 1.9),
      new THREE.MeshBasicMaterial({
        map: labelTexture(face, faceColor),
        transparent: true,
        depthWrite: false,
      }),
    );
    // YXZ order so the Y turn happens in WORLD space, after the flat-lay:
    // the plane's text-up ends on FWD, which is straight up the screen.
    decal.rotation.order = "YXZ";
    decal.rotation.set(-Math.PI / 2, Math.PI / 4, 0);
    decal.position.y = PAD_TOP - CROWN_Y + 0.01;
    top.add(decal);

    /*
     * "You are going HERE." A ground ring alone is lost among the pads at this
     * zoom, so the next level also gets a chevron floating over it — the one
     * piece of the scene allowed to bob and glow, because it is the only piece
     * a child has to find.
     */
    let ring: THREE.Mesh | null = null;
    if (node.isNext || node.isSelected) {
      const destination = node.isSelected && !node.isNext;
      ring = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({
          color: destination ? 0x45dfff : 0xffffff,
          transparent: true,
          opacity: 0.9,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = PAD_TOP + 0.07;
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
        new THREE.MeshLambertMaterial({
          color: destination ? 0x45dfff : 0x2fbd63,
          emissive: destination ? 0x16769a : 0x1d7d40,
        }),
      );
      /*
       * Height is a readability decision, not a taste one: seen down an
       * isometric camera, "up" is also "further up the screen", so a chevron
       * parked eight units over its pad drew level with the pad two ahead and
       * pointed at the wrong one. At four it stays over the pad it means —
       * which matters more now that a phone zooms in on all this.
       */
      mark.position.y = PAD_TOP + 2.9;
      mark.scale.setScalar(1.5);
      mark.name = "chevron";
      mark.castShadow = false;
      g.add(mark);
    }

    // Stars earned, as three small discs — shape and count, never colour alone.
    if (node.done) {
      for (let i = 0; i < 3; i++) {
        const s = new THREE.Mesh(
          new THREE.CircleGeometry(0.14, 5),
          new THREE.MeshBasicMaterial({ color: 0xf2c14b }),
        );
        s.rotation.order = "YXZ";
        s.rotation.set(-Math.PI / 2, Math.PI / 4, 0);
        s.position.set((i - 1) * 0.36, PAD_TOP - CROWN_Y + 0.02, 0.8);
        top.add(s);
      }
    }

    const hit = new THREE.Mesh(
      hitGeo,
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
    );
    hit.position.y = 4;
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

  // The route is a quiet visual bridge between where the pencil truly stands
  // and the destination a child has chosen to inspect.
  const routeGeo = new THREE.BufferGeometry();
  const routeMat = new THREE.LineDashedMaterial({
    color: 0x45dfff,
    dashSize: 0.9,
    gapSize: 0.45,
    transparent: true,
    opacity: 0.9,
  });
  const route = new THREE.Line(routeGeo, routeMat);
  route.visible = false;
  scene.add(route);

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
      st.p.set(at.x, at.y + PAD_TOP + 0.15, at.z);
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
  /**
   * Where the camera is actually LOOKING, independent of `focusIndex` (which
   * only moves on a tap). Dragging used to go nowhere: the pad window only
   * ever followed `focusIndex`, so panning past it showed real brick running
   * out into an empty track after ~13 levels — and the one way to see more
   * was to tap the furthest unlocked pad, which moved `focusIndex` and
   * rebuilt the window there. This anchor lets a drag do the same thing
   * continuously, so the whole course scrolls, locked levels included.
   */
  let panWindowIndex = 0;

  function disposePad(p: Pad) {
    p.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        // Two different "shared" sets: SHARED_PAD_GEO is this file's own
        // hand-built fallback geometry; SHARED_MODEL_RESOURCES (assets.ts)
        // is the pedestal model's geometry — cloned per pad for its
        // material (see PEDESTAL_SCALE above) but NOT for its geometry, so
        // disposing it here would free it out from under every other pad.
        if (!SHARED_PAD_GEO.has(o.geometry) && !SHARED_MODEL_RESOURCES.has(o.geometry)) {
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
    const anchors = [focusIndex, panWindowIndex, ...focusTrail.map((entry) => entry.index)];
    const desired = new Set(
      padWindowIndices(levels.length, anchors, PAD_WINDOW_BACK, PAD_WINDOW_FORWARD),
    );
    nextPadPruneAt = focusTrail.length
      ? Math.min(...focusTrail.map((entry) => entry.until))
      : 0;
    return desired;
  }

  /** Incrementally reconcile the live pad windows instead of blanking them. */
  function updateRoute(from: number, to: number) {
    if (from === to) {
      route.visible = false;
      return;
    }
    const start = Math.min(from, to);
    const end = Math.max(from, to);
    const points: THREE.Vector3[] = [];
    for (let i = start; i <= end; i++) {
      const point = nodePosition(i);
      point.y += PAD_TOP + 0.2;
      points.push(point);
    }
    routeGeo.setFromPoints(points);
    route.computeLineDistances();
    route.visible = true;
  }

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

  /**
   * Place a loaded model, or return null so the caller can fall back to its
   * hand-built equivalent. Every call site below has a fallback — a slow
   * connection or a 404 degrades to the road this app already had, never to
   * a hole in the scene.
   */
  function placeModel(
    key: ModelKey,
    x: number,
    z: number,
    opts: { rotY?: number; scale?: number; yOffset?: number } = {},
  ): THREE.Object3D | null {
    const m = getModel(key);
    if (!m) return null;
    m.position.set(x, terrainHeight(x, z) + (opts.yOffset ?? 0), z);
    m.rotation.y = opts.rotY ?? 0;
    if (opts.scale) m.scale.setScalar(opts.scale);
    return m;
  }

  function buildScenery(count: number) {
    const extent = Math.max(count, 46);
    /*
     * Distant hills. The camera is orthographic and tilted down, so without
     * something standing up at the far end the top of the frame is simply more
     * grass — and the road stops reading as going anywhere. These sit deep in
     * the fog, so they are a silhouette rather than a place.
     */
    const hillMat = new THREE.MeshLambertMaterial({ color: 0x7fb46a, flatShading: true });
    for (let i = 0; i < 18; i++) {
      const along = extent * 0.55 + i * 2.8;
      const base = nodePosition(along);
      /*
       * Hills must read as a background silhouette, never as a prop on the
       * track. Their old side offset could be almost zero; with a 34-unit
       * footprint, hills generated at levels 78 and 89 covered the pads.
       * Keep even the widest cone beyond the road, pedestal, and an 8-unit
       * visual buffer on either verge.
       */
      const HILL_CLEAR = 52;
      const off = (HILL_CLEAR + rnd() * 32) * (rnd() < 0.5 ? -1 : 1);
      const h = new THREE.Mesh(new THREE.ConeGeometry(16 + rnd() * 18, 9 + rnd() * 12, 5), hillMat);
      h.position.set(base.x + SIDE.x * off, -1.5, base.z + SIDE.z * off);
      h.rotation.y = rnd() * Math.PI;
      scenery.add(h);
    }

    /*
     * A CLEAR VERGE.
     *
     * Everything used to crowd the kerb: trees from 5.5 units out, three
     * clumps of bush-rock-flowers per level from 2.8 — which is inside the
     * pedestal's own footprint — plus a line of loose boundary pebbles. The
     * result was a tunnel of noise the eye had to fight through to find the
     * number it came for, and the road's edge was lost in it.
     *
     * Nothing is deleted from the world; it is moved OUT of it. VERGE_CLEAR
     * is the band either side of the kerb that stays mown grass and nothing
     * else, and every scatter below starts beyond it. The road now has room
     * to be looked at.
     */
    const VERGE_CLEAR = ROAD_HALF + 6.2;

    // Trees stand back from the verge, so the road keeps a clean silhouette.
    for (let i = -2; i < extent; i++) {
      const base = nodePosition(i);
      for (const side of [-1, 1]) {
        if (rnd() < 0.3) continue;
        const off = (VERGE_CLEAR + 1.5 + rnd() * 12) * side;
        const jitter = (rnd() - 0.5) * SPACING;
        const x = base.x + SIDE.x * off + FWD.x * jitter;
        const z = base.z + SIDE.z * off + FWD.z * jitter;
        // Real trees where they have loaded — oak most often, pine and palm
        // for variety — the hand-built low-poly tree everywhere else.
        const roll = rnd();
        const key: ModelKey = roll < 0.5 ? "treeOak" : roll < 0.82 ? "treePine" : "treePalm";
        // Native model height is ~1.2-1.4 units — a good deal shorter than
        // the hand-built tree() it stands in for, which reaches 2.5-4 units
        // canopy included. Scaled 1:1 it read as a shrub next to a pedestal;
        // this brings it back to the same silhouette height.
        const real = placeModel(key, x, z, {
          rotY: rnd() * Math.PI * 2,
          scale: 2.1 + rnd() * 1.1,
        });
        const t = real ?? tree(x, z, 0.9 + rnd() * 0.9);
        scenery.add(t);
        swayers.push({ g: t, phase: rnd() * Math.PI * 2, amp: 0.02 + rnd() * 0.03 });
      }
      // One clump per level at most, and never inside the clear band: cover
      // is there to break up the middle distance, not to fringe the kerb.
      if (rnd() < 0.55) {
        const off = (VERGE_CLEAR + rnd() * 9) * (rnd() < 0.5 ? -1 : 1);
        const jit = (rnd() - 0.5) * SPACING;
        scenery.add(
          undergrowth(base.x + SIDE.x * off + FWD.x * jit, base.z + SIDE.z * off + FWD.z * jit),
        );
      }
    }

    /*
     * Hundreds of grass blades sound expensive; one instanced triangle is
     * not. They catch the sun at different angles and remove the last broad,
     * empty patches of "green floor" without adding draw calls per blade.
     */
    const grassCount = Math.min(560, extent * 10);
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
      const off = side * (VERGE_CLEAR - 2.4 + rnd() * 24);
      const along = (rnd() - 0.5) * SPACING;
      const x = base.x + SIDE.x * off + FWD.x * along;
      const z = base.z + SIDE.z * off + FWD.z * along;
      dummy.position.set(x, terrainHeight(x, z), z);
      dummy.rotation.set((rnd() - 0.5) * 0.16, rnd() * Math.PI, (rnd() - 0.5) * 0.2);
      const s = 0.55 + rnd() * 1.45;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      tufts.setMatrixAt(i, dummy.matrix);
      tufts.setColorAt(i, grassColors[Math.floor(rnd() * grassColors.length)]);
    }
    tufts.instanceMatrix.needsUpdate = true;
    if (tufts.instanceColor) tufts.instanceColor.needsUpdate = true;
    tufts.frustumCulled = false;
    scenery.add(tufts);

    /*
     * The loose boundary pebbles that used to run down both verges are gone.
     * They were doing the kerb's job badly — a scatter of grey lumps reads as
     * litter at this camera angle, where a laid stone lip reads as a road.
     * See `buildRoad`, which now lays that lip properly.
     */

    /*
     * The alphabet ruins are the landmark that makes the road somewhere rather
     * than anywhere. One prop parked at level 2 was invisible by level 4, so
     * they recur: a monument every dozen levels or so, alternating verges,
     * each sunk to its own depth. Whatever you have climbed, one is in view.
     */
    for (let n = 0; n < Math.ceil(extent / 12); n++) {
      const at = 3 + n * 12;
      const side = n % 2 === 0 ? -1 : 1;
      const anchor = nodePosition(at);
      const r = ruin();
      r.position.set(anchor.x + SIDE.x * 21 * side, 0, anchor.z + SIDE.z * 21 * side);
      r.rotation.y = Math.PI * 0.25 + n * 0.7;
      r.scale.setScalar(1.6 + rnd() * 0.5);
      scenery.add(r);
    }

    /*
     * Book gardens alternate with the stone alphabet. Each cluster is a tiny
     * scene: a stack, an open page, and a warm marker ribbon. Repetition gives
     * the road rhythm; small rotations stop it looking procedurally stamped.
     */
    for (let n = 0, at = 8; at < extent; n++, at += 13) {
      const side = n % 2 === 0 ? 1 : -1;
      const anchor = nodePosition(at);
      const x = anchor.x + SIDE.x * 17.5 * side;
      const z = anchor.z + SIDE.z * 17.5 * side;
      const books = bookStack(0xb00c + n * 91);
      books.position.set(x, terrainHeight(x, z), z);
      books.rotation.y = Math.PI * 0.25 + n * 0.8;
      books.scale.setScalar(1.1 + (n % 3) * 0.12);
      scenery.add(books);

      const open = openBook();
      const ox = x + FWD.x * 5.2 + SIDE.x * side * 1.4;
      const oz = z + FWD.z * 5.2 + SIDE.z * side * 1.4;
      open.position.set(ox, terrainHeight(ox, oz), oz);
      open.rotation.y = -Math.PI * 0.25 + n * 0.55;
      open.scale.setScalar(0.82);
      scenery.add(open);
    }

    /*
     * Water breaks the green palette and gives the journey real places.
     * Alternating a pond with a real stone fountain is what turns "the same
     * prop every 17 levels" into two different kinds of place.
     *
     * The wooden bridge model is its own small thing, not a span for this
     * pond — its footprint is a single ~1-unit tile, meant to cross a
     * garden brook, not an 8-14 unit pond. Stretching it to fit would have
     * turned delicate planking into a chunky slab. It gets its own cadence
     * below, alongside a rock cluster, instead.
     */
    for (let n = 0, at = 13; at < extent; n++, at += 17) {
      const side = n % 2 === 0 ? -1 : 1;
      const anchor = nodePosition(at);
      const x = anchor.x + SIDE.x * 20 * side;
      const z = anchor.z + SIDE.z * 20 * side;
      if (n % 2 === 1) {
        // fountain-center is a 1-unit tile in Fantasy Town Kit's own grid —
        // Nature Kit's props are on a ~1-unit grid too, but Town Kit's other
        // five models here are all 2-unit, which is why their scales below
        // look so much smaller than this one.
        const real = placeModel("fountain", x, z, { rotY: n * 0.8, scale: 2.8 + rnd() * 0.6 });
        if (real) {
          scenery.add(real);
          continue;
        }
      }
      const p = pond(0x90ad + n * 137);
      p.position.set(x, terrainHeight(x, z) - 0.13, z);
      p.rotation.y = n * 0.8;
      scenery.add(p);
    }

    /*
     * SEVEN MORE LANDMARKS, each on its own cadence so no two ever line up:
     * a windmill turning over the tree line, a stone archway framing the
     * verge, a lit lantern at a child's-eye scale near the kerb, a garden
     * bridge over its own little rock crossing, a trailside signpost, a
     * campfire ring, and a cart-and-stall market cluster. Every one is
     * skipped outright when its model has not loaded — there is no
     * hand-built stand-in for a windmill, and an empty verge is a better
     * failure than a placeholder box.
     *
     * SCALE, EXPLAINED ONCE: every number below is `desired world size ÷
     * the model's own bounding-box size` — Nature Kit ships on a ~1-unit
     * grid, Fantasy Town Kit mostly on a 2-unit one (fountain-center is the
     * one Town Kit exception, see above), so a Town Kit scale that looks
     * right is roughly half a Nature Kit one for the same world size. Get
     * this wrong, as the first pass did, and a lantern comes out the size of
     * a windmill.
     */
    for (let n = 0, at = 10; at < extent; n++, at += 26) {
      const side = n % 2 === 0 ? 1 : -1;
      const anchor = nodePosition(at);
      const x = anchor.x + SIDE.x * 24 * side;
      const z = anchor.z + SIDE.z * 24 * side;
      // Native height 3.11; scaled to stand taller than the ABC ruin, so
      // whichever landmark is nearer always reads as the bigger one.
      const m = placeModel("windmill", x, z, { rotY: n * 0.6, scale: 2.1 + rnd() * 0.4 });
      if (m) scenery.add(m);
    }

    for (let n = 0, at = 20; at < extent; n++, at += 23) {
      const side = n % 2 === 0 ? -1 : 1;
      const anchor = nodePosition(at);
      const x = anchor.x + SIDE.x * 18 * side;
      const z = anchor.z + SIDE.z * 18 * side;
      const m = placeModel("arch", x, z, {
        rotY: Math.PI / 2 + side * 0.2,
        scale: 2.3 + rnd() * 0.4,
      });
      if (m) scenery.add(m);
    }

    for (let i = 2; i < extent; i += 5) {
      const side = i % 10 < 5 ? -1 : 1;
      const base = nodePosition(i);
      const x = base.x + SIDE.x * (VERGE_CLEAR - 3) * side;
      const z = base.z + SIDE.z * (VERGE_CLEAR - 3) * side;
      // Deliberately the smallest scale of the six: this is a lamp post, not
      // a landmark, and it lines the road every 5 levels — big would clutter
      // exactly what the verge clean-up was for.
      const m = placeModel("lantern", x, z, { rotY: rnd() * Math.PI * 2, scale: 0.5 + rnd() * 0.18 });
      if (m) scenery.add(m);
    }

    for (let n = 0, at = 9; at < extent; n++, at += 21) {
      const side = n % 2 === 0 ? -1 : 1;
      const anchor = nodePosition(at);
      const x = anchor.x + SIDE.x * 16 * side;
      const z = anchor.z + SIDE.z * 16 * side;
      const m = placeModel("bridge", x, z, { rotY: rnd() * Math.PI * 2, scale: 1.8 + rnd() * 0.5 });
      if (m) scenery.add(m);
    }

    for (let n = 0, at = 6; at < extent; n++, at += 15) {
      const side = n % 2 === 0 ? 1 : -1;
      const anchor = nodePosition(at);
      const x = anchor.x + SIDE.x * (VERGE_CLEAR + 2) * side;
      const z = anchor.z + SIDE.z * (VERGE_CLEAR + 2) * side;
      const m = placeModel("sign", x, z, { rotY: -side * Math.PI * 0.35, scale: 1.8 + rnd() * 0.6 });
      if (m) scenery.add(m);
    }

    for (let n = 0, at = 16; at < extent; n++, at += 19) {
      const side = n % 2 === 0 ? -1 : 1;
      const anchor = nodePosition(at);
      const x = anchor.x + SIDE.x * 15 * side;
      const z = anchor.z + SIDE.z * 15 * side;
      const m = placeModel("campfire", x, z, { rotY: rnd() * Math.PI * 2, scale: 2.0 + rnd() * 0.8 });
      if (m) scenery.add(m);
    }

    for (let n = 0, at = 24; at < extent; n++, at += 28) {
      const side = n % 2 === 0 ? 1 : -1;
      const anchor = nodePosition(at);
      const sx = anchor.x + SIDE.x * 19 * side;
      const sz = anchor.z + SIDE.z * 19 * side;
      const st = placeModel("stall", sx, sz, { rotY: -side * Math.PI * 0.3, scale: 1.3 + rnd() * 0.2 });
      if (st) scenery.add(st);
      const cx = sx + FWD.x * 4.5 + SIDE.x * side * 2;
      const cz = sz + FWD.z * 4.5 + SIDE.z * side * 2;
      const cart = placeModel("cart", cx, cz, { rotY: n * 0.9, scale: 0.85 + rnd() * 0.15 });
      if (cart) scenery.add(cart);
    }

    /* High silhouettes add depth without competing with the playable pads. */
    for (let n = 0, at = 4; at < extent; n++, at += 9) {
      const anchor = nodePosition(at);
      const side = n % 2 === 0 ? -1 : 1;
      const c = cloud(0xc10d + n * 31);
      const home = new THREE.Vector3(
        anchor.x + SIDE.x * side * (20 + (n % 3) * 5),
        terrainHeight(anchor.x, anchor.z) + 16 + (n % 2) * 4,
        anchor.z + SIDE.z * side * (20 + (n % 3) * 5),
      );
      c.position.copy(home);
      c.scale.setScalar(0.78 + (n % 3) * 0.16);
      scenery.add(c);
      floaters.push({ g: c, home, phase: n * 1.7, drift: 0.65, lift: 0.35 });
    }

    for (let n = 0, at = 6; at < extent; n++, at += 8) {
      const anchor = nodePosition(at);
      const side = n % 2 === 0 ? 1 : -1;
      const plane = paperPlane();
      const home = new THREE.Vector3(
        anchor.x + SIDE.x * side * 10,
        terrainHeight(anchor.x, anchor.z) + 8 + (n % 3) * 1.6,
        anchor.z + SIDE.z * side * 10,
      );
      plane.position.copy(home);
      plane.rotation.set(0.15, Math.PI * 0.25 + n * 0.9, -0.1);
      plane.scale.setScalar(0.8 + (n % 2) * 0.25);
      scenery.add(plane);
      floaters.push({ g: plane, home, phase: n * 2.1, drift: 1.4, lift: 0.8 });
    }
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
  /*
   * Bounded by the TRACK, not by the pad window any more: the pad window
   * (WINDOW_BACK/WINDOW_FWD) follows `panWindowIndex` as the camera moves
   * (see the frame loop below) and rebuilds around wherever that lands, so a
   * drag can reach any level, unlocked or not — this is what lets a child
   * scroll the whole course from level 1. What DOES still bound the drag is
   * the track's own ends: level 0 and the last level that exists.
   */
  function panBounds(): { min: number; max: number } {
    const total = levels.length;
    if (total <= 0) return { min: 0, max: 0 };
    return { min: -focusIndex, max: total - 1 - focusIndex };
  }
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
    const { min, max } = panBounds();
    if (v < min) return min + (v - min) * 0.35;
    if (v > max) return max + (v - max) * 0.35;
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
      const { min: panMin, max: panMax } = panBounds();
      const clamped = THREE.MathUtils.clamp(panGoal, panMin, panMax);
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
    // Keep the pad window under wherever the camera is actually looking, not
    // just under `focusIndex`. Threshold of 3 (a quarter of the window)
    // keeps this from rebuilding pads on every single frame of a flick.
    const roundedShown = Math.round(shown);
    if (Math.abs(roundedShown - panWindowIndex) >= 3) {
      panWindowIndex = roundedShown;
      refreshPads();
    }
    // Look PAST the focus: that pushes the pad you are on down the frame and
    // leaves the road climbing away above it, which is the whole point of the
    // perspective. How far past is `lookAhead`, which a phone shortens so the
    // pencil clears the play button.
    const look = advancing
      ? nodePosition(advancing.to + lookAhead * 0.5)
      : nodePosition(shown + lookAhead);
    camGoal.set(look.x, look.y + 1.9, look.z);
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
          shock.position.set(b.x, b.y + PAD_TOP + 0.08, b.z);
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
    player.position.y += PAD_TOP + 0.05; // stand on the pad, not in it

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
          p.top.position.y = CROWN_Y + Math.sin(t * 2.2) * 0.07;
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
      updateRoute(player, focus);
      if (focusIndex !== focus) rememberFocus(focusIndex);
      focusIndex = focus;
      panWindowIndex = focus;
      rememberFocus(focus);
      if (!built) {
        built = true;
        const span = Math.max(next.length, 46);
        /*
         * Race the sixteen imported models against a short clock rather than
         * either extreme: build with hand-built stand-ins the instant they
         * are ready (blocking on a slow connection would hold the whole map
         * hostage to a tree), or ignore them entirely (a 330KB fetch that is
         * usually done before this frame even runs deserves to be waited
         * for). 600ms is short enough that a normal load never notices it,
         * and long enough to cover the fetch on everything but a genuinely
         * bad connection — which still gets the road on time, procedural.
         */
        Promise.race([modelsReady, sleep(600)]).then(() => {
          if (disposed) return;
          road = buildRoad(span);
          scene.add(road);
          buildScenery(span);
          camTarget.copy(nodePosition(focusIndex + 0.8));
          placeCamera();
          resize();
          frame();
        });
      }
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
      panWindowIndex = index;
      rememberFocus(index);
      // A selection made after browsing becomes the new camera origin.
      // Keeping the old browse offset would add it to the selected level
      // and fling the camera beyond the end of the track.
      panOffset = 0;
      panGoal = 0;
      panVel = 0;
      lastTouchAt = performance.now();
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
      panWindowIndex = to;
      rememberFocus(to);
      panGoal = 0;
      panOffset = 0;
      panVel = 0;
      playerIndex = to;
      hop = null;
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
          if (!SHARED_MODEL_RESOURCES.has(o.geometry)) o.geometry.dispose();
          const m = o.material as THREE.Material | THREE.Material[];
          const list = Array.isArray(m) ? m : [m];
          for (const mat of list) {
            if (!SHARED_MODEL_RESOURCES.has(mat)) mat.dispose();
          }
        }
      });
      labelCache.forEach((t) => t.dispose());
      labelCache.clear();
      routeGeo.dispose();
      routeMat.dispose();
      renderer.dispose();
    },
  };
}

export type World = ReturnType<typeof createWorld>;
