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

function labelTexture(text: string, color: string): THREE.CanvasTexture {
  const key = `${text}|${color}`;
  const hit = labelCache.get(key);
  if (hit) return hit;
  const s = 128;
  const cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const g = cv.getContext("2d")!;
  g.clearRect(0, 0, s, s);
  g.fillStyle = color;
  g.font = `800 ${text.length > 2 ? 52 : 68}px system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
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
  const VIEW = 27; // half-height of the frustum in world units
  const STANDOFF = 60;
  const camera = new THREE.OrthographicCamera(-VIEW, VIEW, VIEW, -VIEW, 0.1, 260);
  const camTarget = new THREE.Vector3();
  const camGoal = new THREE.Vector3();

  function placeCamera() {
    camera.position.copy(camTarget).addScaledVector(ISO, STANDOFF);
    camera.lookAt(camTarget);
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
  function buildRoad(count: number): THREE.Mesh {
    const pts: THREE.Vector3[] = [];
    for (let i = -2; i < count + 3; i++) pts.push(nodePosition(i));
    const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.4);
    const steps = pts.length * 8;
    const verts: number[] = [];
    const uvs: number[] = [];
    const idx: number[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const p = curve.getPoint(t);
      const tan = curve.getTangent(t);
      const side = new THREE.Vector3().crossVectors(tan, up).normalize();
      // A road that breathes: the width wobbles slightly so it reads as worn
      // earth rather than an extruded rectangle.
      const w = 2.1 + Math.sin(t * 40) * 0.16;
      const l = p.clone().addScaledVector(side, -w);
      const r = p.clone().addScaledVector(side, w);
      verts.push(l.x, terrainHeight(l.x, l.z) + 0.06, l.z);
      verts.push(r.x, terrainHeight(r.x, r.z) + 0.06, r.z);
      uvs.push(0, t * 20, 1, t * 20);
      if (i < steps) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: C.dirt }));
    m.receiveShadow = !opts.reducedMotion;
    return m;
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

  const swayers: { g: THREE.Group; phase: number; amp: number }[] = [];

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

  const padGeo = new THREE.CylinderGeometry(1.55, 1.75, 0.5, 8);
  const stumpGeo = new THREE.CylinderGeometry(1.35, 1.5, 1.1, 8);
  const ringGeo = new THREE.TorusGeometry(1.85, 0.12, 6, 20);

  interface Pad {
    group: THREE.Group;
    index: number;
    node: LevelNode;
    ring: THREE.Mesh | null;
    top: THREE.Mesh;
  }
  let pads: Pad[] = [];

  function buildPad(node: LevelNode, index: number): Pad {
    const g = new THREE.Group();
    const p = nodePosition(index);
    g.position.copy(p);
    // A chain of identical stones reads as a loading placeholder. A per-level
    // twist and a hair of scale — deterministic, so a pad never moves between
    // visits — makes the same geometry read as a row of individual stumps.
    const wob = mulberry(index * 2654435761)();
    g.scale.setScalar(0.94 + wob * 0.12);

    const stumpMat = new THREE.MeshLambertMaterial({
      color: node.unlocked ? C.woodDark : C.padLocked,
    });
    const topMat = new THREE.MeshLambertMaterial({
      color: node.isNext ? C.next : node.unlocked ? C.wood : C.padLocked,
    });

    const stump = new THREE.Mesh(stumpGeo, stumpMat);
    stump.rotation.y = wob * Math.PI * 2;
    stump.position.y = 0.55;
    stump.castShadow = !opts.reducedMotion;
    stump.receiveShadow = !opts.reducedMotion;
    g.add(stump);

    const top = new THREE.Mesh(padGeo, topMat);
    top.rotation.y = wob * Math.PI * 2;
    top.position.y = 1.3;
    top.castShadow = !opts.reducedMotion;
    top.receiveShadow = !opts.reducedMotion;
    g.add(top);

    /*
     * A locked pad gets a lock and NOTHING else — no title, no requirement,
     * no progress line. That is the whole instruction: come back later. An
     * unlocked pad gets its number, and the chat pad gets its glyph.
     */
    const face = node.isChat ? "💬" : node.unlocked ? node.label : "🔒";
    const faceColor = node.isNext ? "#ffffff" : node.unlocked ? "#5a3a17" : "#eef1f4";
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
    decal.position.y = 1.56;
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
      ring.position.y = 1.62;
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
        new THREE.MeshLambertMaterial({ color: 0x2fbd63, emissive: 0x1d7d40 }),
      );
      mark.position.y = 8.4;
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
        s.position.set((i - 1) * 0.45, 1.57, 1.05);
        g.add(s);
      }
    }

    padGroup.add(g);
    return { group: g, index, node, ring, top };
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

  /* --- state ---------------------------------------------------------- */
  let levels: LevelNode[] = [];
  let focusIndex = 0;
  let playerIndex = 0;
  let hop: { from: number; to: number; t: number } | null = null;
  let road: THREE.Mesh | null = null;
  let built = false;
  let disposed = false;

  const WINDOW_BACK = 4;
  const WINDOW_FWD = 9;

  function clearPads() {
    for (const p of pads) {
      p.group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          if (o.geometry !== padGeo && o.geometry !== stumpGeo && o.geometry !== ringGeo) {
            o.geometry.dispose();
          }
          const m = o.material as THREE.Material | THREE.Material[];
          if (Array.isArray(m)) m.forEach((x) => x.dispose());
          else m.dispose();
        }
      });
      padGroup.remove(p.group);
    }
    pads = [];
  }

  /** Rebuild only the pads near the focus. 100 lessons, ~14 meshes. */
  function refreshPads() {
    clearPads();
    const from = Math.max(0, focusIndex - WINDOW_BACK);
    const to = Math.min(levels.length, focusIndex + WINDOW_FWD);
    for (let i = from; i < to; i++) pads.push(buildPad(levels[i], i));
  }

  function buildScenery() {
    /*
     * Distant hills. The camera is orthographic and tilted down, so without
     * something standing up at the far end the top of the frame is simply more
     * grass — and the road stops reading as going anywhere. These sit deep in
     * the fog, so they are a silhouette rather than a place.
     */
    const hillMat = new THREE.MeshLambertMaterial({ color: 0x7fb46a, flatShading: true });
    for (let i = 0; i < 14; i++) {
      const along = 30 + i * 3.4;
      const base = nodePosition(along);
      const off = (rnd() - 0.5) * 150;
      const h = new THREE.Mesh(new THREE.ConeGeometry(16 + rnd() * 18, 9 + rnd() * 12, 5), hillMat);
      h.position.set(base.x + SIDE.x * off - 30, -1.5, base.z + SIDE.z * off - 30);
      h.rotation.y = rnd() * Math.PI;
      scenery.add(h);
    }

    // Trees along both verges, thinning near the road so pads stay readable.
    for (let i = -2; i < 44; i++) {
      const base = nodePosition(i);
      for (const side of [-1, 1]) {
        if (rnd() < 0.16) continue;
        const off = (5.5 + rnd() * 13) * side;
        const jitter = (rnd() - 0.5) * SPACING;
        const x = base.x + SIDE.x * off + FWD.x * jitter;
        const z = base.z + SIDE.z * off + FWD.z * jitter;
        const t = tree(x, z, 0.9 + rnd() * 0.9);
        scenery.add(t);
        swayers.push({ g: t, phase: rnd() * Math.PI * 2, amp: 0.02 + rnd() * 0.03 });
      }
      // Cover close to the verge, where trees are kept clear of the pads.
      for (let k = 0; k < 3; k++) {
        const off = (2.8 + rnd() * 6) * (rnd() < 0.5 ? -1 : 1);
        const jit = (rnd() - 0.5) * SPACING;
        scenery.add(
          undergrowth(base.x + SIDE.x * off + FWD.x * jit, base.z + SIDE.z * off + FWD.z * jit),
        );
      }
    }
    /*
     * The alphabet ruins are the landmark that makes the road somewhere rather
     * than anywhere. One prop parked at level 2 was invisible by level 4, so
     * they recur: a monument every dozen levels or so, alternating verges,
     * each sunk to its own depth. Whatever you have climbed, one is in view.
     */
    for (let n = 0; n < 4; n++) {
      const at = 3 + n * 12;
      const side = n % 2 === 0 ? -1 : 1;
      const anchor = nodePosition(at);
      const r = ruin();
      r.position.set(anchor.x + SIDE.x * 17 * side, 0, anchor.z + SIDE.z * 17 * side);
      r.rotation.y = Math.PI * 0.25 + n * 0.7;
      r.scale.setScalar(1.6 + rnd() * 0.5);
      scenery.add(r);
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

  /* --- pointer: tap to choose, drag to look ahead ---------------------- */
  let down: { x: number; y: number; t: number } | null = null;
  let panOffset = 0;
  let panGoal = 0;

  const onDown = (e: PointerEvent) => {
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
  };
  const onMove = (e: PointerEvent) => {
    if (!down) return;
    const dy = e.clientY - down.y;
    // Dragging down walks the camera back along the road, up walks it forward.
    panGoal = THREE.MathUtils.clamp(panOffset - dy * 0.035, -3, 10);
  };
  const onUp = (e: PointerEvent) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.t < 500;
    if (moved < 10 && quick) pick(e.clientX, e.clientY);
    else panOffset = panGoal;
    down = null;
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

  /* --- resize ---------------------------------------------------------- */
  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    const aspect = w / h;
    camera.left = -VIEW * aspect;
    camera.right = VIEW * aspect;
    camera.top = VIEW;
    camera.bottom = -VIEW;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
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

    // Camera: sit between the pencil and the level ahead, plus whatever the
    // finger has dragged.
    const shown = focusIndex + panOffset;
    // Look a couple of levels PAST the focus: that pushes the pad you are on
    // into the lower third and leaves the road climbing away above it, which is
    // the whole point of the perspective.
    const look = nodePosition(shown + 0.8);
    camGoal.set(look.x, look.y + 1.2, look.z);
    camTarget.lerp(camGoal, opts.reducedMotion ? 1 : 1 - Math.pow(0.002, dt));
    panOffset += (panGoal - panOffset) * (opts.reducedMotion ? 1 : Math.min(1, dt * 6));
    placeCamera();
    sun.target.position.copy(camTarget);
    sun.position.copy(camTarget).add(new THREE.Vector3(14, 26, 10));

    // The hop: a parabola with a squash on landing. This is the whole
    // "you moved forward" feedback, so it is worth the twelve lines.
    const PSCALE = 1.85;
    if (hop) {
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
    blob.position.set(player.position.x, nodePosition(playerIndex).y + 1.58, player.position.z);

    if (!opts.reducedMotion) {
      for (const s of swayers) {
        s.g.rotation.z = Math.sin(t * 1.1 + s.phase) * s.amp;
      }
      for (const p of pads) {
        if (p.ring) {
          const k = 1 + Math.sin(t * 3) * 0.08;
          p.ring.scale.set(k, k, 1);
          (p.ring.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(t * 3) * 0.3;
        }
        if (p.node.isNext) {
          p.top.position.y = 1.3 + Math.sin(t * 2.2) * 0.07;
          const mark = p.group.getObjectByName("chevron");
          if (mark) {
            mark.position.y = 8.4 + Math.sin(t * 2.6) * 0.38;
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
      focusIndex = focus;
      if (!built) {
        built = true;
        road = buildRoad(Math.max(next.length, 46));
        scene.add(road);
        buildScenery();
        camTarget.copy(nodePosition(focus + 0.8));
        placeCamera();
        resize();
        frame();
      }
      refreshPads();
      if (playerIndex !== player) {
        if (opts.reducedMotion) playerIndex = player;
        else hop = { from: playerIndex, to: player, t: 0 };
        playerIndex = player;
      }
    },

    /** Move the spotlight — used when a child taps a different pad. */
    focus(index: number) {
      focusIndex = index;
      panOffset = 0;
      panGoal = 0;
      refreshPads();
      if (!opts.reducedMotion) hop = { from: playerIndex, to: index, t: 0 };
      playerIndex = index;
    },

    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
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
