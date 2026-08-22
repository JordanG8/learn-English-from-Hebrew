/**
 * DID THE CHILD SAY THE WORD? — the whole of the judgement, kept pure.
 *
 * The microphone, the upload and the model all live elsewhere. What arrives
 * here is one string a transcription model heard and one word the app asked
 * for, and what leaves is one of three verdicts. Keeping that separable is the
 * point: this is the part with an opinion in it, and an opinion should be
 * readable, testable and arguable without a phone in your hand.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ----------------------------------
 *  · It does not score LETTER SOUNDS. A transcription model is trained on
 *    speech, and "ffff" said into a phone is not speech; asking it whether a
 *    seven-year-old produced /f/ rather than /v/ gets an answer that reads
 *    confident and is close to a coin flip. The app teaches those sounds and
 *    checks them by recognition instead, which is what lib/srs.ts already
 *    does honestly. Whole words only.
 *  · It does not grade ACCENT. An Israeli child saying "cat" with an Israeli
 *    accent said the word. The only failure this can honestly report is "the
 *    word I heard was a different word".
 *  · It never feeds mastery. Nothing here reaches lib/srs.ts — see
 *    components/speak for why that boundary exists.
 *
 * THE THIRD VERDICT is the load-bearing one. A binary right/wrong on a signal
 * this noisy means a child who said the word perfectly is told they are wrong
 * because a phone microphone in a classroom heard "hat" for "cat". "Nearly —
 * say it once more" costs nothing when the app is wrong and is true when it is
 * right, so anything that is one small edit away from the target lands there
 * rather than in the red.
 */

export type Verdict = "match" | "near" | "different";

export interface Judgement {
  verdict: Verdict;
  /** What the model heard, normalised — shown to the child as LTR text. */
  heard: string;
  /** The word that was asked for. */
  expected: string;
  /**
   * Edit distance between the two, normalised. Diagnostic; the verdict is
   * what the UI acts on. 0 is identical.
   */
  distance: number;
}

/**
 * Everything a transcription adds that is not the word: punctuation, casing,
 * the full stop a model puts on a one-word utterance, and the Hebrew or
 * Latin quotation marks a phone keyboard inserts.
 */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    // Strip combining marks (accents), then anything that is not a letter,
    // a digit or a single space.
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Damerau-Levenshtein: insert, delete, substitute, and — the reason it is
 * this one and not the classic — SWAP TWO ADJACENT LETTERS for a cost of 1.
 * Transcription models transpose ("appel" for "apple") far more often than
 * they invent two unrelated letters, and classic Levenshtein charges 2 for a
 * swap, which pushed a near-perfect attempt into the red.
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  // Three rows, because a transposition looks back two.
  let two = new Array<number>(b.length + 1);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(
        prev[j]! + 1, // deletion
        curr[j - 1]! + 1, // insertion
        prev[j - 1]! + cost, // substitution
      );
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        best = Math.min(best, two[j - 2]! + 1); // transposition
      }
      curr[j] = best;
    }
    [two, prev, curr] = [prev, curr, two];
  }
  return prev[b.length]!;
}

/**
 * THE CONSONANT SKELETON — the same consonants, whatever vowel is between
 * them: "sit" and "seat" both become `sVt`.
 *
 * This is not a general phonetic algorithm and does not try to be. It exists
 * for one documented, specific problem: Hebrew has five vowels and English has
 * roughly a dozen, so /ɪ/–/iː/, /æ/–/e/ and /ʌ/–/ɔ/ are the confusions an
 * Israeli child actually makes (docs/research.md, PRIORITY_CONFUSION_PAIRS_SOUND).
 * Every one of them keeps the consonants and moves the vowel.
 *
 * A match on the skeleton is therefore never "correct" — saying "seat" for
 * "sit" is the mistake, not a variant of the right answer. It is the strongest
 * possible case for "nearly", which is what it is used for.
 */
function consonantSkeleton(word: string): string {
  return word
    // "ow", "aw", "ew" are vowel digraphs, not a vowel and then a consonant —
    // without this, "bowl" and "ball" read as different skeletons.
    .replace(/([aeiou])w/g, "$1")
    .replace(/[aeiouy]+/g, "V")
    // A doubled consonant is a spelling convention, not a second sound.
    .replace(/([^V])\1+/g, "$1");
}

/**
 * HOW MUCH WRONG IS "NEARLY".
 *
 * One edit, always — "cat" vs "hat" is one letter and is exactly the case
 * this band exists for. A second edit is allowed only from six letters up,
 * where two wrong letters still leaves most of the word standing. Below that,
 * two edits out of three letters is a different word and saying otherwise
 * would be flattery.
 */
function nearThreshold(expected: string): number {
  return expected.length >= 6 ? 2 : 1;
}

/**
 * A model asked for one word often returns a sentence — "Cat.", "the cat",
 * "I think cat". Every token is a candidate, and the best one wins: a child
 * who said the word inside a false start still said the word.
 */
function candidates(heard: string): string[] {
  const words = heard.split(" ").filter(Boolean);
  // The whole string too, for a target that is itself two words.
  return words.length > 1 ? [heard, ...words] : words;
}

export function judge(expectedRaw: string, heardRaw: string): Judgement {
  const expected = normalise(expectedRaw);
  const heard = normalise(heardRaw);

  if (!heard) {
    return { verdict: "different", heard: "", expected, distance: expected.length };
  }

  let best = Number.POSITIVE_INFINITY;
  for (const c of candidates(heard)) {
    best = Math.min(best, editDistance(expected, c));
    if (best === 0) break;
  }

  // A vowel-only difference is "nearly" however many letters it moved: see
  // consonantSkeleton. Checked per candidate, for the same reason as above.
  const sameSkeleton =
    best > 0 &&
    candidates(heard).some(
      (c) => consonantSkeleton(c) === consonantSkeleton(expected),
    );

  const verdict: Verdict =
    best === 0
      ? "match"
      : best <= nearThreshold(expected) || sameSkeleton
        ? "near"
        : "different";

  return { verdict, heard, expected, distance: best };
}
