/**
 * CURRICULUM — public surface. Screens import from here, never from the
 * individual data files, so content can be reorganised without touching UI.
 */

export type {
  LetterData,
  WordData,
  SentenceData,
  TrackShape,
  CurriculumApi,
  StepForSkill,
} from "./contract";
export {
  LETTERS,
  TEACHING_ORDER,
  getLetter,
  lettersUpTo,
  distractorsFor,
} from "./alphabet";
export {
  WORDS,
  WORDS_BY_DIFFICULTY,
  getWord,
  buildableWords,
  payoffWordFor,
  spendWordFor,
  unlockIndex,
} from "./words";
export {
  SENTENCES,
  SENTENCE_GLUE,
  SENTENCE_VOCAB,
  getSentence,
  glossFor,
  sentencesOfTier,
  splitSentence,
  unglossedSentenceWords,
  wordsHeFor,
} from "./sentences";
export {
  LESSONS,
  TRACK_SHAPE,
  TRACK_WORDS,
  TUTORIAL_LESSON,
  getLesson,
  stepForSkill,
  buildReviewLesson,
  buildWarmupSteps,
  soundStep,
  nameStep,
  shapeStep,
  keyStep,
  wordStep,
  sentenceStep,
  skillsForStep,
} from "./lessons";
