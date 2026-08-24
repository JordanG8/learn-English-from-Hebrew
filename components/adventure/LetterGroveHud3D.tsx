"use client";

import { useEffect, useRef } from "react";
import type {
  BufferGeometry,
  ColorRepresentation,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  Scene,
  WebGLRenderer,
} from "three";

export type SpellHudReactionKind = "selected" | "correct" | "incorrect";

export interface SpellHudReaction {
  /** The DOM answer slot that caused this reaction. */
  index: number;
  kind: SpellHudReactionKind;
  /** Increment this when the same slot/reaction should animate again. */
  sequence: number;
}

export interface LetterGroveHud3DProps {
  /** The hovered DOM answer index. The canvas itself never handles pointer input. */
  hoveredIndex?: number | null;
  /** The keyboard-focused DOM answer index. */
  focusedIndex?: number | null;
  /** The currently pressed/selected DOM answer index. */
  selectedIndex?: number | null;
  /** Optional gentle hint emitted by the accessible DOM exercise. */
  assistedIndex?: number | null;
  /** A retriggerable answer reaction. */
  reaction?: SpellHudReaction | null;
  /** Number of charged energy runes, clamped to 0–3. */
  chargedRunes: number;
  disabled?: boolean;
  layout?: "auto" | "row" | "grid";
  accentColors?: readonly ColorRepresentation[];
  className?: string;
  onCanvasAvailabilityChange?: (available: boolean) => void;
}

interface HudSnapshot {
  hoveredIndex: number | null;
  focusedIndex: number | null;
  selectedIndex: number | null;
  assistedIndex: number | null;
  reaction: SpellHudReaction | null;
  chargedRunes: number;
  disabled: boolean;
  layout: NonNullable<LetterGroveHud3DProps["layout"]>;
  accentColors: readonly ColorRepresentation[];
}

interface TokenVisual {
  root: Group;
  plate: Mesh;
  crystal: Mesh;
  halo: Mesh;
  sparks: Mesh[];
  plateMaterial: MeshStandardMaterial;
  crystalMaterial: MeshStandardMaterial;
  haloMaterial: MeshBasicMaterial;
  accent: ColorRepresentation;
}

interface EnergyVisual {
  root: Group;
  crystal: Mesh;
  crystalMaterial: MeshStandardMaterial;
  haloMaterial: MeshBasicMaterial;
}

interface HudRuntime {
  update(snapshot: HudSnapshot): void;
  dispose(): void;
}

const DEFAULT_ACCENTS = ["#a886ff", "#6ad7ff", "#ff9fbe", "#ffc864"] as const;
const SLOT_COUNT = 4;
const ENERGY_RUNE_COUNT = 3;

function normalizeIndex(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isInteger(value)) return null;
  return value >= 0 && value < SLOT_COUNT ? value : null;
}

function snapshotFromProps(props: LetterGroveHud3DProps): HudSnapshot {
  return {
    hoveredIndex: normalizeIndex(props.hoveredIndex),
    focusedIndex: normalizeIndex(props.focusedIndex),
    selectedIndex: normalizeIndex(props.selectedIndex),
    assistedIndex: normalizeIndex(props.assistedIndex),
    reaction:
      props.reaction && normalizeIndex(props.reaction.index) !== null
        ? props.reaction
        : null,
    chargedRunes: Math.max(0, Math.min(ENERGY_RUNE_COUNT, Math.floor(props.chargedRunes))),
    disabled: props.disabled ?? false,
    layout: props.layout ?? "auto",
    accentColors: props.accentColors ?? DEFAULT_ACCENTS,
  };
}

function disposeObjectTree(root: Object3D) {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();

  root.traverse((object) => {
    const candidate = object as Mesh;
    if (candidate.geometry) geometries.add(candidate.geometry);
    if (Array.isArray(candidate.material)) {
      candidate.material.forEach((material) => materials.add(material));
    } else if (candidate.material) {
      materials.add(candidate.material);
    }
  });

  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

/**
 * A decorative, transparent Three.js layer for four accessible DOM answers.
 * Keep this canvas pointer-transparent and place real buttons over the four slots.
 */
export function LetterGroveHud3D(props: LetterGroveHud3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<HudRuntime | null>(null);
  const snapshotRef = useRef<HudSnapshot>(snapshotFromProps(props));
  const availabilityCallbackRef = useRef(props.onCanvasAvailabilityChange);

  snapshotRef.current = snapshotFromProps(props);
  availabilityCallbackRef.current = props.onCanvasAvailabilityChange;

  useEffect(() => {
    const hostElement = hostRef.current;
    if (!hostElement) return;

    let cancelled = false;
    let runtime: HudRuntime | null = null;

    async function mountHud(mountedHost: HTMLDivElement) {
      try {
        const THREE = await import("three");
        if (cancelled) return;

        let renderer: WebGLRenderer;
        try {
          renderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: true,
            premultipliedAlpha: true,
            powerPreference: "high-performance",
          });
        } catch {
          mountedHost.dataset.canvasState = "unavailable";
          availabilityCallbackRef.current?.(false);
          return;
        }

        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.2;
        renderer.setClearColor(0x000000, 0);

        const canvas = renderer.domElement;
        canvas.setAttribute("aria-hidden", "true");
        Object.assign(canvas.style, {
          display: "block",
          height: "100%",
          inset: "0",
          pointerEvents: "none",
          position: "absolute",
          width: "100%",
        });
        mountedHost.appendChild(canvas);

        const scene: Scene = new THREE.Scene();
        const camera: OrthographicCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
        camera.position.set(0, 0, 6);

        scene.add(new THREE.HemisphereLight(0xc8f4ff, 0x33234f, 2.35));
        const keyLight = new THREE.DirectionalLight(0xffffff, 3.1);
        keyLight.position.set(-2, 4, 5);
        scene.add(keyLight);

        const hudRoot = new THREE.Group();
        scene.add(hudRoot);

        function makeToken(index: number): TokenVisual {
          const root = new THREE.Group();
          hudRoot.add(root);

          const plateMaterial = new THREE.MeshStandardMaterial({
            color: 0x173b49,
            emissive: 0x07151c,
            metalness: 0.58,
            opacity: 0.92,
            roughness: 0.28,
            transparent: true,
          });
          const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.3, 0.085, 40), plateMaterial);
          plate.rotation.x = Math.PI / 2;
          root.add(plate);

          const rim = new THREE.Mesh(
            new THREE.TorusGeometry(0.275, 0.028, 12, 52),
            new THREE.MeshStandardMaterial({
              color: 0xc8f1ff,
              emissive: 0x253c64,
              emissiveIntensity: 1.5,
              metalness: 0.72,
              roughness: 0.18,
            }),
          );
          rim.position.z = 0.065;
          root.add(rim);

          const crystalMaterial = new THREE.MeshStandardMaterial({
            color: DEFAULT_ACCENTS[index],
            emissive: DEFAULT_ACCENTS[index],
            emissiveIntensity: 1.15,
            metalness: 0.16,
            roughness: 0.2,
          });
          const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.135, 0), crystalMaterial);
          crystal.position.z = 0.13;
          crystal.scale.y = 1.18;
          root.add(crystal);

          const haloMaterial = new THREE.MeshBasicMaterial({
            blending: THREE.AdditiveBlending,
            color: DEFAULT_ACCENTS[index],
            depthWrite: false,
            opacity: 0,
            transparent: true,
          });
          const halo = new THREE.Mesh(new THREE.TorusGeometry(0.345, 0.025, 8, 48), haloMaterial);
          halo.position.z = 0.03;
          root.add(halo);

          const sparks = Array.from({ length: 6 }, (_, sparkIndex) => {
            const spark = new THREE.Mesh(
              new THREE.TetrahedronGeometry(0.025, 0),
              new THREE.MeshBasicMaterial({
                blending: THREE.AdditiveBlending,
                color: sparkIndex % 2 === 0 ? 0xffffff : 0xffe49a,
                depthWrite: false,
                transparent: true,
              }),
            );
            spark.visible = false;
            spark.position.z = 0.12;
            root.add(spark);
            return spark;
          });

          return {
            root,
            plate,
            crystal,
            halo,
            sparks,
            plateMaterial,
            crystalMaterial,
            haloMaterial,
            accent: DEFAULT_ACCENTS[index],
          };
        }

        const tokenVisuals = Array.from({ length: SLOT_COUNT }, (_, index) => makeToken(index));

        const energyRoot = new THREE.Group();
        hudRoot.add(energyRoot);

        const connectorMaterial = new THREE.MeshBasicMaterial({
          color: 0x7895a3,
          opacity: 0.5,
          transparent: true,
        });
        for (let index = 0; index < ENERGY_RUNE_COUNT - 1; index += 1) {
          const connector = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.018, 0.018), connectorMaterial);
          connector.position.x = -0.115 + index * 0.23;
          energyRoot.add(connector);
        }

        const energyVisuals: EnergyVisual[] = Array.from({ length: ENERGY_RUNE_COUNT }, (_, index) => {
          const root = new THREE.Group();
          root.position.x = (index - 1) * 0.23;
          energyRoot.add(root);

          const crystalMaterial = new THREE.MeshStandardMaterial({
            color: 0x405767,
            emissive: 0x07151c,
            emissiveIntensity: 0.5,
            metalness: 0.32,
            roughness: 0.25,
          });
          const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0), crystalMaterial);
          crystal.scale.y = 1.18;
          root.add(crystal);

          const haloMaterial = new THREE.MeshBasicMaterial({
            blending: THREE.AdditiveBlending,
            color: 0xc7a8ff,
            depthWrite: false,
            opacity: 0,
            transparent: true,
          });
          const halo = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.012, 8, 32), haloMaterial);
          root.add(halo);

          return { root, crystal, crystalMaterial, haloMaterial };
        });

        let snapshot = snapshotRef.current;
        let width = 1;
        let height = 1;
        let reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        let contextLost = false;
        let disposed = false;
        let reactionStartedAt = performance.now();
        let reactionIdentity = snapshot.reaction
          ? `${snapshot.reaction.sequence}:${snapshot.reaction.index}:${snapshot.reaction.kind}`
          : "none";

        function placeVisuals() {
          const aspect = width / height;
          camera.left = -aspect;
          camera.right = aspect;
          camera.top = 1;
          camera.bottom = -1;
          camera.updateProjectionMatrix();

          const useGrid = snapshot.layout === "grid" || (snapshot.layout === "auto" && width < 640);
          tokenVisuals.forEach((token, index) => {
            if (useGrid) {
              // The semantic answer grid is RTL: option 1 is the right card.
              token.root.position.set((index % 2 === 0 ? 0.49 : -0.49) * aspect, index < 2 ? 0.2 : -0.54, 0);
              token.root.scale.setScalar(1.25);
            } else {
              token.root.position.set((0.75 - index * 0.5) * aspect, -0.24, 0);
              token.root.scale.setScalar(1.42);
            }
          });
          energyRoot.position.set(0, useGrid ? 0.79 : 0.66, 0.08);
          energyRoot.scale.setScalar(useGrid ? 1.32 : 1.48);
        }

        function resize() {
          const rect = mountedHost.getBoundingClientRect();
          const nextWidth = Math.max(1, Math.round(rect.width));
          const nextHeight = Math.max(1, Math.round(rect.height));
          if (nextWidth === width && nextHeight === height) return;
          width = nextWidth;
          height = nextHeight;
          const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
          renderer.setDrawingBufferSize(width, height, pixelRatio);
          placeVisuals();
        }

        function tokenMode(index: number, reactionAge: number) {
          if (snapshot.disabled) return "disabled" as const;
          const reaction = snapshot.reaction?.index === index ? snapshot.reaction.kind : null;
          const reactionDuration = reaction === "correct" ? 1.15 : reaction === "incorrect" ? 0.72 : 0.42;
          if (reaction && reactionAge <= reactionDuration) return reaction;
          if (snapshot.selectedIndex === index) return "selected" as const;
          if (snapshot.focusedIndex === index) return "focused" as const;
          if (snapshot.hoveredIndex === index) return "hovered" as const;
          if (snapshot.assistedIndex === index) return "assisted" as const;
          return "idle" as const;
        }

        function renderFrame(timeMs: number) {
          if (disposed || contextLost) return;
          resize();
          const time = timeMs * 0.001;
          const reactionAge = Math.max(0, (timeMs - reactionStartedAt) / 1000);

          tokenVisuals.forEach((token, index) => {
            const suppliedAccent = snapshot.accentColors[index] ?? DEFAULT_ACCENTS[index];
            if (token.accent !== suppliedAccent) {
              token.accent = suppliedAccent;
              token.crystalMaterial.color.set(suppliedAccent);
              token.crystalMaterial.emissive.set(suppliedAccent);
              token.haloMaterial.color.set(suppliedAccent);
            }

            const mode = tokenMode(index, reactionAge);
            const animated = !reducedMotion;
            let scale = mode === "focused" || mode === "hovered" || mode === "assisted" ? 1.12 : 1;
            let wobble = 0;

            if (mode === "selected") scale = 1.16;
            if (mode === "correct") {
              const burst = Math.max(0, 1 - reactionAge / 0.9);
              scale = 1.08 + Math.sin(Math.min(reactionAge * 9, Math.PI)) * 0.25;
              token.sparks.forEach((spark, sparkIndex) => {
                const angle = (sparkIndex / token.sparks.length) * Math.PI * 2;
                const distance = 0.2 + (1 - burst) * 0.28;
                spark.visible = !reducedMotion && reactionAge < 0.95;
                spark.position.x = Math.cos(angle) * distance;
                spark.position.y = Math.sin(angle) * distance;
                (spark.material as MeshBasicMaterial).opacity = burst;
              });
            } else {
              token.sparks.forEach((spark) => {
                spark.visible = false;
              });
            }

            if (mode === "incorrect" && animated && reactionAge < 0.65) {
              wobble = Math.sin(reactionAge * 42) * 0.11 * (1 - reactionAge / 0.65);
            }

            const baseScale = token.root.position.y > -0.3
              ? 1.25
              : snapshot.layout === "row" || (snapshot.layout === "auto" && width >= 640)
                ? 1.42
                : 1.25;
            token.root.scale.setScalar(baseScale * scale);
            token.root.rotation.z = wobble;
            token.crystal.rotation.x = animated ? time * 0.72 + index * 0.4 : index * 0.4;
            token.crystal.rotation.y = animated ? time * 1.05 + index * 0.7 : index * 0.7;
            token.plate.rotation.z = mode === "selected" && animated ? time * 0.5 : 0;

            const active = mode !== "idle" && mode !== "disabled";
            token.haloMaterial.opacity =
              mode === "correct"
                ? 0.92
                : mode === "incorrect"
                  ? 0.68
                  : active
                    ? 0.48 + (animated ? Math.sin(time * 5 + index) * 0.12 : 0)
                    : 0.08;
            token.halo.scale.setScalar(active && animated ? 1 + Math.sin(time * 3.5 + index) * 0.05 : 1);
            token.plateMaterial.opacity = mode === "disabled" ? 0.36 : 0.92;
            token.crystalMaterial.opacity = mode === "disabled" ? 0.38 : 1;
            token.crystalMaterial.transparent = mode === "disabled";
            token.crystalMaterial.emissiveIntensity =
              mode === "correct" ? 3.8 : mode === "incorrect" ? 2.3 : active ? 2.1 : 1.15;
            if (mode === "correct") {
              token.crystalMaterial.color.set(0x8cf28c);
              token.crystalMaterial.emissive.set(0x61df78);
            } else if (mode === "incorrect") {
              token.crystalMaterial.color.set(0xff7890);
              token.crystalMaterial.emissive.set(0xff315a);
            } else {
              token.crystalMaterial.color.set(suppliedAccent);
              token.crystalMaterial.emissive.set(suppliedAccent);
            }
          });

          energyVisuals.forEach((energy, index) => {
            const charged = index < snapshot.chargedRunes;
            energy.crystalMaterial.color.set(charged ? 0xd1b8ff : 0x405767);
            energy.crystalMaterial.emissive.set(charged ? 0x9f72ff : 0x07151c);
            energy.crystalMaterial.emissiveIntensity = charged ? 3.2 : 0.5;
            energy.haloMaterial.opacity = charged ? 0.68 + (!reducedMotion ? Math.sin(time * 4 + index) * 0.16 : 0) : 0.05;
            energy.root.scale.setScalar(charged && !reducedMotion ? 1 + Math.sin(time * 5 + index) * 0.07 : 1);
            energy.crystal.rotation.y = !reducedMotion && charged ? time * 1.2 : 0;
          });

          renderer.render(scene, camera);
        }

        function renderOnce() {
          renderFrame(performance.now());
        }

        function applyAnimationPreference() {
          renderer.setAnimationLoop(reducedMotion ? null : renderFrame);
          renderOnce();
        }

        const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        const onMotionPreferenceChange = (event: MediaQueryListEvent) => {
          reducedMotion = event.matches;
          applyAnimationPreference();
        };
        motionQuery.addEventListener("change", onMotionPreferenceChange);

        const resizeObserver = new ResizeObserver(() => {
          resize();
          renderOnce();
        });
        resizeObserver.observe(mountedHost);

        const onContextLost = (event: Event) => {
          event.preventDefault();
          if (disposed) return;
          contextLost = true;
          mountedHost.dataset.canvasState = "unavailable";
          availabilityCallbackRef.current?.(false);
        };
        const onContextRestored = () => {
          if (disposed) return;
          contextLost = false;
          mountedHost.dataset.canvasState = "ready";
          availabilityCallbackRef.current?.(true);
          renderOnce();
        };
        canvas.addEventListener("webglcontextlost", onContextLost);
        canvas.addEventListener("webglcontextrestored", onContextRestored);

        runtime = {
          update(nextSnapshot) {
            const nextReactionIdentity = nextSnapshot.reaction
              ? `${nextSnapshot.reaction.sequence}:${nextSnapshot.reaction.index}:${nextSnapshot.reaction.kind}`
              : "none";
            if (nextReactionIdentity !== reactionIdentity) {
              reactionIdentity = nextReactionIdentity;
              reactionStartedAt = performance.now();
            }
            snapshot = nextSnapshot;
            placeVisuals();
            if (reducedMotion) renderOnce();
          },
          dispose() {
            disposed = true;
            renderer.setAnimationLoop(null);
            resizeObserver.disconnect();
            motionQuery.removeEventListener("change", onMotionPreferenceChange);
            canvas.removeEventListener("webglcontextlost", onContextLost);
            canvas.removeEventListener("webglcontextrestored", onContextRestored);
            disposeObjectTree(scene);
            renderer.dispose();
            renderer.forceContextLoss();
            canvas.remove();
          },
        };

        runtimeRef.current = runtime;
        runtime.update(snapshotRef.current);
        resize();
        applyAnimationPreference();
        mountedHost.dataset.canvasState = "ready";
        availabilityCallbackRef.current?.(true);
      } catch {
        if (!cancelled) {
          mountedHost.dataset.canvasState = "unavailable";
          availabilityCallbackRef.current?.(false);
        }
      }
    }

    void mountHud(hostElement);

    return () => {
      cancelled = true;
      runtime?.dispose();
      if (runtimeRef.current === runtime) runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    runtimeRef.current?.update(snapshotRef.current);
  }, [
    props.hoveredIndex,
    props.focusedIndex,
    props.selectedIndex,
    props.assistedIndex,
    props.reaction,
    props.chargedRunes,
    props.disabled,
    props.layout,
    props.accentColors,
  ]);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className={props.className}
      data-canvas-state="loading"
      data-testid="letter-grove-hud-3d"
      style={{ pointerEvents: "none" }}
    />
  );
}
