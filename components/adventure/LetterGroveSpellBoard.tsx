"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type {
  BufferGeometry,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  OrthographicCamera,
  Scene,
  WebGLRenderer,
} from "three";

export type SpellBoardReactionKind = "casting" | "correct" | "incorrect";

export interface SpellBoardReaction {
  kind: SpellBoardReactionKind;
  /** Increment this value to replay the same reaction. */
  sequence: number;
}

export interface SpellBoardAssist {
  enabled?: boolean;
  /** Override the automatically suggested next rune. */
  nextRuneIndex?: number | null;
  messageHe?: string;
}

export type SpellRecipeVisibility = "hidden" | "slots" | "partial" | "word";

export interface SpellBoardRecipe {
  visibility: SpellRecipeVisibility;
  /** Character positions to expose when visibility is `partial`. Defaults to the first. */
  revealedIndices?: readonly number[];
  labelHe?: string;
}

export interface LetterGroveSpellBoardProps {
  /** Each array entry is one physical rune. Repeated letters need repeated entries. */
  letters: readonly string[];
  targetWord: string;
  /** Controls how much of the answer recipe is visible without changing grading. */
  recipe?: SpellRecipeVisibility | SpellBoardRecipe;
  disabled?: boolean;
  assist?: boolean | SpellBoardAssist;
  reaction?: SpellBoardReaction | null;
  className?: string;
  castLabelHe?: string;
  clearLabelHe?: string;
  onPathChange?: (word: string, runeIndices: readonly number[]) => void;
  onRuneConnect?: (letter: string, runeIndex: number) => void;
  onCast: (word: string, runeIndices: readonly number[]) => void;
  onCanvasAvailabilityChange?: (available: boolean) => void;
}

interface Point {
  x: number;
  y: number;
}

interface PointerSession {
  pointerId: number;
  startX: number;
  startY: number;
  didDrag: boolean;
  initialPath: readonly number[];
}

interface RuneMetric extends Point {
  radius: number;
}

interface SpellVisualSnapshot {
  selectedPath: readonly number[];
  castPath: readonly number[];
  assistedIndex: number | null;
  pointer: Point | null;
  dragging: boolean;
  disabled: boolean;
  reaction: SpellBoardReaction | null;
}

interface SpellBoardRuntime {
  update(snapshot: SpellVisualSnapshot): void;
  dispose(): void;
}

interface RuneVisual {
  root: Group;
  ring: Mesh;
  glow: Mesh;
  ringMaterial: MeshBasicMaterial;
  glowMaterial: MeshBasicMaterial;
}

const CAST_COLORS: Record<SpellBoardReactionKind, number> = {
  casting: 0x77ddff,
  correct: 0x8df59c,
  incorrect: 0xff7f9f,
};

const EMPTY_PATH: readonly number[] = [];

function normalizeRune(letter: string) {
  return letter.trim().toLocaleUpperCase("en-US");
}

function spellFromPath(letters: readonly string[], path: readonly number[]) {
  return path.map((index) => letters[index] ?? "").join("");
}

function runePosition(index: number, total: number): Point {
  if (total <= 1) return { x: 50, y: 50 };

  const runesPerRing = 8;
  const ring = Math.floor(index / runesPerRing);
  const firstIndexInRing = ring * runesPerRing;
  const countInRing = Math.min(runesPerRing, total - firstIndexInRing);
  const indexInRing = index - firstIndexInRing;
  const angle = -Math.PI / 2 + (indexInRing / countInRing) * Math.PI * 2;
  const radiusX = Math.max(17, 40 - ring * 17);
  const radiusY = Math.max(14, 35 - ring * 15);

  return {
    x: 50 + Math.cos(angle) * radiusX,
    y: 50 + Math.sin(angle) * radiusY,
  };
}

function assistedRuneIndex(
  assist: LetterGroveSpellBoardProps["assist"],
  letters: readonly string[],
  targetWord: string,
  path: readonly number[],
) {
  if (!assist) return null;
  if (typeof assist === "object" && assist.enabled === false) return null;
  if (typeof assist === "object" && assist.nextRuneIndex !== undefined) {
    const requested = assist.nextRuneIndex;
    return requested !== null && requested >= 0 && requested < letters.length && !path.includes(requested)
      ? requested
      : null;
  }

  const normalizedTarget = normalizeRune(targetWord);
  const currentWord = spellFromPath(letters, path);
  const nextCharacter = normalizedTarget.startsWith(currentWord)
    ? Array.from(normalizedTarget.slice(currentWord.length))[0]
    : Array.from(normalizedTarget)[0];
  if (!nextCharacter) return null;

  const used = new Set(path);
  const match = letters.findIndex(
    (letter, index) => !used.has(index) && normalizeRune(letter) === nextCharacter,
  );
  return match >= 0 ? match : null;
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

function runeStyle(index: number, total: number): CSSProperties {
  const position = runePosition(index, total);
  return {
    left: `${position.x}%`,
    top: `${position.y}%`,
  };
}

export function LetterGroveSpellBoard({
  letters: rawLetters,
  targetWord,
  recipe = "word",
  disabled = false,
  assist = false,
  reaction = null,
  className = "",
  castLabelHe = "מטילים קסם",
  clearLabelHe = "מנקים",
  onPathChange,
  onRuneConnect,
  onCast,
  onCanvasAvailabilityChange,
}: LetterGroveSpellBoardProps) {
  const letters = rawLetters.map(normalizeRune);
  const normalizedTarget = normalizeRune(targetWord);
  const instanceId = useId();
  const safeInstanceId = instanceId.replace(/[^a-zA-Z0-9_-]/g, "");
  const titleId = `spell-board-${safeInstanceId}-title`;
  const flatGlowId = `spell-board-${safeInstanceId}-flat-glow`;
  const boardRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<SpellBoardRuntime | null>(null);
  const pathRef = useRef<readonly number[]>(EMPTY_PATH);
  const castPathRef = useRef<readonly number[]>(EMPTY_PATH);
  const pointerRef = useRef<Point | null>(null);
  const pointerSessionRef = useRef<PointerSession | null>(null);
  const onPathChangeRef = useRef(onPathChange);
  const onRuneConnectRef = useRef(onRuneConnect);
  const onCastRef = useRef(onCast);
  const availabilityCallbackRef = useRef(onCanvasAvailabilityChange);
  const snapshotFactoryRef = useRef<() => SpellVisualSnapshot>(() => ({
    selectedPath: EMPTY_PATH,
    castPath: EMPTY_PATH,
    assistedIndex: null,
    pointer: null,
    dragging: false,
    disabled: false,
    reaction: null,
  }));
  const [path, setPath] = useState<readonly number[]>(EMPTY_PATH);
  const [castPath, setCastPath] = useState<readonly number[]>(EMPTY_PATH);
  const [dragging, setDragging] = useState(false);
  const [canvasAvailable, setCanvasAvailable] = useState<boolean | null>(null);
  const [fallbackPointer, setFallbackPointer] = useState<Point | null>(null);

  onPathChangeRef.current = onPathChange;
  onRuneConnectRef.current = onRuneConnect;
  onCastRef.current = onCast;
  availabilityCallbackRef.current = onCanvasAvailabilityChange;

  const assistIndex = assistedRuneIndex(assist, letters, normalizedTarget, path);
  const targetCharacters = Array.from(normalizedTarget);
  const targetLength = targetCharacters.length;
  const recipeConfig = typeof recipe === "string" ? { visibility: recipe } : recipe;
  const recipeVisibility = recipeConfig.visibility;
  const revealedRecipeIndices = new Set(
    recipeVisibility === "partial"
      ? recipeConfig.revealedIndices ?? (targetLength > 0 ? [0] : EMPTY_PATH)
      : EMPTY_PATH,
  );
  const recipeDisplay = recipeVisibility === "hidden"
    ? "?"
    : targetCharacters
        .map((character, index) => {
          if (recipeVisibility === "word") return character;
          if (recipeVisibility === "partial" && revealedRecipeIndices.has(index)) return character;
          return "_";
        })
        .join(" ");
  const recipeAriaLabel = recipeVisibility === "hidden"
    ? "המילה הסודית מוסתרת"
    : recipeVisibility === "word"
      ? `מילת היעד: ${normalizedTarget}`
      : `מתכון למילה באורך ${targetLength} אותיות`;
  const currentWord = spellFromPath(letters, path);
  const lastCastWord = spellFromPath(letters, castPath);
  const displayedWord = currentWord || lastCastWord;
  const targetMatched = currentWord === normalizedTarget;

  snapshotFactoryRef.current = () => ({
    selectedPath: pathRef.current,
    castPath: castPathRef.current,
    assistedIndex: assistedRuneIndex(
      assist,
      letters,
      normalizedTarget,
      pathRef.current,
    ),
    pointer: pointerRef.current,
    dragging: pointerSessionRef.current?.didDrag ?? false,
    disabled,
    reaction,
  });

  const updateVisuals = useCallback(() => {
    runtimeRef.current?.update(snapshotFactoryRef.current());
  }, []);

  const replacePath = useCallback(
    (nextPath: readonly number[]) => {
      pathRef.current = nextPath;
      setPath(nextPath);
      onPathChangeRef.current?.(spellFromPath(letters, nextPath), nextPath);
      updateVisuals();
    },
    [letters, updateVisuals],
  );

  const appendRune = useCallback(
    (index: number) => {
      if (
        disabled
        || index < 0
        || index >= letters.length
        || pathRef.current.includes(index)
        || pathRef.current.length >= targetLength
      ) {
        return false;
      }
      if (pathRef.current.length === 0) {
        castPathRef.current = EMPTY_PATH;
        setCastPath(EMPTY_PATH);
      }
      replacePath([...pathRef.current, index]);
      const letter = letters[index];
      if (letter) onRuneConnectRef.current?.(letter, index);
      return true;
    },
    [disabled, letters, replacePath, targetLength],
  );

  const connectDraggedRune = useCallback(
    (index: number) => {
      const currentPath = pathRef.current;
      const previousIndex = currentPath[currentPath.length - 2];
      if (currentPath.length >= 2 && previousIndex === index) {
        replacePath(currentPath.slice(0, -1));
        return true;
      }
      return appendRune(index);
    },
    [appendRune, replacePath],
  );

  const clearPath = useCallback(() => {
    if (disabled) return;
    pointerRef.current = null;
    pointerSessionRef.current = null;
    setDragging(false);
    setFallbackPointer(null);
    castPathRef.current = EMPTY_PATH;
    setCastPath(EMPTY_PATH);
    replacePath(EMPTY_PATH);
  }, [disabled, replacePath]);

  const castCurrentPath = useCallback(() => {
    if (disabled || targetLength === 0 || pathRef.current.length !== targetLength) return;
    const submittedPath = [...pathRef.current];
    const submittedWord = spellFromPath(letters, submittedPath);
    castPathRef.current = submittedPath;
    setCastPath(submittedPath);
    pathRef.current = EMPTY_PATH;
    setPath(EMPTY_PATH);
    onPathChangeRef.current?.("", EMPTY_PATH);
    onCastRef.current(submittedWord, submittedPath);
    updateVisuals();
  }, [disabled, letters, targetLength, updateVisuals]);

  const updatePointer = useCallback(
    (clientX: number, clientY: number) => {
      const board = boardRef.current;
      if (!board) return;
      const rect = board.getBoundingClientRect();
      const point = {
        x: Math.max(0, Math.min(rect.width, clientX - rect.left)),
        y: Math.max(0, Math.min(rect.height, clientY - rect.top)),
      };
      pointerRef.current = point;
      if (canvasAvailable === false) {
        setFallbackPointer({
          x: rect.width > 0 ? (point.x / rect.width) * 100 : 50,
          y: rect.height > 0 ? (point.y / rect.height) * 100 : 50,
        });
      }
      updateVisuals();
    },
    [canvasAvailable, updateVisuals],
  );

  const runeIndexAtPoint = useCallback((clientX: number, clientY: number) => {
    const board = boardRef.current;
    const element = document.elementFromPoint(clientX, clientY);
    if (!board || !(element instanceof Element)) return null;
    const runeButton = element.closest<HTMLElement>("[data-spell-rune-index]");
    if (!runeButton || !board.contains(runeButton)) return null;
    const index = Number(runeButton.dataset.spellRuneIndex);
    return Number.isInteger(index) ? index : null;
  }, []);

  const handleRunePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, index: number) => {
      if (disabled || event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.focus();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture can be unavailable in browser emulators; bubbling still works.
      }
      pointerSessionRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        didDrag: false,
        initialPath: [...pathRef.current],
      };
      setDragging(true);
      appendRune(index);
      updatePointer(event.clientX, event.clientY);
    },
    [appendRune, disabled, updatePointer],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const session = pointerSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      event.preventDefault();
      const travel = Math.hypot(event.clientX - session.startX, event.clientY - session.startY);
      if (travel >= 7) session.didDrag = true;
      const runeIndex = runeIndexAtPoint(event.clientX, event.clientY);
      if (runeIndex !== null && connectDraggedRune(runeIndex)) session.didDrag = true;
      updatePointer(event.clientX, event.clientY);
    },
    [connectDraggedRune, runeIndexAtPoint, updatePointer],
  );

  const finishPointer = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, shouldCast: boolean) => {
      const session = pointerSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      const wasDrag = session.didDrag;
      pointerSessionRef.current = null;
      pointerRef.current = null;
      setDragging(false);
      setFallbackPointer(null);
      if (!shouldCast) {
        replacePath(session.initialPath);
        return;
      }
      if (wasDrag && pathRef.current.length === targetLength) castCurrentPath();
      else updateVisuals();
    },
    [castCurrentPath, replacePath, targetLength, updateVisuals],
  );

  const handleBoardKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (disabled || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "Escape") {
        event.preventDefault();
        clearPath();
        return;
      }
      if (event.key === "Backspace" && pathRef.current.length > 0) {
        event.preventDefault();
        replacePath(pathRef.current.slice(0, -1));
        return;
      }
      if (/^[a-z]$/i.test(event.key)) {
        const requestedLetter = event.key.toLocaleUpperCase("en-US");
        const used = new Set(pathRef.current);
        const index = letters.findIndex(
          (letter, runeIndex) => !used.has(runeIndex) && letter === requestedLetter,
        );
        if (index >= 0) {
          event.preventDefault();
          appendRune(index);
        }
      }
    },
    [appendRune, clearPath, disabled, letters, replacePath],
  );

  const lettersSignature = letters.join("\u0000");
  useEffect(() => {
    pointerSessionRef.current = null;
    pointerRef.current = null;
    pathRef.current = EMPTY_PATH;
    castPathRef.current = EMPTY_PATH;
    setPath(EMPTY_PATH);
    setCastPath(EMPTY_PATH);
    setDragging(false);
    setFallbackPointer(null);
    onPathChangeRef.current?.("", EMPTY_PATH);
  }, [lettersSignature, normalizedTarget]);

  useEffect(() => {
    updateVisuals();
  }, [path, castPath, assistIndex, disabled, reaction, updateVisuals]);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;

    let cancelled = false;
    let runtime: SpellBoardRuntime | null = null;

    async function mountSpellVisuals(host: HTMLDivElement) {
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
          if (!cancelled) {
            setCanvasAvailable(false);
            availabilityCallbackRef.current?.(false);
          }
          return;
        }

        renderer.outputColorSpace = THREE.SRGBColorSpace;
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
          zIndex: "0",
        });
        host.prepend(canvas);

        const scene: Scene = new THREE.Scene();
        const camera: OrthographicCamera = new THREE.OrthographicCamera(0, 1, 0, 1, 0.1, 30);
        camera.position.set(0, 0, 10);

        const root = new THREE.Group();
        scene.add(root);

        const segmentGeometry = new THREE.PlaneGeometry(1, 1);
        const glowMaterial = new THREE.MeshBasicMaterial({
          blending: THREE.AdditiveBlending,
          color: 0x9878ff,
          depthTest: false,
          depthWrite: false,
          opacity: 0.3,
          transparent: true,
        });
        const coreMaterial = new THREE.MeshBasicMaterial({
          blending: THREE.AdditiveBlending,
          color: 0xf5efff,
          depthTest: false,
          depthWrite: false,
          opacity: 0.96,
          transparent: true,
        });
        const maxSegments = Math.max(1, letters.length);
        const glowSegments = Array.from({ length: maxSegments }, () => {
          const mesh = new THREE.Mesh(segmentGeometry, glowMaterial);
          mesh.visible = false;
          mesh.renderOrder = 2;
          root.add(mesh);
          return mesh;
        });
        const coreSegments = Array.from({ length: maxSegments }, () => {
          const mesh = new THREE.Mesh(segmentGeometry, coreMaterial);
          mesh.visible = false;
          mesh.renderOrder = 3;
          root.add(mesh);
          return mesh;
        });

        const runeVisuals: RuneVisual[] = letters.map(() => {
          const runeRoot = new THREE.Group();
          root.add(runeRoot);
          const ringMaterial = new THREE.MeshBasicMaterial({
            blending: THREE.AdditiveBlending,
            color: 0xa88aff,
            depthTest: false,
            depthWrite: false,
            opacity: 0,
            side: THREE.DoubleSide,
            transparent: true,
          });
          const glowMaterialForRune = new THREE.MeshBasicMaterial({
            blending: THREE.AdditiveBlending,
            color: 0xa88aff,
            depthTest: false,
            depthWrite: false,
            opacity: 0,
            side: THREE.DoubleSide,
            transparent: true,
          });
          const ring = new THREE.Mesh(new THREE.RingGeometry(28, 34, 48), ringMaterial);
          ring.renderOrder = 4;
          runeRoot.add(ring);
          const glow = new THREE.Mesh(new THREE.CircleGeometry(36, 48), glowMaterialForRune);
          glow.renderOrder = 1;
          glow.position.z = -0.1;
          runeRoot.add(glow);
          return { root: runeRoot, ring, glow, ringMaterial, glowMaterial: glowMaterialForRune };
        });

        let snapshot = snapshotFactoryRef.current();
        let metrics: RuneMetric[] = [];
        let width = 1;
        let height = 1;
        let disposed = false;
        let contextLost = false;
        let animationFrame = 0;
        let reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        let reactionIdentity = reaction ? `${reaction.kind}:${reaction.sequence}` : "none";
        let reactionStartedAt = performance.now();

        function measure() {
          const hostRect = host.getBoundingClientRect();
          width = Math.max(1, Math.round(hostRect.width));
          height = Math.max(1, Math.round(hostRect.height));
          renderer.setDrawingBufferSize(
            width,
            height,
            Math.min(window.devicePixelRatio || 1, 1.5),
          );
          camera.left = 0;
          camera.right = width;
          camera.top = 0;
          camera.bottom = height;
          camera.updateProjectionMatrix();
          metrics = letters.map((_, index) => {
            const rune = host.querySelector<HTMLElement>(`[data-spell-rune-index="${index}"]`);
            const rect = rune?.getBoundingClientRect();
            if (!rect) return { x: width / 2, y: height / 2, radius: 30 };
            return {
              x: rect.left - hostRect.left + rect.width / 2,
              y: rect.top - hostRect.top + rect.height / 2,
              radius: Math.max(rect.width, rect.height) / 2,
            };
          });
          runeVisuals.forEach((visual, index) => {
            const metric = metrics[index];
            if (!metric) return;
            visual.root.position.set(metric.x, metric.y, 0);
            visual.root.scale.setScalar(Math.max(0.72, metric.radius / 36));
          });
          requestFrame();
        }

        function placeSegment(mesh: Mesh, start: Point, end: Point, thickness: number) {
          const deltaX = end.x - start.x;
          const deltaY = end.y - start.y;
          const length = Math.hypot(deltaX, deltaY);
          if (length < 2) {
            mesh.visible = false;
            return;
          }
          mesh.visible = true;
          mesh.position.set((start.x + end.x) / 2, (start.y + end.y) / 2, 0);
          mesh.rotation.z = Math.atan2(deltaY, deltaX);
          mesh.scale.set(length, thickness, 1);
        }

        function renderFrame(timeMs: number) {
          animationFrame = 0;
          if (disposed || contextLost) return;
          const time = timeMs * 0.001;
          const reactionAge = Math.max(0, (timeMs - reactionStartedAt) / 1000);
          const visiblePath = snapshot.selectedPath.length > 0
            ? snapshot.selectedPath
            : snapshot.castPath;
          const points = visiblePath.flatMap((index) => {
            const metric = metrics[index];
            return metric ? [{ x: metric.x, y: metric.y }] : [];
          });
          if (snapshot.dragging && snapshot.pointer && points.length > 0) {
            points.push(snapshot.pointer);
          }

          const reactionColor = snapshot.reaction
            ? CAST_COLORS[snapshot.reaction.kind]
            : 0xa88aff;
          glowMaterial.color.setHex(reactionColor);
          coreMaterial.color.setHex(snapshot.reaction?.kind === "incorrect" ? 0xffd8e2 : 0xffffff);
          glowMaterial.opacity = snapshot.disabled ? 0.12 : 0.32;
          coreMaterial.opacity = snapshot.disabled ? 0.28 : 0.94;

          glowSegments.forEach((segment, index) => {
            const start = points[index];
            const end = points[index + 1];
            if (!start || !end) {
              segment.visible = false;
              return;
            }
            const pulse = reducedMotion ? 1 : 1 + Math.sin(time * 6 + index) * 0.14;
            placeSegment(segment, start, end, 15 * pulse);
          });
          coreSegments.forEach((segment, index) => {
            const start = points[index];
            const end = points[index + 1];
            if (!start || !end) {
              segment.visible = false;
              return;
            }
            placeSegment(segment, start, end, 4);
          });

          const selected = new Set(visiblePath);
          runeVisuals.forEach((visual, index) => {
            const isSelected = selected.has(index);
            const isAssisted = snapshot.assistedIndex === index && !isSelected;
            const isReacting = Boolean(snapshot.reaction && isSelected);
            const color = isReacting ? reactionColor : isAssisted ? 0xffd369 : 0xaa8cff;
            visual.ringMaterial.color.setHex(color);
            visual.glowMaterial.color.setHex(color);
            visual.ringMaterial.opacity = snapshot.disabled
              ? isSelected ? 0.22 : 0
              : isReacting ? 0.95 : isSelected ? 0.86 : isAssisted ? 0.68 : 0;
            visual.glowMaterial.opacity = snapshot.disabled
              ? 0
              : isReacting ? 0.22 : isSelected ? 0.15 : isAssisted ? 0.12 : 0;
            const pulse = reducedMotion
              ? 1
              : isReacting
                ? 1 + Math.sin(Math.min(reactionAge * 10, Math.PI * 4)) * 0.12
                : 1 + Math.sin(time * 4 + index) * 0.04;
            visual.ring.scale.setScalar(pulse);
            visual.glow.scale.setScalar(pulse);
            visual.ring.rotation.z = reducedMotion ? 0 : time * 0.22 * (index % 2 === 0 ? 1 : -1);
          });

          renderer.render(scene, camera);
          if (!reducedMotion) animationFrame = window.requestAnimationFrame(renderFrame);
        }

        function requestFrame() {
          if (!animationFrame && !disposed && !contextLost) {
            animationFrame = window.requestAnimationFrame(renderFrame);
          }
        }

        const runtimeApi: SpellBoardRuntime = {
          update(nextSnapshot) {
            const nextIdentity = nextSnapshot.reaction
              ? `${nextSnapshot.reaction.kind}:${nextSnapshot.reaction.sequence}`
              : "none";
            if (nextIdentity !== reactionIdentity) {
              reactionIdentity = nextIdentity;
              reactionStartedAt = performance.now();
            }
            snapshot = nextSnapshot;
            requestFrame();
          },
          dispose() {
            if (disposed) return;
            disposed = true;
            window.cancelAnimationFrame(animationFrame);
            resizeObserver.disconnect();
            motionQuery.removeEventListener("change", handleMotionChange);
            canvas.removeEventListener("webglcontextlost", handleContextLost);
            disposeObjectTree(root);
            segmentGeometry.dispose();
            renderer.dispose();
            renderer.forceContextLoss();
            canvas.remove();
          },
        };

        function handleMotionChange(event: MediaQueryListEvent) {
          reducedMotion = event.matches;
          requestFrame();
        }

        function handleContextLost(event: Event) {
          event.preventDefault();
          contextLost = true;
          setCanvasAvailable(false);
          availabilityCallbackRef.current?.(false);
        }

        const resizeObserver = new ResizeObserver(measure);
        const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        reducedMotion = motionQuery.matches;
        motionQuery.addEventListener("change", handleMotionChange);
        canvas.addEventListener("webglcontextlost", handleContextLost);
        resizeObserver.observe(host);
        host.querySelectorAll<HTMLElement>("[data-spell-rune-index]").forEach((rune) => {
          resizeObserver.observe(rune);
        });
        measure();

        runtime = runtimeApi;
        runtimeRef.current = runtimeApi;
        runtimeApi.update(snapshotFactoryRef.current());
        setCanvasAvailable(true);
        availabilityCallbackRef.current?.(true);
      } catch {
        if (!cancelled) {
          setCanvasAvailable(false);
          availabilityCallbackRef.current?.(false);
        }
      }
    }

    void mountSpellVisuals(board);
    return () => {
      cancelled = true;
      runtimeRef.current = null;
      runtime?.dispose();
    };
    // The renderer is rebuilt only when the number of physical runes changes.
  }, [letters.length]);

  const fallbackVisiblePath = path.length > 0 ? path : castPath;
  const fallbackPoints = fallbackVisiblePath.map((index) => runePosition(index, letters.length));
  if (dragging && fallbackPointer && fallbackPoints.length > 0) fallbackPoints.push(fallbackPointer);
  const fallbackPointString = fallbackPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const assistMessage = typeof assist === "object" && assist.messageHe
    ? assist.messageHe
    : "הרונה הבאה זוהרת בזהב";
  const reactionMessage = reaction?.kind === "correct"
    ? "הקסם הצליח!"
    : reaction?.kind === "incorrect"
      ? "כמעט! נסו לחבר את האותיות שוב"
      : reaction?.kind === "casting"
        ? "הקסם יוצא לדרך"
        : null;

  return (
    <section
      className={`rounded-[2rem] border border-white/15 bg-[#071920]/72 p-3 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_18px_48px_rgba(0,0,0,.24)] backdrop-blur-md md:p-5 ${className}`}
      dir="rtl"
      aria-labelledby={titleId}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black tracking-[0.14em] text-[#c8b8ff]">קסם מילים</p>
          <h2 id={titleId} className="mt-1 text-lg font-black md:text-2xl">
            חברו את האותיות
          </h2>
        </div>
        <div className="rounded-2xl border border-white/15 bg-black/20 px-3 py-2 text-center" aria-label={recipeAriaLabel}>
          <span className="block text-[10px] font-black text-white/55">
            {typeof recipe === "object" && recipe.labelHe ? recipe.labelHe : recipeVisibility === "hidden" ? "מילה סודית" : "המתכון"}
          </span>
          <span className="mt-0.5 block font-mono text-lg font-black tracking-[0.2em] text-[#f8e99b] md:text-xl" dir="ltr">
            {recipeDisplay || "—"}
          </span>
        </div>
      </header>

      <div
        ref={boardRef}
        className="relative mt-3 min-h-[19rem] touch-none select-none overflow-hidden rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_50%_48%,rgba(113,83,185,.24),rgba(4,18,25,.76)_55%,rgba(2,12,18,.92))] sm:min-h-[22rem] md:min-h-[26rem]"
        role="group"
        aria-label="לוח אותיות. גררו בין האותיות או בחרו אותיות בעזרת המקלדת"
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishPointer(event, true)}
        onPointerCancel={(event) => finishPointer(event, false)}
        onKeyDown={handleBoardKeyDown}
      >
        <div className="pointer-events-none absolute inset-0 opacity-45" aria-hidden>
          <div className="absolute left-1/2 top-1/2 aspect-square w-[72%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#a88cff]/25 shadow-[inset_0_0_42px_rgba(168,140,255,.08),0_0_32px_rgba(168,140,255,.08)]" />
          <div className="absolute left-1/2 top-1/2 aspect-square w-[46%] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2rem] border border-[#75d9ff]/15" />
        </div>

        {canvasAvailable === false ? (
          <svg
            className="pointer-events-none absolute inset-0 z-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <filter id={flatGlowId} x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="1.8" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            {fallbackPointString ? (
              <polyline
                points={fallbackPointString}
                fill="none"
                stroke={reaction?.kind === "incorrect" ? "#ff7f9f" : reaction?.kind === "correct" ? "#8df59c" : "#b69cff"}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.4"
                vectorEffect="non-scaling-stroke"
                filter={`url(#${flatGlowId})`}
              />
            ) : null}
          </svg>
        ) : null}

        <div className="pointer-events-none absolute left-1/2 top-1/2 z-[5] w-[min(13rem,44%)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/10 bg-[#071920]/78 px-3 py-2 text-center shadow-xl backdrop-blur-sm">
          <span className="block text-[10px] font-black text-white/50">הקסם שלכם</span>
          <output
            className="mt-0.5 block min-h-8 truncate font-mono text-2xl font-black tracking-[0.16em] text-white md:text-3xl"
            dir="ltr"
            aria-live="polite"
            aria-label={displayedWord ? `המילה שנבנתה: ${displayedWord}` : "עדיין לא נבחרו אותיות"}
          >
            {displayedWord || "· · ·"}
          </output>
        </div>

        {letters.map((letter, index) => {
          const order = path.indexOf(index);
          const isSelected = order >= 0;
          const wasCast = castPath.includes(index);
          const isAssisted = assistIndex === index && !isSelected;
          return (
            <button
              key={`${index}-${letter}`}
              type="button"
              data-spell-rune-index={index}
              style={runeStyle(index, letters.length)}
              className={`absolute z-10 grid aspect-square w-[clamp(4rem,14vw,4.75rem)] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[42%] border-2 bg-[radial-gradient(circle_at_35%_25%,rgba(255,255,255,.24),rgba(42,55,72,.96)_42%,rgba(8,24,32,.98))] font-mono text-2xl font-black text-white shadow-[inset_0_2px_1px_rgba(255,255,255,.14),0_8px_18px_rgba(0,0,0,.38)] transition-[transform,border-color,box-shadow,opacity] hover:scale-105 hover:border-white/70 focus-visible:z-20 focus-visible:outline-4 focus-visible:outline-offset-3 focus-visible:outline-[#f8e99b] active:scale-95 disabled:cursor-default disabled:opacity-55 motion-reduce:transition-none md:text-3xl ${
                isSelected || wasCast
                  ? "border-[#d9caff] shadow-[inset_0_0_20px_rgba(168,140,255,.26),0_0_24px_rgba(168,140,255,.5)]"
                  : isAssisted
                    ? "border-[#f8d76e] shadow-[inset_0_0_18px_rgba(248,215,110,.2),0_0_22px_rgba(248,215,110,.48)]"
                    : "border-white/25"
              }`}
              dir="ltr"
              disabled={disabled}
              aria-pressed={isSelected}
              aria-label={`${letter}, רונה ${index + 1}${isSelected ? `, בחירה ${order + 1}` : ""}${isAssisted ? ", הצעה" : ""}`}
              onPointerDown={(event) => handleRunePointerDown(event, index)}
              onClick={(event) => {
                // Pointer input is handled on pointerdown; detail 0 preserves keyboard and AT activation.
                if (event.detail === 0) appendRune(index);
              }}
            >
              {letter}
              {isSelected ? (
                <span className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full border-2 border-[#d9caff] bg-[#6546a8] font-sans text-[11px] font-black text-white shadow-md" aria-hidden>
                  {order + 1}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-3 min-h-6 text-center text-xs font-bold text-white/65" role="status" aria-live="polite">
        {reactionMessage
          ? reactionMessage
          : assistIndex !== null
          ? `💡 ${assistMessage}`
          : dragging
            ? "המשיכו לגרור ושחררו כדי להטיל את הקסם"
            : path.length === targetLength && targetLength > 0
              ? "הקסם מוכן — אפשר להטיל!"
              : path.length > 0
                ? `חסרות עוד ${targetLength - path.length} אותיות`
            : "אפשר לגרור, להקיש על האותיות, או להשתמש במקלדת"}
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_auto]">
        <button
          type="button"
          onClick={castCurrentPath}
          disabled={disabled || targetLength === 0 || path.length !== targetLength}
          className={`min-h-14 rounded-2xl border-2 px-5 text-lg font-black shadow-lg transition hover:-translate-y-0.5 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-white active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none ${
            targetMatched
              ? "border-[#c9ffd0] bg-[#43a85c] text-white shadow-[0_0_24px_rgba(91,219,117,.3)]"
              : "border-[#d8c8ff] bg-[#7756bc] text-white"
          }`}
        >
          ✨ {castLabelHe}
        </button>
        <button
          type="button"
          onClick={clearPath}
          disabled={disabled || (path.length === 0 && castPath.length === 0)}
          className="min-h-14 rounded-2xl border border-white/20 bg-white/10 px-4 font-black text-white transition hover:bg-white/15 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none"
        >
          ↺ {clearLabelHe}
        </button>
      </div>

      <p className="sr-only">
        במקלדת: עברו בין הרונות עם מקש Tab ולחצו Enter או רווח כדי לבחור. Backspace מוחק את האות האחרונה ו-Escape מנקה את כל המילה.
      </p>
    </section>
  );
}
