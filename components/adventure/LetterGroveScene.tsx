"use client";

import { useEffect, useRef, useState } from "react";
import type {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  Group,
  Material,
  Mesh,
  Object3D,
  Texture,
} from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GameEvent } from "@/lib/game-events";
import { LETTER_GROVE_SLICE } from "@/lib/game-world";
import type { LetterGroveSceneCue } from "@/lib/letter-grove-cutscene";

type SceneMode = "loading" | "webgl" | "flat";

interface LetterGroveSceneProps {
  chargedRunes: number;
  complete: boolean;
  event: GameEvent | null;
  cinematicCue?: LetterGroveSceneCue | null;
  forceFlat?: boolean;
}

const ASSET_URLS = {
  hero: "/models/letter-grove/hero/adventurer.glb",
  creature: "/models/letter-grove/creature/pop-blob.glb",
  bridge: "/models/letter-grove/nature/bridge_stoneRound.glb",
  bush: "/models/letter-grove/nature/plant_bushDetailed.glb",
  column: "/models/letter-grove/nature/statue_column.glb",
  damagedColumn: "/models/letter-grove/nature/statue_columnDamaged.glb",
  flowers: "/models/letter-grove/nature/flower_purpleB.glb",
  mushroom: "/models/letter-grove/nature/mushroom_redGroup.glb",
  pedestal: "/models/letter-grove/nature/path_stoneCircle.glb",
  platform: "/models/letter-grove/nature/platform_stone.glb",
  rock: "/models/letter-grove/nature/rock_largeB.glb",
  stump: "/models/letter-grove/nature/stump_roundDetailed.glb",
  treeOak: "/models/letter-grove/nature/tree_oak.glb",
  treePine: "/models/letter-grove/nature/tree_pineRoundA.glb",
  treeRound: "/models/letter-grove/nature/tree_default.glb",
} as const;

type AssetKey = keyof typeof ASSET_URLS;

interface LiveSceneState {
  chargedRunes: number;
  complete: boolean;
  event: GameEvent | null;
  eventVersion: number;
  cinematicCue: LetterGroveSceneCue | null;
  cinematicCueVersion: number;
}

function disposeMaterial(material: Material) {
  for (const value of Object.values(material)) {
    if (value && typeof value === "object" && "isTexture" in value) {
      (value as Texture).dispose();
    }
  }
  material.dispose();
}

function prepareAsset(root: Object3D) {
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
}

function findClip(clips: AnimationClip[], suffix: string) {
  const lowerSuffix = suffix.toLowerCase();
  return clips.find((clip) => clip.name.toLowerCase().endsWith(lowerSuffix));
}

/**
 * The lesson owns grading; this scene only turns typed game events into
 * animation, light, fog, and spell feedback. It can fail without blocking a
 * single learning control because all interaction remains in the DOM below.
 */
export function LetterGroveScene({
  chargedRunes,
  complete,
  event,
  cinematicCue = null,
  forceFlat = false,
}: LetterGroveSceneProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const liveState = useRef<LiveSceneState>({
    chargedRunes,
    complete,
    event,
    eventVersion: event ? 1 : 0,
    cinematicCue,
    cinematicCueVersion: cinematicCue ? 1 : 0,
  });
  const [mode, setMode] = useState<SceneMode>(forceFlat ? "flat" : "loading");

  useEffect(() => {
    const previous = liveState.current;
    liveState.current = {
      chargedRunes,
      complete,
      event,
      eventVersion: previous.eventVersion + (event !== previous.event ? 1 : 0),
      cinematicCue,
      cinematicCueVersion:
        previous.cinematicCueVersion + (cinematicCue !== previous.cinematicCue ? 1 : 0),
    };
  }, [chargedRunes, complete, event, cinematicCue]);

  useEffect(() => {
    if (forceFlat) {
      setMode("flat");
      return;
    }

    const element = host.current;
    if (!element) return;

    let disposed = false;
    let disposeScene = () => {};

    void Promise.all([
      import("three"),
      import("three/examples/jsm/loaders/GLTFLoader.js"),
    ])
      .then(async ([THREE, { GLTFLoader }]) => {
        if (disposed) return;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color("#72b6ad");
        scene.fog = new THREE.FogExp2("#a8ccc1", 0.026);

        const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 70);
        camera.position.set(0, 5.15, 11.8);
        camera.lookAt(0, 1.35, -0.8);

        const renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.16;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.domElement.setAttribute("aria-hidden", "true");
        renderer.domElement.className = "h-full w-full";
        element.appendChild(renderer.domElement);

        scene.add(new THREE.HemisphereLight(0xfff4d0, 0x31594e, 2.6));

        const sunlight = new THREE.DirectionalLight(0xffe8b8, 4.4);
        sunlight.position.set(-5.5, 10, 6.5);
        sunlight.castShadow = true;
        sunlight.shadow.mapSize.set(1024, 1024);
        sunlight.shadow.camera.left = -10;
        sunlight.shadow.camera.right = 10;
        sunlight.shadow.camera.top = 10;
        sunlight.shadow.camera.bottom = -8;
        sunlight.shadow.bias = -0.0005;
        scene.add(sunlight);

        const rimLight = new THREE.DirectionalLight(0x8d72ff, 2.2);
        rimLight.position.set(7, 5, -7);
        scene.add(rimLight);

        const ground = new THREE.Mesh(
          new THREE.PlaneGeometry(26, 22),
          new THREE.MeshStandardMaterial({ color: 0x477a54, roughness: 0.96 }),
        );
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.08;
        ground.receiveShadow = true;
        scene.add(ground);

        const clearing = new THREE.Mesh(
          new THREE.CircleGeometry(7.2, 64),
          new THREE.MeshStandardMaterial({ color: 0x75a866, roughness: 0.94 }),
        );
        clearing.rotation.x = -Math.PI / 2;
        clearing.position.set(0, -0.055, 0.1);
        clearing.receiveShadow = true;
        scene.add(clearing);

        const stream = new THREE.Mesh(
          new THREE.PlaneGeometry(20, 1.5),
          new THREE.MeshStandardMaterial({
            color: 0x4fa5b4,
            emissive: 0x123b55,
            emissiveIntensity: 0.32,
            metalness: 0.08,
            roughness: 0.25,
          }),
        );
        stream.rotation.x = -Math.PI / 2;
        stream.position.set(0, -0.025, 1.2);
        scene.add(stream);

        const pathShape = new THREE.Shape();
        pathShape.moveTo(-1.8, 7.8);
        pathShape.bezierCurveTo(-1.5, 4.6, -0.8, 2.9, -1, 0.9);
        pathShape.bezierCurveTo(-1.15, -1.1, -0.8, -3.8, -0.58, -6.8);
        pathShape.lineTo(0.72, -6.8);
        pathShape.bezierCurveTo(0.55, -3.5, 0.8, -1.3, 0.68, 0.8);
        pathShape.bezierCurveTo(0.58, 3.1, 1.45, 5.2, 1.75, 7.8);
        pathShape.closePath();
        const path = new THREE.Mesh(
          new THREE.ShapeGeometry(pathShape, 18),
          new THREE.MeshStandardMaterial({
            color: 0xc7aa70,
            roughness: 1,
            side: THREE.DoubleSide,
          }),
        );
        path.rotation.x = -Math.PI / 2;
        path.position.set(0, -0.01, 0.65);
        path.receiveShadow = true;
        scene.add(path);

        const loader = new GLTFLoader();
        const entries = await Promise.all(
          (Object.entries(ASSET_URLS) as [AssetKey, string][]).map(async ([key, url]) => {
            const gltf = await loader.loadAsync(url);
            prepareAsset(gltf.scene);
            return [key, gltf] as const;
          }),
        );
        const assets = Object.fromEntries(entries) as Record<AssetKey, GLTF>;

        if (disposed) {
          Object.values(assets).forEach((gltf) => {
            gltf.scene.traverse((object) => {
              const mesh = object as Mesh;
              if (!mesh.isMesh) return;
              mesh.geometry.dispose();
              if (Array.isArray(mesh.material)) mesh.material.forEach(disposeMaterial);
              else disposeMaterial(mesh.material);
            });
          });
          renderer.dispose();
          renderer.domElement.remove();
          return;
        }

        const fitAsset = (
          gltf: GLTF,
          targetHeight: number,
          position: [number, number, number],
          rotationY = 0,
          clone = true,
        ) => {
          // Static props are safe to clone. Animated skinned meshes must keep
          // their original skeleton hierarchy (or use SkeletonUtils.clone),
          // and this slice only needs one instance of each character.
          const source = clone ? gltf.scene.clone(true) : gltf.scene;
          const sourceBox = new THREE.Box3().setFromObject(source);
          const sourceSize = sourceBox.getSize(new THREE.Vector3());
          const scale = targetHeight / Math.max(sourceSize.y, 0.001);
          source.scale.multiplyScalar(scale);

          const scaledBox = new THREE.Box3().setFromObject(source);
          const center = scaledBox.getCenter(new THREE.Vector3());
          source.position.set(-center.x, -scaledBox.min.y, -center.z);

          const wrapper = new THREE.Group();
          wrapper.add(source);
          wrapper.position.set(...position);
          wrapper.rotation.y = rotationY;
          scene.add(wrapper);
          return wrapper;
        };

        const hero = fitAsset(assets.hero, 3.45, [-2.65, 0, 1.35], 0.2, false);
        const creature = fitAsset(assets.creature, 2.25, [2.45, 0, 0.15], -0.2, false);

        const environment: Array<
          [AssetKey, number, [number, number, number], number]
        > = [
          ["treeOak", 4.8, [-5.25, 0, -2.8], 0.25],
          ["treePine", 5.15, [-3.9, 0, -5.7], -0.2],
          ["treeRound", 4.0, [-5.9, 0, 1.9], 0.4],
          ["treePine", 4.25, [-6.1, 0, 5.2], 0.2],
          ["treeOak", 4.85, [5.25, 0, -3.1], -0.35],
          ["treeRound", 4.05, [5.9, 0, 1.8], 0.15],
          ["treePine", 5.05, [3.9, 0, -5.8], 0.32],
          ["treeOak", 4.2, [6.15, 0, 5.2], -0.55],
          ["treeRound", 3.55, [-2.15, 0, -6.8], 0.2],
          ["treeRound", 3.65, [2.3, 0, -6.9], -0.25],
          ["bush", 1.2, [-4.1, 0, -1.2], 0.4],
          ["bush", 0.95, [-4.6, 0, 2.6], -0.2],
          ["bush", 1.2, [4.6, 0, 2.1], 0.6],
          ["bush", 0.9, [3.9, 0, -2.5], -0.5],
          ["rock", 0.9, [-3.95, 0, 3.35], -0.2],
          ["rock", 0.7, [4.05, 0, 3.45], 0.8],
          ["rock", 0.75, [3.95, 0, -1.7], -0.3],
          ["flowers", 0.62, [-3.75, 0, 0.2], 0.2],
          ["flowers", 0.5, [3.75, 0, 2.7], -0.7],
          ["flowers", 0.58, [-1.8, 0, -2.45], 0.25],
          ["mushroom", 0.72, [4.65, 0, -0.85], -0.1],
          ["stump", 1.05, [-4.5, 0, 4.2], 0.35],
          ["bridge", 0.48, [-0.15, 0, 1.2], Math.PI / 2],
          ["platform", 0.52, [0, 0, -4.55], 0],
          ["column", 3.2, [-2.0, 0, -4.65], 0.12],
          ["damagedColumn", 2.7, [2.0, 0, -4.55], -0.2],
        ];
        environment.forEach(([key, height, position, rotation]) => {
          fitAsset(assets[key], height, position, rotation);
        });

        const portalGroup = new THREE.Group();
        portalGroup.position.set(0, 1.75, -4.58);
        const portalSurfaceMaterial = new THREE.MeshBasicMaterial({
          color: 0x6c5ce7,
          transparent: true,
          opacity: 0.22,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const portalSurface = new THREE.Mesh(
          new THREE.CircleGeometry(1.02, 48),
          portalSurfaceMaterial,
        );
        const portalRingMaterial = new THREE.MeshStandardMaterial({
          color: 0xa88bf2,
          emissive: 0x5330c9,
          emissiveIntensity: 1.3,
          roughness: 0.3,
        });
        const portalRing = new THREE.Mesh(
          new THREE.TorusGeometry(1.12, 0.13, 14, 48),
          portalRingMaterial,
        );
        portalRing.castShadow = true;
        portalGroup.add(portalSurface, portalRing);
        scene.add(portalGroup);

        const portalLight = new THREE.PointLight(0x9875ff, 1.8, 8, 2);
        portalLight.position.set(0, 1.8, -3.95);
        scene.add(portalLight);

        const runeMaterials: InstanceType<typeof THREE.MeshStandardMaterial>[] = [];
        const runeLights: InstanceType<typeof THREE.PointLight>[] = [];
        const runeCrystals: InstanceType<typeof THREE.Mesh>[] = [];
        const runeGroup = new THREE.Group();
        const runeXs = [-1.25, 0, 1.25];
        runeXs.forEach((x, index) => {
          const pedestal = fitAsset(assets.pedestal, 0.28, [x, 0, 2.75], index * 0.45);
          runeGroup.add(pedestal);

          const material = new THREE.MeshStandardMaterial({
            color: 0x475569,
            emissive: 0x1e293b,
            emissiveIntensity: 0.12,
            metalness: 0.18,
            roughness: 0.3,
          });
          const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), material);
          crystal.position.set(x, 0.64, 2.75);
          crystal.rotation.z = Math.PI / 4;
          crystal.castShadow = true;
          runeMaterials.push(material);
          runeCrystals.push(crystal);
          scene.add(crystal);

          const light = new THREE.PointLight(0xb99aff, 0, 3.2, 2);
          light.position.set(x, 0.72, 2.75);
          runeLights.push(light);
          scene.add(light);
        });
        scene.add(runeGroup);

        const wand = new THREE.Group();
        const wandStem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.055, 0.085, 1.3, 10),
          new THREE.MeshStandardMaterial({ color: 0x4f2d6e, roughness: 0.48 }),
        );
        wandStem.rotation.z = -0.52;
        const wandGemMaterial = new THREE.MeshStandardMaterial({
          color: 0xd2b6ff,
          emissive: 0x8f5de8,
          emissiveIntensity: 2.5,
          metalness: 0.1,
          roughness: 0.2,
        });
        const wandGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.23, 0), wandGemMaterial);
        wandGem.position.set(0.34, 0.55, 0);
        wand.add(wandStem, wandGem);
        wand.position.set(-1.7, 2.05, 1.05);
        wand.visible = false;
        scene.add(wand);

        const spellGroup = new THREE.Group();
        const spellMaterial = new THREE.MeshBasicMaterial({
          color: 0xffee8a,
          transparent: true,
          opacity: 0,
        });
        const spellCore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.19, 1), spellMaterial);
        const spellHalo = new THREE.Mesh(
          new THREE.TorusGeometry(0.32, 0.035, 8, 24),
          new THREE.MeshBasicMaterial({
            color: 0xd7bdff,
            transparent: true,
            opacity: 0,
            depthWrite: false,
          }),
        );
        spellHalo.rotation.x = Math.PI / 2;
        const spellLight = new THREE.PointLight(0xffe78c, 0, 4, 2);
        spellGroup.add(spellCore, spellHalo, spellLight);
        spellGroup.visible = false;
        scene.add(spellGroup);

        const impactMaterial = new THREE.MeshBasicMaterial({
          color: 0xe6d0ff,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const impact = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.055, 8, 32), impactMaterial);
        impact.position.set(1.85, 1.2, 0.05);
        impact.visible = false;
        scene.add(impact);

        const fireflies = new THREE.Group();
        const fireflyMaterial = new THREE.MeshBasicMaterial({ color: 0xffe99e });
        for (let index = 0; index < 18; index += 1) {
          const firefly = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), fireflyMaterial);
          const angle = index * 2.39;
          const radius = 2.8 + (index % 5) * 0.63;
          firefly.position.set(
            Math.cos(angle) * radius,
            0.7 + (index % 6) * 0.38,
            Math.sin(angle) * radius - 0.8,
          );
          fireflies.add(firefly);
        }
        scene.add(fireflies);

        const heroMixer = new THREE.AnimationMixer(hero);
        const creatureMixer = new THREE.AnimationMixer(creature);
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        let heroAction: AnimationAction | null = null;
        let creatureAction: AnimationAction | null = null;
        let heroResumeAt = -1;
        let creatureResumeAt = -1;
        let celebrating = false;

        const playAction = (
          mixer: AnimationMixer,
          clips: AnimationClip[],
          suffix: string,
          previous: AnimationAction | null,
          once = false,
          duration?: number,
        ) => {
          const clip = findClip(clips, suffix);
          if (!clip) return previous;
          const next = mixer.clipAction(clip);
          if (previous && previous !== next) previous.fadeOut(0.12);
          next.reset().setEffectiveWeight(1).fadeIn(0.12);
          next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
          next.clampWhenFinished = once;
          if (duration) next.setDuration(duration);
          next.play();
          return next;
        };

        if (!reduceMotion) {
          heroAction = playAction(heroMixer, assets.hero.animations, "Idle", null);
          creatureAction = playAction(creatureMixer, assets.creature.animations, "Idle", null);
        }

        const spellCurve = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(-1.65, 2.3, 1.15),
          new THREE.Vector3(0.25, 4.25, 0.45),
          new THREE.Vector3(1.85, 1.25, 0.05),
        );
        const spellPosition = new THREE.Vector3();
        let animationFrame = 0;
        let lastFrameAt = performance.now();
        let lastEventVersion = liveState.current.eventVersion;
        let lastCinematicCueVersion = liveState.current.cinematicCueVersion;
        let castStartedAt = -10;
        const startedAt = performance.now();

        const baseCameraPosition = new THREE.Vector3(0, 5.15, 11.8);
        const baseCameraTarget = new THREE.Vector3(0, 1.35, -0.8);
        const cameraLookTarget = baseCameraTarget.clone();

        const cinematicPose = (cue: LetterGroveSceneCue | null) => {
          if (!cue) {
            return { position: baseCameraPosition, target: baseCameraTarget };
          }
          const mobilePullback = Math.max(0, 1.25 - camera.aspect) * 7.5;
          switch (cue) {
            case "grove-arrival":
              return {
                position: new THREE.Vector3(0, 6.3, 15.2 + mobilePullback),
                target: new THREE.Vector3(0, 1.45, -1.15),
              };
            case "meet-pop":
              return {
                position: new THREE.Vector3(4.1, 3.55, 8.2 + mobilePullback * 0.8),
                target: new THREE.Vector3(2.35, 1.05, 0.05),
              };
            case "fog-threat":
              return {
                position: new THREE.Vector3(0, 5.25, 12.2 + mobilePullback),
                target: new THREE.Vector3(0, 1.75, -4.45),
              };
            case "rune-lesson":
              return {
                position: new THREE.Vector3(0, 3.65, 9.3 + mobilePullback),
                target: new THREE.Vector3(0, 0.72, 2.45),
              };
            case "quest-promise":
              return {
                position: new THREE.Vector3(-3.25, 4.45, 10.3 + mobilePullback),
                target: new THREE.Vector3(-0.35, 1.25, 0),
              };
          }
        };

        const resize = () => {
          const width = Math.max(1, element.clientWidth);
          const height = Math.max(1, element.clientHeight);
          const aspect = width / height;
          renderer.setSize(width, height, false);
          camera.aspect = aspect;
          if (aspect < 0.72) {
            baseCameraPosition.set(0, 6.1, 18.2);
          } else if (aspect < 1.25) {
            baseCameraPosition.set(0, 5.7, 15.4);
          } else if (aspect < 1.75) {
            baseCameraPosition.set(0, 5.35, 13.5);
          } else {
            baseCameraPosition.set(0, 5.15, 11.8);
          }
          if (!liveState.current.cinematicCue) {
            camera.position.copy(baseCameraPosition);
            cameraLookTarget.copy(baseCameraTarget);
            camera.lookAt(cameraLookTarget);
          }
          camera.updateProjectionMatrix();
        };
        resize();
        const observer = new ResizeObserver(resize);
        observer.observe(element);

        const animate = (now: number) => {
          animationFrame = requestAnimationFrame(animate);
          const seconds = (now - startedAt) / 1000;
          const delta = Math.min(0.05, (now - lastFrameAt) / 1000);
          lastFrameAt = now;
          const state = liveState.current;

          const pose = cinematicPose(state.cinematicCue);
          const cameraEase = reduceMotion ? 1 : 1 - Math.exp(-delta * 2.8);
          camera.position.lerp(pose.position, cameraEase);
          cameraLookTarget.lerp(pose.target, cameraEase);
          camera.lookAt(cameraLookTarget);

          if (state.cinematicCueVersion !== lastCinematicCueVersion) {
            lastCinematicCueVersion = state.cinematicCueVersion;
            if (!reduceMotion) {
              if (state.cinematicCue === "meet-pop") {
                creatureAction = playAction(
                  creatureMixer,
                  assets.creature.animations,
                  "Yes",
                  creatureAction,
                  true,
                  1.15,
                );
                creatureResumeAt = seconds + 1.25;
              } else if (state.cinematicCue === "rune-lesson") {
                heroAction = playAction(
                  heroMixer,
                  assets.hero.animations,
                  "Interact",
                  heroAction,
                  true,
                  1.2,
                );
                heroResumeAt = seconds + 1.3;
              } else if (state.cinematicCue === "quest-promise") {
                heroAction = playAction(
                  heroMixer,
                  assets.hero.animations,
                  "Wave",
                  heroAction,
                  true,
                  1.35,
                );
                heroResumeAt = seconds + 1.45;
              }
            }
          }

          if (state.eventVersion !== lastEventVersion) {
            lastEventVersion = state.eventVersion;
            if (state.event?.type === "answer.correct") {
              castStartedAt = seconds;
              if (!reduceMotion) {
                heroAction = playAction(
                  heroMixer,
                  assets.hero.animations,
                  "Interact",
                  heroAction,
                  true,
                  0.72,
                );
                creatureAction = playAction(
                  creatureMixer,
                  assets.creature.animations,
                  "Yes",
                  creatureAction,
                  true,
                  0.72,
                );
                heroResumeAt = seconds + 0.78;
                creatureResumeAt = seconds + 0.78;
              }
            } else if (state.event?.type === "answer.incorrect" && !reduceMotion) {
              creatureAction = playAction(
                creatureMixer,
                assets.creature.animations,
                "No",
                creatureAction,
                true,
                0.62,
              );
              creatureResumeAt = seconds + 0.68;
            } else if (state.event?.type === "encounter.completed") {
              celebrating = true;
              if (!reduceMotion) {
                heroAction = playAction(
                  heroMixer,
                  assets.hero.animations,
                  "Wave",
                  heroAction,
                  true,
                  1.15,
                );
                creatureAction = playAction(
                  creatureMixer,
                  assets.creature.animations,
                  "Dance",
                  creatureAction,
                );
                heroResumeAt = seconds + 1.22;
                creatureResumeAt = Number.POSITIVE_INFINITY;
              }
            }
          }

          if (!reduceMotion) {
            if (heroResumeAt > 0 && seconds >= heroResumeAt) {
              heroAction = playAction(heroMixer, assets.hero.animations, "Idle", heroAction);
              heroResumeAt = -1;
            }
            if (!celebrating && creatureResumeAt > 0 && seconds >= creatureResumeAt) {
              creatureAction = playAction(
                creatureMixer,
                assets.creature.animations,
                "Idle",
                creatureAction,
              );
              creatureResumeAt = -1;
            }
            heroMixer.update(delta);
            creatureMixer.update(delta);
          }

          runeMaterials.forEach((material, index) => {
            const charged = index < state.chargedRunes;
            material.color.set(charged ? 0xb79aff : 0x475569);
            material.emissive.set(charged ? 0x7651e8 : 0x1e293b);
            material.emissiveIntensity = charged ? 2.1 : 0.12;
            runeLights[index]!.intensity = charged ? 2.7 : 0;
          });

          if (scene.fog instanceof THREE.FogExp2) {
            scene.fog.density = Math.max(0.006, 0.026 - state.chargedRunes * 0.0065);
          }
          portalRingMaterial.emissiveIntensity = 0.8 + state.chargedRunes * 0.65;
          portalSurfaceMaterial.opacity = 0.16 + state.chargedRunes * 0.11;
          portalLight.intensity = 1.2 + state.chargedRunes * 0.75;
          wand.visible = state.complete;

          const castDuration = reduceMotion ? 0.18 : 0.62;
          const castAge = seconds - castStartedAt;
          const castProgress = Math.min(1, Math.max(0, castAge / castDuration));
          const spellActive = castAge >= 0 && castAge < castDuration + 0.2;
          spellGroup.visible = spellActive;
          if (spellActive) {
            spellCurve.getPoint(castProgress, spellPosition);
            spellGroup.position.copy(spellPosition);
            spellGroup.scale.setScalar(0.75 + Math.sin(castProgress * Math.PI) * 0.7);
            spellMaterial.opacity = 1 - castProgress * 0.35;
            (spellHalo.material as InstanceType<typeof THREE.MeshBasicMaterial>).opacity =
              0.8 - castProgress * 0.35;
            spellLight.intensity = 3.8 * (1 - castProgress * 0.55);
          }

          const impactAge = castAge - castDuration;
          impact.visible = impactAge >= 0 && impactAge < 0.28;
          if (impact.visible) {
            const impactProgress = impactAge / 0.28;
            impact.scale.setScalar(0.45 + impactProgress * 2.4);
            impactMaterial.opacity = 1 - impactProgress;
          }

          if (!reduceMotion) {
            portalGroup.rotation.z = Math.sin(seconds * 0.7) * 0.04;
            portalSurfaceMaterial.opacity += Math.sin(seconds * 2.1) * 0.018;
            runeCrystals.forEach((crystal, index) => {
              if (index < state.chargedRunes) {
                crystal.position.y = 0.64 + Math.sin(seconds * 2.4 + index) * 0.05;
                crystal.rotation.y = seconds * 1.25 + index;
              }
            });
            fireflies.children.forEach((firefly, index) => {
              firefly.position.y += Math.sin(seconds * 1.1 + index) * 0.0008;
            });
            spellHalo.rotation.z = seconds * 5.5;
            if (wand.visible) {
              wand.position.y = 2.05 + Math.sin(seconds * 2.2) * 0.1;
              wandGem.rotation.y = seconds * 2.7;
            }
          }

          renderer.render(scene, camera);
        };
        animationFrame = requestAnimationFrame(animate);
        setMode("webgl");

        disposeScene = () => {
          cancelAnimationFrame(animationFrame);
          observer.disconnect();
          heroMixer.stopAllAction();
          creatureMixer.stopAllAction();
          scene.traverse((object) => {
            const mesh = object as Mesh;
            if (!mesh.isMesh) return;
            mesh.geometry.dispose();
            if (Array.isArray(mesh.material)) mesh.material.forEach(disposeMaterial);
            else disposeMaterial(mesh.material);
          });
          renderer.dispose();
          renderer.domElement.remove();
        };
      })
      .catch((error: unknown) => {
        console.warn("Letter Grove 3D scene could not start; using the playable fallback.", error);
        if (!disposed) setMode("flat");
      });

    return () => {
      disposed = true;
      disposeScene();
    };
  }, [forceFlat]);

  const fogOpacity = complete ? 0 : Math.max(0.02, 0.28 - chargedRunes * 0.08);

  return (
    <section
      className="absolute inset-0 overflow-hidden bg-[#72b6ad]"
      aria-label={`חורשת האותיות. ${chargedRunes} מתוך ${LETTER_GROVE_SLICE.questionCount} רונות טעונות.`}
    >
      <div ref={host} className={mode === "webgl" ? "h-full w-full" : "hidden"} />

      {mode !== "webgl" ? (
        <div className="absolute inset-0 grid place-items-center overflow-hidden bg-[linear-gradient(#8fcac1_0_58%,#58885c_58%)]">
          <div className="absolute inset-x-[10%] bottom-[17%] h-20 rounded-[50%] bg-[#78a96d] shadow-[0_-14px_60px_#b8d49b]" aria-hidden />
          <div className="absolute left-[16%] top-[28%] grid h-28 w-20 place-items-center rounded-[48%_48%_38%_38%] bg-[#7657bb] text-5xl shadow-xl" aria-hidden>
            🧙
          </div>
          <div className="absolute right-[17%] top-[31%] grid h-24 w-28 place-items-center rounded-[48%] bg-[#7dbb49] text-5xl shadow-xl" aria-hidden>
            {complete ? "✨" : "•‿•"}
          </div>
          <div className="absolute top-[52%] flex gap-3" aria-hidden>
            {Array.from({ length: LETTER_GROVE_SLICE.questionCount }, (_, index) => (
              <span
                key={index}
                className={`h-9 w-9 rotate-45 rounded-md border-4 ${
                  index < chargedRunes
                    ? "border-[#f4e8ff] bg-[#9e74ef] shadow-[0_0_24px_#d0b7ff]"
                    : "border-white/55 bg-slate-600/70"
                }`}
              />
            ))}
          </div>
          <span className="absolute top-24 rounded-full bg-[#132d32]/75 px-4 py-2 text-sm font-black text-white backdrop-blur-sm">
            {mode === "loading" ? "טוענים את החורשה…" : "מצב ציור קל · המשחק המלא פעיל"}
          </span>
        </div>
      ) : null}

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_52%_50%,transparent_16%,#dbe4e7_84%)] transition-opacity duration-500"
        style={{ opacity: fogOpacity }}
      />

      <p className="sr-only" aria-live="polite">
        {complete
          ? "הערפל התפזר והשרביט הופיע"
          : `נטענו ${chargedRunes} מתוך ${LETTER_GROVE_SLICE.questionCount} רונות`}
      </p>
    </section>
  );
}
