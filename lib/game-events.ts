import type { SkillId } from "./types";

/**
 * Events are the seam between learning and spectacle.
 *
 * Curriculum components decide whether a completed spell is correct and which
 * skills it practises. Scenes only receive these small facts and turn them
 * into fog, light, sound, and rewards. A renderer must never grade a child.
 */
export type GameEvent =
  | {
      type: "spell.cast.correct";
      encounterId: string;
      spellId: string;
      word: string;
      skills: SkillId[];
      chargedRunes: number;
    }
  | {
      type: "spell.cast.incorrect";
      encounterId: string;
      spellId: string;
      attemptedWord: string;
      targetWord: string;
      skills: SkillId[];
      attempts: number;
    }
  | {
      type: "encounter.completed";
      encounterId: string;
      rewardId: string;
      unlockedEncounterId: string;
    };
