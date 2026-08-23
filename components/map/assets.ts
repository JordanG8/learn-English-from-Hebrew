/**
 * IMPORTED MODELS — the sixteen CC0 pieces borrowed from Kenney's Nature Kit
 * and Fantasy Town Kit, and the loader that turns them into scenery.
 *
 * scene.ts used to build every prop by hand, on purpose — the file's own
 * header called that a school-tablet performance decision. It still is one,
 * mostly: this loader keeps that decision's spirit (small, no-texture-where-
 * possible, cached, never blocking) while spending the ~330KB these sixteen
 * files cost to buy real trees, a bridge, a windmill and a market stall
 * instead of hand-built stand-ins for all of them.
 *
 * LICENSE. Every model here is Kenney's own CC0 work — no attribution
 * required, commercial use included. See public/models/CREDITS.md.
 *
 * WHY THESE SIXTEEN AND NOT MORE. Nature Kit's ten are near-free: flat-
 * shaded low-poly meshes with baseColorFactor materials and no image at all,
 * so there is nothing to fetch beyond the geometry — a 15KB tree costs the
 * scene one HTTP request, not a texture atlas. Fantasy Town Kit's six share
 * ONE 11KB colormap.png across all of them, fetched once. Sixteen models,
 * seventeen HTTP requests, ~330KB total: a fraction of the audio the app
 * already ships per lesson.
 *
 * NEVER BLOCKS. `preloadModels()` is fire-and-forget from module load, and
 * `assetsReady()` races it against a short timeout — see scene.ts. A slow
 * connection gets the road on time and the trees a beat later, never the
 * other way around.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export type ModelKey =
  | "treeOak"
  | "treePine"
  | "treePalm"
  | "bridge"
  | "rock"
  | "stump"
  | "mushrooms"
  | "sign"
  | "campfire"
  | "logStack"
  | "windmill"
  | "arch"
  | "lantern"
  | "cart"
  | "fountain"
  | "stall"
  | "pedestal";

const SOURCES: Record<ModelKey, string> = {
  treeOak: "/models/nature/tree_oak.glb",
  treePine: "/models/nature/tree_pineRoundA.glb",
  treePalm: "/models/nature/tree_palmTall.glb",
  bridge: "/models/nature/bridge_wood.glb",
  rock: "/models/nature/rock_largeA.glb",
  stump: "/models/nature/stump_round.glb",
  mushrooms: "/models/nature/mushroom_redGroup.glb",
  sign: "/models/nature/sign.glb",
  campfire: "/models/nature/campfire_stones.glb",
  logStack: "/models/nature/log_stack.glb",
  windmill: "/models/town/windmill.glb",
  arch: "/models/town/wall-arch.glb",
  lantern: "/models/town/lantern.glb",
  cart: "/models/town/cart.glb",
  fountain: "/models/town/fountain-center.glb",
  stall: "/models/town/stall.glb",
  // A real fluted stone column, base and capital included — the number
  // plaque still rides on top of it. See scene.ts's buildPad for why: a
  // hand-built stack of cylinders read as generic no matter how it was
  // tuned, and a real monument shape didn't cost anything extra to load.
  pedestal: "/models/nature/statue_column.glb",
};

/** Loaded once per key, shared as the template every placement clones. */
const templates = new Map<ModelKey, THREE.Object3D>();
let loader: GLTFLoader | null = null;

/**
 * `Object3D.clone(true)` deep-clones the hierarchy but a `Mesh` clone still
 * POINTS AT the source's geometry and material — `getModel()` below hands
 * out many clones of one template on purpose, so every one of them shares
 * these. scene.ts's teardown disposes every geometry and material it finds
 * in the scene graph, which — unguarded — would free a model the NEXT world
 * still needs the moment a child leaves and returns to /map. This set is
 * scene.ts's guard: anything in it survives that sweep, because it belongs
 * to the template, not to any one placement.
 */
export const SHARED_MODEL_RESOURCES = new Set<THREE.BufferGeometry | THREE.Material>();

function prepare(root: THREE.Object3D) {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      // Kenney's kits ship flat-shaded low-poly meshes; MeshStandardMaterial
      // is more than this scene's Lambert-lit look needs and costs more per
      // pixel for nothing gained here — matched to the rest of the scenery.
      const src = o.material as THREE.MeshStandardMaterial;
      o.material = new THREE.MeshLambertMaterial({
        color: src.color ?? new THREE.Color(0xffffff),
        map: src.map ?? null,
        flatShading: true,
      });
      SHARED_MODEL_RESOURCES.add(o.geometry);
      SHARED_MODEL_RESOURCES.add(o.material);
    }
  });
}

async function loadOne(key: ModelKey): Promise<void> {
  loader ??= new GLTFLoader();
  const gltf = await loader.loadAsync(SOURCES[key]);
  const root = gltf.scene;
  prepare(root);
  templates.set(key, root);
}

let readyPromise: Promise<void> | null = null;

/** Kick off every fetch in parallel. Safe to call more than once — the work
 *  happens once and every caller shares the same promise. */
export function preloadModels(): Promise<void> {
  readyPromise ??= Promise.allSettled((Object.keys(SOURCES) as ModelKey[]).map(loadOne)).then(
    () => undefined,
  );
  return readyPromise;
}

/**
 * A model, ready to place — a fresh clone so instances can move
 * independently — or null if it has not finished loading (or failed: a
 * missing model is a bare patch of grass, never a crash).
 *
 * `uniqueMaterials` additionally clones every mesh's material, not just the
 * Object3D hierarchy — `clone(true)` shares materials by default, which is
 * exactly right for a tree or a rock (every instance is the same colour, so
 * sharing is free) and wrong for the pedestal, where each one needs its own
 * colour for its own lock state. Skip it unless a caller is about to mutate
 * `.color` on what comes back — an unshared material is not tracked in
 * SHARED_MODEL_RESOURCES, so it is the caller's pad that owns disposing it.
 */
export function getModel(
  key: ModelKey,
  opts: { uniqueMaterials?: boolean } = {},
): THREE.Object3D | null {
  const t = templates.get(key);
  if (!t) return null;
  const root = t.clone(true);
  if (opts.uniqueMaterials) {
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.material = (o.material as THREE.Material).clone();
    });
  }
  return root;
}
