/**
 * CURRICULUM — public surface. Screens import from here, never from the
 * individual data files, so content can be reorganised without touching UI.
 */

export type { LetterData, WordData, CurriculumApi, StepForSkill } from "./contract";
export {
  LETTERS,
  TEACHING_ORDER,
  getLetter,
  lettersUpTo,
  distractorsFor,
} from "./alphabet";
export {
  WORDS,
  getWord,
  buildableWords,
  payoffWordFor,
  unlockIndex,
} from "./words";
export {
  LESSONS,
  TUTORIAL_LESSON,
  getLesson,
  stepForSkill,
  buildReviewLesson,
  soundStep,
  nameStep,
  shapeStep,
  keyStep,
  wordStep,
  skillsForStep,
} from "./lessons";
