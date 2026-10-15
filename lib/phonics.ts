/**
 * PHONICS — what a word SOUNDS like, piece by piece, and what a mouth looks
 * like while it makes each piece.
 *
 * Three features read from this one table, which is the point of having it:
 *
 *   · the word intro, which sounds a new word out — "sss · uh · nnn" with each
 *     letter lit while its sound plays — before saying the word whole;
 *   · the keyboard, which plays the sound of every letter as it is typed;
 *   · the mouth pictures, which show the shape that makes the sound.
 *
 * If those three disagreed — the intro saying /eɪ/ for the A in CAKE while the
 * keyboard said /æ/ — a child would be taught two things at once and learn
 * neither. So there is one segmentation per word, here, and everything else
 * asks it.
 *
 * WHY NOT ONE SOUND PER LETTER
 * ----------------------------
 * Because English does not work that way, and a sound-out that pretends it
 * does teaches the wrong thing on half the word bank: CAKE is k·ay·k (the E is
 * silent), SHEEP is sh·ee·p, and BOOK and MOON spell different vowels with the
 * same two letters. A segment is therefore a GRAPHEME — one or more adjacent
 * letters — and the sound those letters make together in this word. A letter
 * that makes no sound of its own (the E at the end of CAKE) is its own segment
 * with no sound, drawn quiet rather than skipped, so the child sees it is
 * there and hears that it says nothing.
 *
 * Pronunciation is General American, matching the voice that says the whole
 * word. Unstressed vowels (the "a" at the end of PIZZA) are given the short
 * /ʌ/ — "uh" — which is how phonics is taught to children everywhere, rather
 * than a schwa clip that no synthesiser, and no seven-year-old, can produce in
 * isolation.
 */

/* ------------------------------------------------------------------ */
/* Mouths — the twelve shapes on the board in public/mouths/             */
/* ------------------------------------------------------------------ */

export type MouthId =
  | "aei"
  | "o"
  | "cdnstxyz"
  | "gk"
  | "l"
  | "bmp"
  | "fv"
  | "ee"
  | "th"
  | "chjsh"
  | "u"
  | "qw";

export const mouthSrc = (m: MouthId): string => `/mouths/${m}.png`;

export const ALL_MOUTHS: readonly MouthId[] = [
  "aei", "o", "cdnstxyz", "gk", "l", "bmp", "fv", "ee", "th", "chjsh", "u", "qw",
];

/* ------------------------------------------------------------------ */
/* Phonemes                                                             */
/* ------------------------------------------------------------------ */

export type PhonemeId =
  // short vowels — the five sounds the vowel letters teach
  | "a" | "e" | "i" | "o" | "u"
  // long vowels, diphthongs and r-coloured vowels the word bank needs
  | "ay" | "ee" | "igh" | "oa" | "oo" | "uu" | "ow" | "aw"
  | "ar" | "or" | "er" | "air" | "yoo"
  // consonants
  | "b" | "d" | "f" | "g" | "h" | "j" | "k" | "l" | "m" | "n" | "p" | "r"
  | "s" | "t" | "v" | "w" | "y" | "z"
  | "sh" | "ch" | "th" | "dh" | "ng" | "ks" | "kw" | "ts";

export interface Phoneme {
  id: PhonemeId;
  /** IPA, for a teacher reading the source and for the voice QA. */
  ipa: string;
  mouth: MouthId;
  /** An example word a teacher would say it with, for the studio. */
  as: string;
}

const P = (id: PhonemeId, ipa: string, mouth: MouthId, as: string): Phoneme => ({
  id,
  ipa,
  mouth,
  as,
});

export const PHONEMES: Readonly<Record<PhonemeId, Phoneme>> = {
  a: P("a", "æ", "aei", "cat"),
  e: P("e", "ɛ", "aei", "bed"),
  i: P("i", "ɪ", "aei", "sit"),
  o: P("o", "ɑ", "o", "dog"),
  u: P("u", "ʌ", "u", "sun"),
  ay: P("ay", "eɪ", "aei", "cake"),
  ee: P("ee", "iː", "ee", "tree"),
  igh: P("igh", "aɪ", "aei", "bike"),
  oa: P("oa", "oʊ", "o", "boat"),
  oo: P("oo", "uː", "qw", "moon"),
  uu: P("uu", "ʊ", "u", "book"),
  ow: P("ow", "aʊ", "o", "house"),
  aw: P("aw", "ɔ", "o", "ball"),
  ar: P("ar", "ɑɹ", "o", "car"),
  or: P("or", "ɔɹ", "o", "door"),
  er: P("er", "ɝ", "u", "bird"),
  air: P("air", "ɛɹ", "aei", "bear"),
  yoo: P("yoo", "juː", "qw", "music"),
  b: P("b", "b", "bmp", "bed"),
  d: P("d", "d", "cdnstxyz", "dog"),
  f: P("f", "f", "fv", "fish"),
  g: P("g", "ɡ", "gk", "girl"),
  h: P("h", "h", "aei", "hat"),
  j: P("j", "dʒ", "chjsh", "jump"),
  k: P("k", "k", "gk", "cat"),
  l: P("l", "l", "l", "lion"),
  m: P("m", "m", "bmp", "moon"),
  n: P("n", "n", "cdnstxyz", "nose"),
  p: P("p", "p", "bmp", "pin"),
  // The English R is the one Hebrew speakers get wrong most persistently (a
  // uvular ר). Its mouth is the rounded one on purpose: "round lips, not the
  // back of the throat" is the correction, and the picture says it.
  r: P("r", "ɹ", "qw", "red"),
  s: P("s", "s", "cdnstxyz", "sun"),
  t: P("t", "t", "cdnstxyz", "tip"),
  v: P("v", "v", "fv", "van"),
  w: P("w", "w", "qw", "water"),
  y: P("y", "j", "cdnstxyz", "yellow"),
  z: P("z", "z", "cdnstxyz", "zebra"),
  sh: P("sh", "ʃ", "chjsh", "fish"),
  ch: P("ch", "tʃ", "chjsh", "chair"),
  th: P("th", "θ", "th", "thank"),
  dh: P("dh", "ð", "th", "the"),
  ng: P("ng", "ŋ", "gk", "morning"),
  ks: P("ks", "ks", "cdnstxyz", "box"),
  kw: P("kw", "kw", "qw", "queen"),
  ts: P("ts", "ts", "cdnstxyz", "pizza"),
};

export const PHONEME_IDS = Object.keys(PHONEMES) as PhonemeId[];

/**
 * The sound each LETTER teaches on its own — what the letter lesson, the
 * sound quiz and a stray keypress all play. C and K share /k/; X and Q teach
 * the pair they nearly always make.
 */
export const LETTER_PHONEME: Readonly<Record<string, PhonemeId>> = {
  A: "a", B: "b", C: "k", D: "d", E: "e", F: "f", G: "g", H: "h", I: "i",
  J: "j", K: "k", L: "l", M: "m", N: "n", O: "o", P: "p", Q: "kw", R: "r",
  S: "s", T: "t", U: "u", V: "v", W: "w", X: "ks", Y: "y", Z: "z",
};

export function letterPhoneme(letter: string): PhonemeId | undefined {
  return LETTER_PHONEME[letter.toUpperCase()];
}

export function letterMouth(letter: string): MouthId | undefined {
  const ph = letterPhoneme(letter);
  return ph ? PHONEMES[ph].mouth : undefined;
}

/* ------------------------------------------------------------------ */
/* Segmentations                                                        */
/* ------------------------------------------------------------------ */

/**
 * One piece of a word: which letters, and the sound they make together here.
 * `ph` is null for a letter that is written but not said.
 */
export interface Segment {
  /** Index of the first letter of this grapheme in the word. */
  start: number;
  /** The letters, uppercase, e.g. "SH". */
  letters: string;
  ph: PhonemeId | null;
}

/**
 * Every word the app sounds out, as `grapheme:phoneme` pairs. `_` marks a
 * silent letter. Checked against the spelling when the table is parsed, so a
 * typo here fails loudly instead of highlighting the wrong letters.
 *
 * Covers every word a child builds, every letter's example word, and every
 * word inside a sentence — so typing a sentence plays the right sound for
 * each letter too, not just typing a word.
 */
const TABLE: Record<string, string> = {
  /* built words ---------------------------------------------------- */
  SIT: "s:s i:i t:t",
  PIN: "p:p i:i n:n",
  ANT: "a:a n:n t:t",
  MAP: "m:m a:a p:p",
  PAN: "p:p a:a n:n",
  SAD: "s:s a:a d:d",
  DAD: "d:d a:a d:d",
  MAN: "m:m a:a n:n",
  NAP: "n:n a:a p:p",
  TIP: "t:t i:i p:p",
  PIG: "p:p i:i g:g",
  TAP: "t:t a:a p:p",
  KID: "k:k i:i d:d",
  DOG: "d:d o:o g:g",
  CAT: "c:k a:a t:t",
  SUN: "s:s u:u n:n",
  CUP: "c:k u:u p:p",
  RED: "r:r e:e d:d",
  BUS: "b:b u:u s:s",
  HAT: "h:h a:a t:t",
  BED: "b:b e:e d:d",
  CAR: "c:k ar:ar",
  VAN: "v:v a:a n:n",
  EGG: "e:e gg:g",
  DUCK: "d:d u:u ck:k",
  BOOK: "b:b oo:uu k:k",
  FROG: "f:f r:r o:o g:g",
  FISH: "f:f i:i sh:sh",
  HAND: "h:h a:a n:n d:d",
  MOON: "m:m oo:oo n:n",
  DOOR: "d:d oor:or",
  CAKE: "c:k a:ay k:k e:_",
  APPLE: "a:a pp:p le:l",
  WATER: "w:w a:aw t:t er:er",
  HOUSE: "h:h ou:ow s:s e:_",
  TREE: "t:t r:r ee:ee",
  STAR: "s:s t:t ar:ar",
  PIZZA: "p:p i:ee zz:ts a:u",
  ZEBRA: "z:z e:ee b:b r:r a:u",
  BALL: "b:b a:aw ll:l",
  LION: "l:l i:igh o:u n:n",
  QUEEN: "qu:kw ee:ee n:n",
  BOX: "b:b o:o x:ks",
  YELLOW: "y:y e:e ll:l ow:oa",
  SCHOOL: "s:s ch:k oo:oo l:l",
  FRIEND: "f:f r:r ie:e n:n d:d",
  FAMILY: "f:f a:a m:m i:u l:l y:ee",
  JUMP: "j:j u:u m:m p:p",
  MILK: "m:m i:i l:l k:k",
  BIRD: "b:b ir:er d:d",
  SNAKE: "s:s n:n a:ay k:k e:_",
  HORSE: "h:h or:or s:s e:_",
  SHEEP: "sh:sh ee:ee p:p",
  MOUSE: "m:m ou:ow s:s e:_",
  BEAR: "b:b ear:air",
  MONKEY: "m:m o:u n:ng k:k ey:ee",
  ELEPHANT: "e:e l:l e:u ph:f a:u n:n t:t",
  BUTTERFLY: "b:b u:u tt:t er:er f:f l:l y:igh",
  FLOWER: "f:f l:l ow:ow er:er",
  CLOUD: "c:k l:l ou:ow d:d",
  SNOW: "s:s n:n ow:oa",
  BEACH: "b:b ea:ee ch:ch",
  CHAIR: "ch:ch air:air",
  TABLE: "t:t a:ay b:b le:l",
  WINDOW: "w:w i:i n:n d:d ow:oa",
  CLOCK: "c:k l:l o:o ck:k",
  PHONE: "ph:f o:oa n:n e:_",
  SHOES: "sh:sh oe:oo s:z",
  SHIRT: "sh:sh ir:er t:t",
  BREAD: "b:b r:r ea:e d:d",
  CHEESE: "ch:ch ee:ee s:z e:_",
  BANANA: "b:b a:u n:n a:a n:n a:u",
  COOKIE: "c:k oo:uu k:k ie:ee",
  CANDY: "c:k a:a n:n d:d y:ee",
  JUICE: "j:j ui:oo c:s e:_",
  TRAIN: "t:t r:r ai:ay n:n",
  PLANE: "p:p l:l a:ay n:n e:_",
  BOAT: "b:b oa:oa t:t",
  BIKE: "b:b i:igh k:k e:_",
  BALLOON: "b:b a:u ll:l oo:oo n:n",
  MUSIC: "m:m u:yoo s:z i:i c:k",
  TEACHER: "t:t ea:ee ch:ch er:er",
  MOM: "m:m o:o m:m",
  BABY: "b:b a:ay b:b y:ee",

  /* letters' example words ---------------------------------------- */
  GIRL: "g:g ir:er l:l",
  ICE: "i:igh c:s e:_",
  KEY: "k:k ey:ee",
  NOSE: "n:n o:oa s:z e:_",
  ORANGE: "or:or a:i n:n ge:j",
  RAIN: "r:r ai:ay n:n",
  UMBRELLA: "u:u m:m b:b r:r e:e ll:l a:u",

  /* words that only appear inside sentences ----------------------- */
  I: "i:igh",
  A: "a:u",
  RUN: "r:r u:u n:n",
  SEE: "s:s ee:ee",
  READ: "r:r ea:ee d:d",
  DOWN: "d:d ow:ow n:n",
  LOOK: "l:l oo:uu k:k",
  HERE: "h:h e:ee r:r e:_",
  HI: "h:h i:igh",
  GOOD: "g:g oo:uu d:d",
  NIGHT: "n:n igh:igh t:t",
  MORNING: "m:m or:or n:n i:i ng:ng",
  MY: "m:m y:igh",
  THE: "th:dh e:u",
  BIG: "b:b i:i g:g",
  AM: "a:a m:m",
  HAPPY: "h:h a:a pp:p y:ee",
  SEVEN: "s:s e:e v:v e:u n:n",
  LIKE: "l:l i:igh k:k e:_",
  LOVE: "l:l o:u v:v e:_",
  YOU: "y:y ou:oo",
  CAN: "c:k a:a n:n",
  WANT: "w:w a:o n:n t:t",
  THIS: "th:dh i:i s:s",
  IS: "i:i s:z",
  FUN: "f:f u:u n:n",
  WHAT: "wh:w a:u t:t",
  HOW: "h:h ow:ow",
  ARE: "ar:ar e:_",
  THANK: "th:th a:a n:ng k:k",
  COME: "c:k o:u m:m e:_",
  WITH: "w:w i:i th:th",
  ME: "m:m e:ee",
  AT: "a:a t:t",
  HAVE: "h:h a:a v:v e:_",
  HOT: "h:h o:o t:t",
  BLACK: "b:b l:l a:a ck:k",
  NICE: "n:n i:igh c:s e:_",
  TO: "t:t o:oo",
  WE: "w:w e:ee",
  GO: "g:g o:oa",
  PLEASE: "p:p l:l ea:ee s:z e:_",
  GIVE: "g:g i:i v:v e:_",
};

function parse(word: string, spec: string): Segment[] {
  const out: Segment[] = [];
  let start = 0;
  for (const token of spec.trim().split(/\s+/)) {
    const [letters, ph] = token.split(":");
    if (!letters || ph === undefined) throw new Error(`phonics: bad token "${token}" in ${word}`);
    const up = letters.toUpperCase();
    if (word.slice(start, start + up.length) !== up) {
      throw new Error(`phonics: "${spec}" does not spell ${word} (at "${up}")`);
    }
    if (ph !== "_" && !(ph in PHONEMES)) {
      throw new Error(`phonics: unknown phoneme "${ph}" in ${word}`);
    }
    out.push({ start, letters: up, ph: ph === "_" ? null : (ph as PhonemeId) });
    start += up.length;
  }
  if (start !== word.length) throw new Error(`phonics: "${spec}" is short of ${word}`);
  return out;
}

const SEGMENTS: ReadonlyMap<string, readonly Segment[]> = new Map(
  Object.entries(TABLE).map(([word, spec]) => [word, parse(word, spec)]),
);

/** True when this word has a hand-checked segmentation. */
export function hasSegments(word: string): boolean {
  return SEGMENTS.has(word.toUpperCase());
}

/**
 * The word, piece by piece. A word nobody has segmented yet falls back to one
 * letter per piece with each letter's own sound — never right for a digraph,
 * but never silent either, and `hasSegments` lets a test find the gap.
 */
export function segmentsFor(word: string): readonly Segment[] {
  const up = word.toUpperCase();
  const known = SEGMENTS.get(up);
  if (known) return known;
  return up.split("").map((letters, start) => ({
    start,
    letters,
    ph: letterPhoneme(letters) ?? null,
  }));
}

/**
 * The sound the letter at `index` makes inside `word` — what a keypress plays
 * while that word is being built. A silent letter answers null.
 */
export function phonemeAt(word: string, index: number): PhonemeId | null {
  const seg = segmentsFor(word).find(
    (s) => index >= s.start && index < s.start + s.letters.length,
  );
  return seg?.ph ?? null;
}

/**
 * WHAT A KEYPRESS PLAYS while `word` is being typed, letter `index`.
 *
 * Letters sound out the way the word is built, one key at a time:
 *
 *   · a letter that completes its grapheme plays the grapheme's sound — the
 *     A of CAKE plays /eɪ/, the H of FISH plays /ʃ/;
 *   · a letter that only STARTS a grapheme plays its own sound, because that
 *     is all it is so far — the S of FISH plays /s/, and then the H turns it
 *     into /ʃ/. That is the lesson of a digraph, heard rather than explained;
 *   · a completing letter that would only repeat the sound just played (the U
 *     of QU, the H of the CH in SCHOOL) and a silent letter (the E of CAKE)
 *     answer null — the caller gives those a plain tick, not a phoneme.
 */
export function phonemeOnType(word: string, index: number): PhonemeId | null {
  const seg = segmentsFor(word).find(
    (s) => index >= s.start && index < s.start + s.letters.length,
  );
  if (!seg) return null;
  const last = seg.start + seg.letters.length - 1;
  if (index < last) return letterPhoneme(seg.letters[index - seg.start]!) ?? null;
  if (!seg.ph) return null;
  if (index > seg.start) {
    const before = letterPhoneme(seg.letters[index - seg.start - 1]!);
    if (before === seg.ph) return null;
  }
  return seg.ph;
}

/** Every word the table covers — for the voice catalogue and the tests. */
export const SEGMENTED_WORDS: readonly string[] = [...SEGMENTS.keys()];
