/**
 * Cosmetic adventure state, deliberately separate from learning progress.
 *
 * A wand can change how a spell looks, never whether an answer is accepted or
 * a lesson unlocks. Keeping this beside (not inside) Progress lets the game
 * grow without turning rewards into evidence of mastery.
 */

export const ADVENTURE_STORAGE_KEY = "efh:adventure";

export type AdventureItemId = "rune-wand";
export type AdventureEncounterId =
  | "letter-grove-first-rune"
  | "letter-grove-sun-gate";

export interface AdventureProfile {
  version: 1;
  items: AdventureItemId[];
  completedEncounters: AdventureEncounterId[];
  unlockedEncounters: AdventureEncounterId[];
  stars: Partial<Record<AdventureEncounterId, 0 | 1 | 2 | 3>>;
}

export function freshAdventureProfile(): AdventureProfile {
  return {
    version: 1,
    items: [],
    completedEncounters: [],
    unlockedEncounters: ["letter-grove-first-rune"],
    stars: {},
  };
}

const unique = <T extends string>(items: readonly T[]): T[] => [...new Set(items)];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function knownItems(value: unknown): AdventureItemId[] {
  if (!Array.isArray(value)) return [];
  return unique(value.filter((item): item is AdventureItemId => item === "rune-wand"));
}

function knownEncounters(value: unknown): AdventureEncounterId[] {
  if (!Array.isArray(value)) return [];
  return unique(
    value.filter(
      (item): item is AdventureEncounterId =>
        item === "letter-grove-first-rune" || item === "letter-grove-sun-gate",
    ),
  );
}

function knownStars(value: unknown): AdventureProfile["stars"] {
  if (!isRecord(value)) return {};
  const result: AdventureProfile["stars"] = {};
  for (const encounterId of knownEncounters(Object.keys(value))) {
    const raw = value[encounterId];
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    result[encounterId] = Math.max(0, Math.min(3, Math.floor(raw))) as 0 | 1 | 2 | 3;
  }
  return result;
}

export function coerceAdventureProfile(value: unknown): AdventureProfile {
  if (!isRecord(value)) return freshAdventureProfile();
  return {
    version: 1,
    items: knownItems(value.items),
    completedEncounters: knownEncounters(value.completedEncounters),
    unlockedEncounters: unique([
      "letter-grove-first-rune",
      ...knownEncounters(value.unlockedEncounters),
    ]),
    stars: knownStars(value.stars),
  };
}

function storageAvailable(): boolean {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

export function loadAdventureProfile(): AdventureProfile {
  if (!storageAvailable()) return freshAdventureProfile();
  try {
    const raw = window.localStorage.getItem(ADVENTURE_STORAGE_KEY);
    return raw ? coerceAdventureProfile(JSON.parse(raw) as unknown) : freshAdventureProfile();
  } catch {
    return freshAdventureProfile();
  }
}

export function saveAdventureProfile(profile: AdventureProfile): void {
  if (!storageAvailable()) return;
  try {
    window.localStorage.setItem(ADVENTURE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // A blocked or full store must never stop play. The in-memory reward stays.
  }
}

export function withEncounterReward(
  profile: AdventureProfile,
  encounterId: AdventureEncounterId,
  itemId: AdventureItemId,
  unlockedEncounterId: AdventureEncounterId,
  stars: 0 | 1 | 2 | 3,
): AdventureProfile {
  return {
    ...profile,
    items: unique([...profile.items, itemId]),
    completedEncounters: unique([...profile.completedEncounters, encounterId]),
    unlockedEncounters: unique([...profile.unlockedEncounters, unlockedEncounterId]),
    stars: {
      ...profile.stars,
      [encounterId]: Math.max(profile.stars[encounterId] ?? 0, stars) as 0 | 1 | 2 | 3,
    },
  };
}
