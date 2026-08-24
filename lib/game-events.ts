import type { SkillId } from "./types";

/**
 * Events are the seam between learning and spectacle.
 *
 * Curriculum components decide whether an answer is correct and which skills
 * it practises. Scenes only receive these small facts and turn them into fog,
 * light, sound, and rewards. A renderer must never grade a child.
 */
export type GameEvent =
  | {
      type: "answer.correct";
      encounterId: string;
      questionId: string;
      skills: SkillId[];
      chargedRunes: number;
    }
  | {
      type: "answer.incorrect";
      encounterId: string;
      questionId: string;
      skills: SkillId[];
      attempts: number;
    }
  | {
      type: "encounter.completed";
      encounterId: string;
      rewardId: string;
      unlockedEncounterId: string;
    };

