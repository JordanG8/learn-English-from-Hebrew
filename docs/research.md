# Research Basis for the App

**Audience:** the engineering team (who will hard-code these numbers) and the teacher (who has to believe them).
**Date:** August 2026.
**Scope:** teaching the English alphabet — letter names, letter sounds, letter shapes, and keyboard positions — to Hebrew-speaking Israeli children aged 7–12, plus a gated AI conversation mode.

A note on honesty before anything else. Some of these numbers rest on strong evidence (spacing, letter-name/letter-sound instruction, reward contingency). Some rest on weak or borrowed evidence and are essentially *defensible guesses* (the exact fluency gate for EFL learners, the new-word budget, streak mechanics). Every row in the Decisions table is tagged with a confidence level, and the final section lists everything we could not establish. **Please do not strip the confidence tags when these numbers get copied into code.** A guess that loses its label becomes a fact, and then nobody re-examines it.

---

## Decisions

Confidence key: **A** = multiple converging peer-reviewed studies or a meta-analysis; **B** = reasonable extrapolation from good evidence in an adjacent population or task; **C** = weak evidence, professional consensus, or our own judgement — treat as a starting parameter to be tuned against real data from real kids.

| Constant | Value | Justification (short) | Conf. |
|---|---|---|---|
| `TEACH_NAME_AND_SOUND` | `"together"` | Combined letter-name + letter-sound instruction beats sound-only for letter-sound acquisition (Piasta & Wagner 2010; Piasta, Purpura & Wagner 2010). | A |
| `NEW_LETTERS_PER_SESSION` | `2` (hard max `3`) | Classroom phonics norms are ~1 letter/week for beginning L1 readers; our learners are older, already literate in L1, and get many more reps/hour. 2/session is a deliberate acceleration, not a literature value. | C |
| `SESSION_LENGTH_MIN` | `10` for ages 7–9, `15` for ages 10–12 | Sustained-attention estimates for adult-directed tasks cluster at ~2–3 min per year of age; 10–15 min sits comfortably inside that with headroom for a bad day. | B |
| `SESSION_LENGTH_MAX_MIN` | `20` | Hard stop. Beyond this, benefit is unproven and the spacing literature says a second session tomorrow is worth more than 10 more minutes today. | B |
| `SESSIONS_PER_DAY_TARGET` | `1` (allow `2` if ≥ 3 h apart) | Distributed > massed practice, d ≈ 0.54 in real classrooms (Latimier et al. 2021; classroom meta-analysis 2025). Two sessions back-to-back is massing. | A |
| `TRIALS_PER_SESSION` | `24` (range 18–30) | Fits the session length at ~2–4 s/trial with feedback; not an evidence-derived number. | C |
| `TARGET_IN_SESSION_ACCURACY` | `0.85` | The "Eighty-Five Percent Rule" — optimal training error rate ≈ 15% for gradient-style learners (Wilson et al., *Nature Communications*, 2019). Use it to drive item selection difficulty. | B |
| `SPACING_INTERVALS_DAYS` | `[0 (same session, ≥5 intervening items), 1, 3, 7, 14, 30]` | Optimal gap ≈ 10–20% of the desired retention interval (Cepeda et al. 2008). For "remember it in 6 months," a 14–30 day terminal gap is right. | A |
| `SPACING_SHAPE` | `"expanding"` (multiplier ≈ 2.0) | Expanding is *not* proven superior to uniform (Latimier et al. 2021 meta-analysis found no schedule inherently better) — but expanding is cheaper in total reps for the same retention, and the moderator analysis mildly favours expanding at high repetition counts. Choose it for efficiency, not for magic. | B |
| `LAPSE_PENALTY` | drop back **2** steps, not to zero | No direct evidence. Avoids the demoralising full reset while still re-consolidating. Explicitly a guess. | C |
| `INTERLEAVE_MIN_DISTINCT_ITEMS` | `4` per drill block | Interleaving beats blocking for category/discrimination learning in children and adults (Chen et al. 2025; Kang 2016), and letter discrimination is exactly a discrimination task. | A |
| `BLOCK_ON_FIRST_INTRODUCTION` | `true` (first 3 exposures blocked, then interleave) | Children benefit less from interleaving than adults do; a short blocked introduction reduces early failure before switching to interleaved retrieval. | B |
| `MASTERY_ACCURACY` | `0.90` per letter across the mastery window | Aligns with common mastery-learning and BKT operating points (P(mastery) ≥ 0.95 is standard in tutoring systems; observed accuracy 0.90 is the behavioural analogue). | B |
| `MASTERY_SESSIONS` | `3` | Must be demonstrated in 3 separate sessions… | B |
| `MASTERY_DISTINCT_DAYS` | `3` | …on 3 distinct calendar days. Guards against a single lucky session; consistent with spaced-retrieval evidence that same-day performance overstates learning. | A |
| `MASTERY_MEDIAN_LATENCY_MS` | `2000` (recognition: see letter → say/choose name or sound) | Automaticity, not just accuracy, is the thing that transfers. 2 s is the round number below which responses are plausibly retrieved rather than reasoned; not a literature-derived threshold. | C |
| `MASTERY_MEDIAN_LATENCY_KEYBOARD_MS` | `3000` (see letter → press correct key) | Motor search adds time; loosened by 1 s over recognition. Guess. | C |
| `MASTERY_FLUENCY_LPM` | `30` correct letters per minute (naming, all 26, mixed case) | DIBELS 8 letter-naming-fluency benchmarks for L1 English are 42–59 cpm in K–1. We set a lower EFL-adjusted bar. **This specific number is our judgement, not a published EFL benchmark.** | C |
| `MASTERY_RETENTION_CHECK_DAYS` | `[7, 30]` | Mastery is only confirmed after a delayed check. Precision-teaching practice ("RESA": retention, endurance, stability, application) and the spacing literature both insist on delayed measurement. | B |
| `CONVERSATION_UNLOCK_RULE` | all 26 letters at `MASTERY_*` **plus** the day-7 retention check passed | The gate should be automaticity-based, not accuracy-based, or children will unlock chat while still decoding letter-by-letter. | B |
| `NEW_WORD_BUDGET_INITIAL` | `1` unknown word per turn | See §7. Derived from the 98% lexical-coverage threshold (Hu & Nation 2000): at a 20–40 token turn, 98% coverage means ~0–1 unknown words. | B |
| `NEW_WORD_BUDGET_MAX` | `3` unknown words per turn | Corresponds to ~95% coverage at a 40–60 token turn — the *minimal* comprehension threshold (Laufer & Ravenhorst-Kalovski 2010). Do not exceed. | B |
| `UNKNOWN_TOKEN_RATIO_MAX` | `0.05` (target `0.02`) | Same two thresholds expressed proportionally; use whichever binds first, the count or the ratio. | A |
| `NEW_WORD_BUDGET_SCALING` | +1 per 250 mastered lexicon items, capped at 3 | Scaling rule is invented. The *thresholds* are evidenced; the *ramp* is not. | C |
| `REWARD_CONTINGENCY` | `"effort_and_completion"`, never `"ability"` | Praise for intelligence/ability degrades persistence and post-failure performance vs praise for effort (Mueller & Dweck 1998). | A |
| `REWARD_SCHEDULE` | informational feedback on **every** trial; celebratory reward on a variable ratio, mean 1-in-5 | Tangible, expected, performance-contingent rewards undermine intrinsic motivation (d ≈ −0.28 to −0.40; Deci, Koestner & Ryan 1999). Unexpected/unpredictable rewards are the least corrosive category. | A (contingency) / C (the "1-in-5") |
| `LEADERBOARDS` | `false` | Social comparison is the extrinsic element most likely to convert a struggling child's motivation from mastery to performance-avoidance. Gamification meta-analyses find it lifts extrinsic more than intrinsic motivation. | B |
| `STREAK_ENABLED` | `true`, but `STREAK_RESET_ON_MISS = false` | Streaks work via loss aversion; a hard reset at day 60 is a churn event. Decay the streak (e.g. −1 per missed day) rather than zeroing it. **All streak evidence found was industry blog data, not peer-reviewed.** | C |
| `STREAK_FREEZES_PER_MONTH` | `2` | Same caveat — vendor data only. | C |
| `HANDWRITING_STEP_REQUIRED` | `true` — every new letter includes a finger/stylus trace-and-write step before keyboard practice | Handwriting beats typing for letter recognition, word writing and decoding in children (Longcamp et al. 2005; James & Engelhardt 2012; Ibaibarriaga et al. 2025). On-screen tracing is a compromise; see §6 for the honest caveat. | A (handwriting > typing) / C (that *on-screen* tracing preserves the benefit) |
| `TOUCH_TYPING_HOME_ROW_MIN_AGE` | `9` (Grade 3–4) | Formal keyboarding gains are largest in upper elementary; below that, supervision cost is high and hunt-and-peck is not harmful at this stage. | B |
| `TYPING_WPM_TARGET_BY_GRADE` | `5 × grade` (Gr 3 ≈ 15, Gr 5 ≈ 25) | Widely used practitioner heuristic. **Not peer-reviewed** — sourced from keyboarding-curriculum vendors. | C |
| `PRIORITY_CONFUSION_PAIRS_SHAPE` | `b/d`, `p/q`, `b/p`, `d/q`, `n/u`, `m/w`, `g/q`, `i/j`, `I/l/1`, `O/0` | Mirror-image letter pairs are the documented hard case, caused by mirror invariance in the visual word form area (Dehaene et al. 2010; Fernandes & Kolinsky 2013–2016). Not Hebrew-specific — universal. | A |
| `PRIORITY_CONFUSION_PAIRS_SOUND` | `/θ/–/t/–/s/`, `/ð/–/d/–/z/`, `/w/–/v/`, `/æ/–/e/`, `/ɪ/–/iː/`, `/ʌ/–/ɔ/`, `/ŋ/–/n/` | Modern Hebrew lacks /θ ð w ŋ/ and has a 5-vowel system against English's ~11–15 monophthongs+diphthongs. | B |
| `PRIORITY_LETTER_NAMES_HARD` | `W`, `H`, `Y`, `R`, `Q`, plus the VC-name set `F L M N S X` | Hebrew letter names are acrophonic (*alef, bet, gimel, dalet* start with their sound). English breaks this for the VC-named letters and breaks it spectacularly for W ("double-u"), H ("aitch"), Y ("why"). See §1 — this is our inference, flagged as such. | C |
| `CASE_PAIRS_TAUGHT_EXPLICITLY` | `true` — all 26 upper/lower pairs drilled as pairs | Hebrew has **no letter case**. 52 shapes mapping to 26 identities is a genuinely novel concept for this L1, unlike for European-language L1s. | B (the linguistic fact is certain; the pedagogical response is judgement) |
| `LANGUAGE_SWITCH_DRILL` | Alt+Shift drilled as its own item, in the same spaced queue as letters | No research exists on dual-script keyboard acquisition (we looked). Treat it as a motor item like any other. | C |
| `UI_LANGUAGE` | Hebrew for instructions, English only for target items | Consistent with the Israeli curriculum's staged approach (extensive listening/speaking before reading and writing at Pre-Foundation). | B |

---

## 1. L1 Hebrew → L2 English alphabet transfer

### What actually differs between the two systems

**Directionality.** Hebrew runs right-to-left; English left-to-right. Israeli bidirectional readers are not naive here — studies comparing monolingual Hebrew, monolingual Italian and Hebrew–English bidirectional readers find bidirectional readers show a more symmetrical, more flexible exploration of visual space rather than a fixed bias, and letter-report scanning direction turns out to be largely *stimulus-driven*: subjects start from the upper-left for English letters and the upper-right for Hebrew letters regardless of native language (Sekuler & Nelson-type letter-report work; Afsari et al. 2016; Rinaldi et al. 2014). **Practical implication: directionality is real but is probably not the main barrier**, and Israeli children get LTR motor practice already (Hebrew digits are written LTR). Do not over-invest in directionality drills.

**Abjad vs alphabet.** Hebrew is an abjad: consonants are the letters, vowels are optional diacritics (*niqqud*). Israeli children learn to read with niqqud (a shallow, near-transparent system) and then have the vowels removed, at which point Hebrew becomes deep and heavily homographic, requiring morphological analysis to disambiguate — which slows reading even for native adults (Frost's work on Hebrew word recognition; MDPI *Education Sciences* 2024 review of learning to read Hebrew and Arabic). The consequence for English: **a Hebrew L1 child arrives with a strong prior that vowels are secondary, decorative, and inferable from context.** English vowels are none of those things. This predicts vowel errors will dominate, and it matches what is observed — Hebrew-speaking EFL learners struggle specifically with vowel digraphs `<ee> <oo>`, silent `<e>`, and consonant digraphs absent from Hebrew such as `<th>` (Russak & Kahn-Horwitz's EFL spelling studies with Israeli Grade 5/8/10 students; Kahn-Horwitz & Goldstein 2024).

**Orthographic depth.** Pointed Hebrew is shallow; English is the deepest major alphabetic orthography. The L1-depth effect is documented: readers deploy L1 orthographic processing strategies when reading L2, and shallow-L1 backgrounds produce different L2 word-recognition time courses. A child trained on a near-one-to-one grapheme–phoneme system will over-apply one-to-one mapping in English and be repeatedly punished for it.

**No letter case.** Hebrew has no uppercase/lowercase distinction. (It has five *sofit* final forms, so positional shape variation is not alien, but "same letter, two entirely different glyphs, chosen by grammatical position in a sentence" is.) English asks the child to learn 52 shapes mapping onto 26 identities. This is a bigger conceptual load for Hebrew L1 than for, say, Russian or Greek L1. We could find **no study quantifying this specific difficulty for Hebrew speakers** — we are reasoning from the linguistic facts.

**Letter names are acrophonic in Hebrew, inconsistently so in English.** *Alef, bet, gimel, dalet, kaf, lamed, mem, nun, samech, pe, resh, shin, tav* — the Hebrew letter name begins with the letter's sound. English does this for the CV-named letters (B "bee", D "dee", T "tee") and the VC-named letters put the sound at the *end* (F "ef", L "el", M "em", N "en", S "es", X "ex"). Three letters give no useful cue at all: **W** ("double-u" — contains no /w/), **H** ("aitch"), **Y** ("why"). Letter-name knowledge helps children infer letter sounds precisely *because* names usually contain the sound (Treiman's work; Foulin 2005) — so the letters where the cue fails are predictably the letters that lag. **This ranking is our inference from general letter-name research plus Hebrew's acrophonic naming, not a Hebrew-specific finding. Flagged.**

**Phoneme inventory gaps.** Modern Hebrew has a five-vowel system (/i e a o u/) against English's roughly 11–15 vowel contrasts. Absent English consonants include /θ/, /ð/, /w/ (Hebrew *vav* is /v/), and /ŋ/ as a phoneme. Documented Hebrew-accent substitutions include /w/ → /v/ and /θ/ → /t/ or /s/. **Caveat: the accessible sources describing the substitution set in detail were accent-coaching sites, not peer-reviewed phonetics papers.** The inventory facts themselves are uncontroversial; the ranked severity of each substitution is not something we could source properly.

**Mirror confusion (b/d/p/q) is universal, not Hebrew-specific.** Learning to read requires *unlearning* the brain's built-in mirror invariance — a property of the visual word form area shared with other primates and present in illiterates. Children make transient mirror errors that largely resolve by about age 8 (Dehaene, Nakamura et al., *NeuroImage* 2010; Fernandes & Kolinsky, *Psychonomic Bulletin & Review* 2014 and *Journal of Experimental Child Psychology* 2016; Pegado et al.). Our 7-year-olds are in the window where these errors are developmentally normal; our 11-year-olds are not, and persistent reversals in an 11-year-old are worth surfacing to the teacher rather than just re-drilling. Note Hebrew has its own mirror-ish pairs (ב/כ, ד/ר, ג/נ) so the *phenomenon* is familiar; the specific English pairs are not.

### Ranked difficulty list

The literature does **not** supply a validated difficulty ranking of English letters for Hebrew L1 speakers. Nobody has published one. What follows is our synthesis, and should be treated as a **hypothesis to test with our own telemetry**, which is exactly the kind of data this app will generate.

**Tier 1 — expect the most failure**
1. Vowel letters and their multiple sounds: `a e i o u` (five letters, ~15 sounds; the abjad prior works directly against this)
2. `W` — novel phoneme /w/, plus a name that hides it
3. `Th` as a digraph and the phonemes /θ/ /ð/
4. Mirror pairs as shapes: `b/d`, `p/q`

**Tier 2 — moderate**
5. `H` and `Y` (opaque names; /h/ is often weak in Hebrew speech)
6. VC-named letters `F L M N S X` (name–sound cue points the wrong way)
7. `R` (English /ɹ/ vs Hebrew's uvular /ʁ/ — an articulatory retrain, not just a mapping)
8. `C` and `G` (soft/hard alternation — no Hebrew analogue)
9. Case pairs whose glyphs are unrelated: `Aa Bb Dd Ee Gg Hh Nn Qq Rr Tt`

**Tier 3 — should come relatively easily**
10. Letters with a near-identical Hebrew phoneme and a transparent CV name: `B D T K P F M N S L Z V J`
11. Case pairs with near-identical glyphs: `Cc Oo Ss Vv Ww Xx Zz Kk Pp Uu`

Design consequence: **sequence introduction by Tier 3 → Tier 2 → Tier 1 for early wins, but ensure Tier 1 items get roughly double the total repetitions across the whole course.**

---

## 2. Letter names vs letter sounds

**Answer: teach them together, and do not spend engineering effort on the sequencing question.**

Piasta & Wagner's meta-analysis of alphabet instruction (2010) found small-to-moderate effects overall, with effects differing by outcome type and instructional content; the associated experimental work (Piasta, Purpura & Wagner 2010, *Reading and Writing*) found **combined letter-name-and-sound instruction produced better letter-sound acquisition than sound-only instruction.** That is the cleanest available answer to the question and it points to "together."

Why it works: letter names are a scaffold to letter sounds because most names contain the sound. Foulin (2005, *Reading and Writing*, "Why is letter-name knowledge such a good predictor of learning to read?") lays out the mechanism — name knowledge gives phonological access to the letter, and letter-name knowledge and phonological awareness grow bidirectionally, each predicting growth in the other (Lerner & Lonigan 2016). But the *sound* is what does the work in decoding: letter-sound knowledge has the closest relationship to decoding skill and is among the strongest single predictors of later reading, alongside phoneme awareness and rapid automatised naming (Hulme et al. 2019, *Scientific Studies of Reading*).

**Does the answer change for an L2 learner already literate in L1?** Partly, and this matters for us.

- Our children already have the *alphabetic principle* — they know marks map to sounds. They are not being taught to read; they are being taught a second symbol set. That should make this much faster than L1 alphabet acquisition, and it is why we set `NEW_LETTERS_PER_SESSION = 2` rather than the classroom's 1/week.
- However, DIBELS itself notes that letter-naming fluency is an *indicator of risk*, not an instructional target — it does not correspond to a core early-literacy "big idea." For an L2 learner this is even more true: knowing that the shape `R` is called "ar" has near-zero communicative value; knowing it says /ɹ/ has enormous value. **So: teach names and sounds together, but weight assessment toward sounds, and treat name knowledge as the scaffold rather than the goal.**
- One L2-specific reason to keep names: the child will need to spell aloud, read acronyms, and — relevant here — talk to a teacher about "the letter R". Names are social currency in an English classroom.
- The Israeli Ministry of Education's Pre-Foundation guidance is that instruction should establish aural/oral skills, with **at least two months of extensive listening and speaking before reading and writing are introduced.** Our app inverts this (it is explicitly a drilling tool for shapes and keys). We should say so plainly to the teacher rather than pretend alignment: the app is a *supplement* to oral work, not a replacement for it, and it will be used by children who have already had that oral exposure in class.

---

## 3. Mastery criterion

This is the number that gates conversation mode, so here is the reasoning in full, including where it stops being evidence and starts being us.

**What the literature actually offers, and what it doesn't.** There is no published, agreed "the child knows the alphabet" threshold. What exists is three separate traditions:

1. **Fluency benchmarks (DIBELS).** DIBELS 8th Edition letter-naming-fluency goals: Kindergarten 25/37/42 correct letters per minute (beginning/middle/end of year), Grade 1 42/57/59. These are norms for L1-English children, administered on paper by an adult. Crucially, DIBELS itself declines to treat LNF as an instructional target — it is a screening indicator of risk, and the classification is percentile-based (below 20th percentile = at risk; above 40th = low risk), not a mastery criterion.
2. **Precision teaching / fluency-building.** This tradition is the most directly useful because it insists on the accuracy-vs-automaticity distinction: "a skill performed at 80% accuracy may seem mastered, but if it takes too long to execute, it's not fluent." Published letter-sound fluency aims in this literature sit around **60–100 correct per minute** for see/say letter sounds. Precision teaching also demands that fluency be checked for **retention** (does it survive a delay), **endurance** (does it survive a longer session) and **application** (does it transfer to the composite skill) before mastery is claimed.
3. **Computational mastery models (Bayesian Knowledge Tracing).** The standard operating threshold in intelligent tutoring systems is **P(mastery) ≥ 0.95**, chosen largely to avoid over-practice; recent educational-data-mining work (EDM 2025, "How Much Mastery is Enough Mastery?") argues thresholds as high as **0.98** better support performance on subsequent material.

**Our rule.** Combining these, a letter is mastered when *all* of the following hold:

```
per-letter mastery:
  accuracy            >= 0.90   across the mastery window
  sessions            >= 3
  distinct days       >= 3
  median latency      <= 2000 ms  (recognition: name and sound)
  median latency      <= 3000 ms  (keyboard: locate and press)
  last 3 responses     = all correct

alphabet mastery (gates conversation mode):
  all 26 letters individually mastered, AND
  mixed-case naming fluency >= 30 correct letters per minute, AND
  a delayed retention probe at day 7 passed at >= 0.90 accuracy
  (a day-30 probe is also run, but for teacher reporting, not for gating)
```

**Where each piece comes from, honestly:**
- `0.90 / 3 sessions / 3 distinct days` — the accuracy figure is the behavioural analogue of the BKT 0.95 convention; the multi-day requirement is solidly grounded, because spaced-retrieval research shows same-session performance systematically overstates durable learning (Latimier et al. 2021 meta-analysis, g = 0.74 for spaced over massed retrieval).
- `30 letters/minute` — **this is our number, not the literature's.** It is set roughly 30% below the L1 Grade-1 DIBELS end-of-year benchmark (59), on the reasoning that EFL learners with less English oral exposure will name more slowly, and that a screen-and-microphone (or screen-and-tap) administration is slower than an adult with a stopwatch. **If our telemetry shows children clearing 30 lpm while still failing the retention probe, raise it.** Do not defend this number in front of anyone as evidence-based.
- `2000 ms / 3000 ms` — round numbers. Not from any paper. The *principle* (that automaticity, not accuracy, is what should gate the next stage) is very well supported; the specific milliseconds are not.
- The **day-7 retention probe as part of the gate** is the piece we would defend hardest. It is cheap, it is directly grounded in both precision teaching's retention requirement and the spacing literature, and it is the single strongest protection against a child unlocking chat on the strength of a good week.

**Recommendation to the teacher:** report the fluency number and the retention-probe result separately in the teacher dashboard. They are different facts about the child and a single "mastered ✓" hides which one is shaky.

---

## 4. Spacing and retrieval schedule

**Does adult SRS transfer to 7–12-year-olds?** Partially, and the honest answer is "the spacing effect transfers; the specific adult interval algorithms do not."

The spacing effect is documented across the lifespan, "from children to healthy aging and individuals with memory impairments." In real primary-school classrooms, retrieval practice enhances learning whether distributed or not, and a 2025 meta-analysis of applied classroom research found distributed practice beats massed practice at **d = 0.54, 95% CI [0.31, 0.77]** — a solid, real-world-sized effect. Sobel, Cepeda & Kapler (2011, *Applied Cognitive Psychology*) tested this directly with **fifth graders learning unfamiliar English vocabulary** and found the spacing benefit held in a real classroom. That is about as close to our population and task as the literature gets.

What does *not* transfer is Anki/SuperMemo-style interval scheduling. Those algorithms were tuned on self-motivated adults doing self-paced daily review over years. A 9-year-old will not open the app because an interval came due; the parent or the timetable decides. **So compute ideal intervals, but design for the child to arrive on an irregular schedule and to be handed whatever is most overdue.**

**Interval values.** Cepeda et al. (2008, *Psychological Science*, "Spacing Effects in Learning: A Temporal Ridgeline of Optimal Retention", n > 1350) is the anchor: the **optimal gap is roughly 10–20% of the desired retention interval** — about 20–40% for a one-week test delay, falling to 5–10% for a one-year delay. If we want a letter retained through a school year, gaps in the 2–4 week range at the tail are right. Hence `[same-session, 1, 3, 7, 14, 30]` days.

**Expanding vs uniform.** This is genuinely contested and the popular belief is wrong. Latimier, Peyre & Ramus (2021, *Educational Psychology Review*, meta-analysis of 29 studies / 54 effect sizes) found a strong benefit of *spacing* (g = 0.74) but **no evidence that any particular relative schedule — expanding, equal, or contracting — is inherently superior.** Karpicke & Bauernschmidt (2011) and Logan & Balota (2008) reach compatible conclusions. The one moderator worth knowing: the more exposures an item gets, the more expanding schedules pull ahead of uniform ones. Since our letters will get many exposures, **choose expanding — but for efficiency (fewer total reps for the same retention), not because it is more effective per rep.** If expanding complicates the implementation, uniform spacing is a defensible fallback and we should not pretend otherwise.

**Interleaving vs blocking.** Interleaving wins for this task. Letter learning is category/discrimination learning, and interleaving reliably beats blocking there — including in elementary-age children (Chen, Paas et al., *Journal of Intelligence* 2025, "Learning Natural Categories: Effects of Interleaving Practice in Children and Young Adults"; Kang 2016; Carvalho & Goldstone 2014). One important age qualification: in the 2025 study, **young adults benefited more from interleaving than children did**, and metacognitive monitoring differed by age. The practical read: interleave, but not from the very first exposure. Give a new letter ~3 blocked exposures to establish a trace, then throw it into the interleaved pool with at least 3 other items — and preferentially with its confusion partners, since discrimination is the whole point (`b` next to `d`, not `b` next to `k`).

**Session length and attention.** The commonly cited developmental heuristic is 2–3 minutes of sustained attention per year of age on adult-directed tasks (some sources say up to 5 min/year for intrinsically interesting activity), giving ~14–21 min at age 7 and ~24–36 min at age 12. **This heuristic is a practitioner rule of thumb repeated across clinical and parenting sources; we could not trace it to a primary experimental source.** Lifespan attention-span research exists (e.g. the 2023 *PNAS*-adjacent "Quantifying attention span across the lifespan") but does not hand us a session-length constant. We therefore set 10 min (7–9) / 15 min (10–12) with a 20-min hard cap — comfortably inside even the pessimistic estimate, and consistent with the spacing evidence that a second session tomorrow beats a longer session today.

**New items per session.** Systematic-phonics practice for beginning L1 readers is typically **one new letter per week**, with a review week every fourth week. Our learners are older, already alphabetically literate, and get far higher repetition density, so 1/week is far too slow. **2 new letters per session (max 3) is an acceleration we chose, not a number from the literature.** The evidence-backed part is the *review* structure: build in a review-only session every 4th session with no new items.

---

## 5. Reward structure

The teacher's instinct — that we want kids to eventually get the hit from learning itself — is exactly what the literature supports, and the literature also says the naive gamification playbook actively works against it.

**The core finding.** Deci, Koestner & Ryan (1999, *Psychological Bulletin*, meta-analysis of 128 experiments) found that **tangible, expected rewards significantly undermine free-choice intrinsic motivation**: engagement-contingent d = −0.40, completion-contingent d = −0.36, performance-contingent d = −0.28. Self-reported interest also dropped (d ≈ −0.15 to −0.17). This is the overjustification effect, and it is one of the better-replicated findings in motivation psychology (their 2001 *Review of Educational Research* follow-up reaffirmed it against Cameron & Pierce's critique). Rewards do the most damage precisely where the task was already interesting.

**But rewards are not uniformly bad.** The moderator structure matters enormously:
- **Verbal rewards / positive informational feedback do not undermine intrinsic motivation** and generally enhance it — they feed the competence need.
- **Unexpected rewards** undermine much less than expected ones (the child who isn't working *for* the star isn't displacing their motivation onto it).
- **Rewards for effort and completion** are safer than rewards for measured performance, which the child reads as a verdict on ability.

**Effort vs ability.** Mueller & Dweck (1998, *Journal of Personality and Social Psychology*, six experiments with fifth graders): children praised for intelligence, versus effort, subsequently chose performance goals over learning goals, and **after failure showed less persistence, less enjoyment, more low-ability attributions and worse performance.** They also came to describe intelligence as fixed. This is directly actionable copy guidance: `"You stuck with that one"` and `"Six days of practice"` — never `"You're so smart"` or `"You're great at letters!"`

**Gamification specifically.** Meta-analyses find gamification produces a small positive overall effect and **raises extrinsic motivation more than intrinsic** (Huang et al. 2020 behavioural-change meta-analysis, 35 interventions, ~2,500 participants; Xu et al. 2023, *ETR&D*, found gains in intrinsic motivation, autonomy and relatedness but **minimal impact on perceived competence**). The mechanism that predicts when it helps is self-determination theory: gamification supports intrinsic motivation when it serves **competence, autonomy and relatedness**, and corrodes it when it substitutes for them.

**Reinforcement schedules.** Variable-ratio schedules produce high, extinction-resistant response rates. That is well established in operant psychology and it is exactly why slot machines and social feeds use them. **We should use this carefully and in a limited way.** The same unpredictability that sustains engagement drives compulsive use, and building a compulsion loop for 7-year-olds is not an acceptable trade. Our position: **informational feedback on every single trial (fixed, immediate, non-tangible), and the celebratory layer — confetti, character reactions — on a variable ratio averaging 1-in-5.** The variable element decorates; it never carries the information about whether the child is learning.

### Design rules (implementable)

1. **Every trial gets immediate, specific, informational feedback.** Correct/incorrect plus what the right answer was. This is the non-negotiable, evidence-backed part.
2. **Never reward accuracy per se.** Reward showing up, finishing a session, and getting through hard items. `REWARD_CONTINGENCY = "effort_and_completion"`.
3. **All praise text is process-framed.** Ban "smart", "clever", "talented", "genius", "natural" from all copy, in both Hebrew and English. Add a lint rule if that's cheap.
4. **Celebration is unpredictable, mean 1-in-5.** Never predictable enough to be worked for, never absent enough to feel cold.
5. **No leaderboards, no public comparison.** Social comparison is the fastest route from mastery goals to performance-avoidance goals for the children who most need to stay engaged.
6. **Progress display is against the child's own past self.** "You knew 11 letters last week, 14 now" — competence-supporting, comparison-free.
7. **Give real autonomy.** Let the child choose which of 2–3 activities to do, or which letter to work on next from an overdue set. Autonomy support is the one SDT lever gamification meta-analyses find actually moves intrinsic motivation.
8. **Streaks: soft.** Decay, don't reset. Two freezes a month. Never send a guilt-framed notification ("Don't lose your streak!") to a child. **The streak evidence base is industry blog posts and vendor retention data — we found no peer-reviewed evidence on streak loss in children. This whole rule is judgement.**
9. **Plan a fade.** As a child approaches mastery, reduce the extrinsic layer and increase the "look what you can now do" layer (e.g. unlocking a real message they can read). The overjustification literature implies the rewards should be scaffolding, and scaffolding comes down.

---

## 6. Keyboarding and literacy

**The handwriting-vs-typing debate, reported honestly.** This is a live argument and the app has to make a choice, so here is both sides.

*The case for handwriting (currently the stronger side of the evidence):*
- Longcamp et al. (2005, *Acta Psychologica*) — preschoolers who learned letters by handwriting recognised them better than those who learned by typing.
- James & Engelhardt (2012, *Trends in Neuroscience and Education*) — in pre-literate children, the adult reading network (fusiform gyrus, posterior parietal, inferior frontal) was recruited during letter perception **only after handwriting practice**, not after typing or tracing.
- Ibaibarriaga, Acha & Perea (2025, *Journal of Experimental Child Psychology*) — 5–6-year-olds taught nine novel Georgian/Armenian letters and 16 pseudowords; the handwriting groups outperformed the typing groups on **every** posttest: letter recognition, word writing, and decoding. The authors conclude grapho-motor action is a key mechanism for building alphabetic and orthographic knowledge.
- Proposed mechanism: handwriting gives continuous sensorimotor feedback about letter *shape*; a keypress gives none. Producing a variable, effortful motor trace may be what forces shape abstraction.

*The case against over-reading that evidence:*
- Nearly all of this work is on **pre-literate 4–6-year-olds learning their first script.** Our users are 7–12 and already read fluently in Hebrew — they have already built the general visual-word-form machinery and mirror-invariance suppression. The handwriting advantage may be substantially about *building* that system, in which case it is less relevant to a second script.
- Effects are typically measured immediately after brief training, not on durable literacy outcomes months later.
- The James & Engelhardt result found no benefit for **tracing** either — which is uncomfortable for us, because on-screen finger tracing is the mechanism we can actually implement in a web app. Tracing a pre-drawn shape may not be the same act as producing one.
- The keyboarding side of the literature reports real gains too: formal keyboarding instruction produces significant speed and accuracy improvements versus controls across elementary grades, and typing is an essential access skill for children whose handwriting is impaired.
- Publication and framing bias is worth naming: "handwriting is better" is a popular result with substantial press amplification (the 2025 study drew broad coverage), which is not evidence against it but is a reason to weight the effect sizes rather than the headlines.

**Our position:** include a hand-production step for every new letter (finger or stylus, free-form production not just tracing a guide, with the guide fading across exposures), *and* tell the teacher plainly that the strongest evidence is for real pen-on-paper and that five minutes of paper letter-writing alongside the app is likely worth more than any on-screen substitute we can build. That is an honest recommendation even though it sends work outside our product.

**Age-appropriate typing instruction.** Should a 7-year-old learn home-row touch-typing? **Probably not; hunt-and-peck is fine at 7.** Formal keyboarding research finds the greatest speed and accuracy gains in **upper elementary**, and that younger students need much more time and supervision, making instruction less practical. Practitioner curricula converge on **Grade 3 (age 8–9)** as the earliest sensible start for technique, with roughly **ages 8–12** as the productive window — old enough for structured practice, young enough not to have cemented hunt-and-peck. **These recommendations come mostly from keyboarding-curriculum vendors and practitioner sources, not controlled trials.** Notably, the research literature is **missing** studies connecting touch-typing ability to writing quality over the past two decades — a striking gap given how confidently schools assert the link.

Speed targets: the widespread heuristic is **5 WPM × grade level** (Gr 1 ≈ 5, Gr 3 ≈ 15, Gr 5 ≈ 25, Gr 6 ≈ 30), with the US Common Core technology expectation around 15 WPM at Grade 3. **Vendor-sourced. Treat as rough targets for encouragement, never as a gate.** Accuracy should always be reported ahead of speed.

For our app specifically: the goal at ages 7–8 is **key location knowledge** — "where does the letter `k` live" — which is a spatial-associative task, not a technique task. That is a legitimate and well-defined learning target, it is drillable in the same spaced queue as letter names and sounds, and it does not require committing to home-row technique. Introduce home-row finger assignment as an optional track from age 9.

**Dual-script / bilingual keyboard learning.** We searched for this specifically and found **no academic literature on the cognitive aspects of learning to type in two scripts, and none at all on Hebrew–English dual-layout acquisition.** What exists is descriptive: SI-1452 overlays Hebrew on a QWERTY base, and switching is done through OS input-method toggles. Everything we do here — Alt+Shift drilling, how to teach that one physical key carries two identities, whether the Hebrew layout position of a key interferes with learning the Latin one — is unguided by evidence. We treat Alt+Shift as a motor item in the normal spaced queue and we will learn from our own data. **This is the single largest evidence gap in the whole document, and it is in the part of the app that is most novel.**

---

## 7. Comprehensible input and the `newWordBudget`

**Krashen, briefly and critically.** The Input Hypothesis says acquisition happens when learners understand input containing structures slightly beyond their current level — "i+1". It has been enormously influential and it is also the weakest-supported thing in this report. The standard critiques (McLaughlin 1987; Ellis; and more recently a 2025 *Frontiers in Psychology* neuro-ecological critique) are:

- **It is untestable as stated.** Neither "i" nor "+1" is operationally defined, so there is no way to falsify it, and no way for a teacher — or a piece of software — to compute the target.
- **Comprehensible input is necessary but not sufficient.** Output, interaction, feedback and attention to form all appear to matter.
- Related hypotheses in the same framework (acquisition/learning separation, the affective filter) lack empirical support.

**So we should not implement "i+1" — there is nothing to implement.** What we *can* implement is the empirically grounded successor idea: **lexical coverage thresholds.**

- Hu & Nation (2000, *Reading in a Foreign Language*) — **98% coverage** is where most learners achieve unassisted comprehension of a fiction text; **95%** is the point of minimally acceptable comprehension. Kremmel et al. (2023, *Language Learning*) replicated this.
- Laufer & Ravenhorst-Kalovski (2010, *Reading in a Foreign Language*) — proposed 95% as a minimal and 98% as an optimal threshold, with associated vocabulary-size estimates.
- Laufer (2020, *TESOL Quarterly*) extended this to how coverage interacts with inferencing unknown words.

Concretely: at 95% coverage a 1,000-word text has 50 unknown words; at 98% it has 20.

**Deriving `newWordBudget`.** Our chat turns will be short — realistically 15–40 tokens for a 7–12-year-old at Pre-A1/A1. Applying the thresholds directly:

| Turn length | 98% coverage (comfortable) | 95% coverage (minimum) |
|---|---|---|
| 20 tokens | 0.4 unknown words | 1.0 |
| 40 tokens | 0.8 | 2.0 |
| 60 tokens | 1.2 | 3.0 |

This yields **`newWordBudget = 1` per turn initially, hard ceiling 3**, with the proportional rule `UNKNOWN_TOKEN_RATIO_MAX = 0.05` applied as a second constraint (use whichever binds first). A turn of 15 tokens gets zero new words, not one.

Two important adjustments the coverage literature does not directly cover, which we should make anyway:

1. **Conversation is not reading.** The learner can ask, the AI can gloss, and Hebrew is available as a fallback. Interaction and negotiation of meaning are precisely what the post-Krashen literature says input alone lacks. A glossed new word in a conversational turn is easier than an unglossed one in a text — so a budget of 1–2 is likely conservative, in a good way.
2. **Repetition matters more than the budget.** Vocabulary-teaching research is consistent that the number of new words per lesson is far less important than how many times each is encountered — practitioner guidance converges on **8–10 meaningful encounters** per item, spread over time. **Design consequence: a word introduced in chat must be pushed into the spaced-repetition queue, and the AI should be instructed to re-use recently introduced words in subsequent turns.** This is a bigger lever than tuning the budget number, and it is cheap to build.

**Scaling.** We propose +1 to the budget per 250 mastered lexicon items, capped at 3. **The cap and the initial value are derived from the coverage thresholds; the ramp rate is invented.** A cleaner alternative worth considering: compute the budget dynamically from the actual token count of the turn and the child's measured known-lexicon coverage, so it self-adjusts, and keep the fixed constants only as clamps.

**One context number for the teacher:** the Israeli lexical syllabus (Laufer, *TESOL Quarterly*, on the construction and implementation of the Israeli lexical syllabus for Grades 4–12, CEFR Pre-A1–B2, implemented in textbooks from 2023) sets Band II learners at **at least 3,200 items including Bands I and II**. Band I is described as high-frequency foundation vocabulary expected to become productive by the end of elementary school. **We could not retrieve the exact Band I / Pre-Band I item count** — the Ministry PDFs were unreachable from this environment. Someone with browser access should pull `LexicalBand1.pdf` from the Ministry site and give us the real number, because our known-lexicon should be seeded from that list, not from a generic frequency list.

---

## Where the evidence is weak

Listed roughly in order of how much it should worry us.

1. **Dual-script keyboard learning: no evidence at all.** We searched specifically and found nothing academic on the cognitive aspects of learning to type in two scripts, and nothing whatsoever on Hebrew–English dual-layout acquisition or Alt+Shift switching. Everything in the keyboarding-plus-language-switching part of the app — arguably its most distinctive feature — is designed on first principles. **We are guessing.**

2. **The fluency gate (`30` letters/minute).** There is no published EFL letter-naming-fluency benchmark for Hebrew L1 children. We back-derived from DIBELS L1 norms with an arbitrary downward adjustment. This number gates conversation mode. It should be the first thing recalibrated once we have 50 children's data.

3. **The latency thresholds (2000 ms / 3000 ms).** Round numbers we chose. The principle that automaticity should gate progression is well-supported; these specific values are not.

4. **A ranked letter-difficulty list for Hebrew L1 speakers does not exist in the literature.** Our Tier 1/2/3 ranking is synthesised from Hebrew phonology, Hebrew's acrophonic letter naming, and EFL spelling-error studies with Israeli children. It is a hypothesis. The app will generate exactly the data needed to test it — we should instrument for that from day one.

5. **The acrophonic-letter-name argument (W, H, Y being hardest) is our inference.** Letter-name research shows names help because they contain the sound; Hebrew names are acrophonic; therefore English's name–sound mismatches should hurt Hebrew L1 learners disproportionately. Plausible, unverified.

6. **Streak mechanics.** Every source we found on streak loss, streak freezes and loss aversion in learning apps was an industry blog or vendor retention analysis. No peer-reviewed work on streaks in children was located. The freeze count, the decay rule and the ban on guilt notifications are all judgement calls informed by the overjustification literature rather than by streak-specific evidence.

7. **The "2–3 minutes of attention per year of age" heuristic.** Repeated everywhere in clinical and parenting sources; we could not trace it to a primary experimental study. Our session lengths are set conservatively inside it, so the risk of being wrong is low, but the number is folklore.

8. **`NEW_LETTERS_PER_SESSION = 2`.** Classroom phonics says 1 per *week* for L1 beginners. We chose 2 per *session* on the reasoning that already-literate older L2 learners can go much faster. That reasoning is sound but the specific rate is untested — watch for accuracy dropping below the 85% target, which is the signal to slow down.

9. **Typing WPM targets (5 × grade).** Vendor-sourced. Also: the research literature has a real gap — no studies in the last two decades connecting touch-typing ability to writing quality, despite schools asserting the link confidently.

10. **Whether on-screen tracing preserves the handwriting benefit.** The handwriting-over-typing evidence is good. But James & Engelhardt (2012) found *tracing* produced no reading-network recruitment either, which is the mechanism we can actually implement in a browser. We may be building a step that gets us the appearance of the handwriting benefit without the substance. Recommending real paper practice alongside the app is the honest mitigation.

11. **Whether handwriting findings generalise from pre-literate 4–6-year-olds learning a first script to already-literate 7–12-year-olds learning a second one.** Unstudied as far as we could find.

12. **`newWordBudget` ramp rate.** The 98%/95% coverage thresholds are solid and well-replicated. The "+1 per 250 mastered items" scaling is invented.

13. **The `1-in-5` variable-ratio celebration frequency.** The contingency principles behind it (unexpected > expected; effort > ability) are strongly evidenced. The specific ratio is not.

14. **Israeli Ministry of Education primary sources were not fully readable.** The network environment used for this research blocked direct document fetching from `meyda.education.gov.il`, `pop.education.gov.il`, `library.mevaker.gov.il` and several publisher sites, so Ministry curriculum claims here rest on search-result summaries and secondary sources rather than on our own reading of the PDFs. **Someone should verify the following directly before we build against them:** English is compulsory from Grade 3; the lexical syllabus covers Grades 4–12 at CEFR Pre-A1–B2; Pre-Foundation calls for ≥ 2 months of listening/speaking before reading and writing; Band II ≈ 3,200 cumulative items. And we still need the actual Pre-Band I / Band I word list to seed the chat lexicon.

---

## References

**L1/L2 transfer, Hebrew orthography and phonology**
- Learning to Read in Hebrew and Arabic: Challenges and Pedagogical Approaches. *Education Sciences* 14(7):765, 2024. https://www.mdpi.com/2227-7102/14/7/765
- Frost, R. Reading Consonants and Guessing Vowels: Visual Word Recognition in Hebrew Orthography. In *Advances in Psychology*. https://www.sciencedirect.com/science/article/abs/pii/S0166411508627879
- Start shallow and grow deep: The development of a Hebrew reading brain. *Neuropsychologia*, 2022. https://www.sciencedirect.com/science/article/abs/pii/S0028393222002354
- Memory representations are flexibly adapted to orthographic systems: A comparison of English and Hebrew. *Brain Research*, 2024. https://www.sciencedirect.com/science/article/abs/pii/S0006899324003810
- Russak, S. & Kahn-Horwitz, J. The contribution of cognitive and linguistic skills in L1 and EFL to English spelling among native speakers of Arabic and Hebrew. *Cognitive Development*, 2020. https://www.sciencedirect.com/science/article/abs/pii/S0885201420300782
- Kahn-Horwitz, J. & Goldstein, Z. English foreign language reading and spelling diagnostic assessments informing teaching and learning of young learners. *Language Testing*, 2024. https://doi.org/10.1177/02655322231162838
- Spelling challenges in English as a foreign language: vowels, digraphs, and novel phonemes. *Reading and Writing*, 2025. https://link.springer.com/article/10.1007/s11145-025-10659-3
- Spelling English as a foreign language: a narrative review of cross-language influences due to distance in writing system, orthography and phonology, 2022. https://www.researchgate.net/publication/365403170
- Modern Hebrew phonology. https://en.wikipedia.org/wiki/Modern_Hebrew_phonology (reference-grade for the inventory; not a research source)
- English Pronunciation for Hebrew Speakers, BoldVoice. https://www.boldvoice.com/blog/english-pronunciation-hebrew-speakers — *non-peer-reviewed accent-coaching source; used only for the substitution list, flagged in §1*

**Directionality**
- Rinaldi, L. et al. Reading direction shifts visuospatial attention: An Interactive Account of attentional biases. *Acta Psychologica*, 2014. https://www.sciencedirect.com/science/article/abs/pii/S0001691814001346
- Reading/writing direction as a source of directional bias in spatial cognition. *Psychonomic Bulletin & Review*, 2022. https://link.springer.com/article/10.3758/s13423-022-02239-1
- English and Hebrew Letter Report by English- and Hebrew-Reading Subjects: Evidence for Stimulus Control, Not Hemispheric Asymmetry. *Brain and Cognition*, 1984. https://www.sciencedirect.com/science/article/abs/pii/S0278262684710219

**Mirror invariance / letter reversals**
- Dehaene, S., Nakamura, K. et al. Why do children make mirror errors in reading? Neural correlates of mirror invariance in the visual word form area. *NeuroImage*, 2010. https://www.sciencedirect.com/science/article/abs/pii/S1053811909010039
- Fernandes, T. & Kolinsky, R. The cost of blocking the mirror generalization process in reading. *Psychonomic Bulletin & Review*, 2014. https://link.springer.com/article/10.3758/s13423-014-0663-9
- Inhibition of the mirror generalization process in reading in school-aged children. *Journal of Experimental Child Psychology*, 2016. https://www.sciencedirect.com/science/article/abs/pii/S0022096515003100
- Dehaene, S. Reading in the Brain Revised and Extended. *Mind & Language*, 2014. https://www.unicog.org/publications/Dehaene_Reading_inthebrainrevisitedandextendedMindLanguage2014.pdf

**Letter names and sounds**
- Piasta, S. B. & Wagner, R. K. Developing Early Literacy Skills: A Meta-Analysis of Alphabet Learning and Instruction. *Reading Research Quarterly*, 2010. https://www.semanticscholar.org/paper/5a4b855d9808b9ec5d5378d9dd198ba80c18d14e
- Piasta, S. B., Purpura, D. J. & Wagner, R. K. Fostering Alphabet Knowledge Development: A Comparison of Two Instructional Approaches. *Reading and Writing*, 2010. https://www.researchgate.net/publication/44687837
- Foulin, J.-N. Why is letter-name knowledge such a good predictor of learning to read? *Reading and Writing* 18, 2005. https://link.springer.com/article/10.1007/s11145-004-5892-2
- Lerner, M. D. & Lonigan, C. J. Bidirectional Relations between Phonological Awareness and Letter Knowledge in Preschool Revisited. *Journal of Experimental Child Psychology*, 2016. https://pmc.ncbi.nlm.nih.gov/articles/PMC5225463/
- Hulme, C. et al. A Longitudinal Study of Early Reading Development: Letter-Sound Knowledge, Phoneme Awareness and RAN, but Not Letter-Sound Integration, Predict Variations in Reading Development. *Scientific Studies of Reading*, 2019. https://www.tandfonline.com/doi/full/10.1080/10888438.2019.1622546
- Preschoolers' alphabet learning: Letter name and sound instruction, cognitive processes, and English proficiency. *Early Childhood Research Quarterly*, 2018. https://www.sciencedirect.com/science/article/abs/pii/S0885200618300383
- Brick by Brick: Insights on Alphabet Instruction From Research. The Reading League, 2025. https://www.thereadingleague.org/wp-content/uploads/2025/01/Brick-by-Brick-Insights-on-Alphabet-Instruction-From-Research.pdf

**Mastery, fluency and knowledge tracing**
- DIBELS 8th Edition Benchmark Goals, University of Oregon, 2020. https://dibels.uoregon.edu/sites/default/files/2021-06/DIBELS8thEditionGoals.pdf
- DIBELS Next: Summary of Benchmark Goals and Cut Points for Risk. Colorado DoE. https://www.cde.state.co.us/coloradoliteracy/dibelsnextbenchmarkgoalsandcutpointsforrisk
- A systematic review of the impact of precision teaching and fluency-building on teaching children diagnosed with autism. *Research in Developmental Disabilities*, 2022. https://www.sciencedirect.com/science/article/pii/S0883035522001501
- *Journal of Precision Teaching and Celeration*, vol. 27. https://celeration.org/wp-content/uploads/2022/06/2011_JPTC_V27.pdf
- How Much Mastery is Enough Mastery? The Relationship between Mastery in a Lesson and the Performance on the Subsequent Lesson. *EDM 2025*. https://educationaldatamining.org/edm2025/proceedings/2025.EDM.short-papers.4/2025.EDM.short-papers.4.pdf

**Spacing, retrieval and interleaving**
- Cepeda, N. J., Vul, E., Rohrer, D., Wixted, J. T. & Pashler, H. Spacing Effects in Learning: A Temporal Ridgeline of Optimal Retention. *Psychological Science* 19(11):1095–1102, 2008. https://laplab.ucsd.edu/articles/Cepeda%20et%20al%202008_psychsci.pdf
- Cepeda, N. J. et al. Distributed practice in verbal recall tasks: A review and quantitative synthesis. *Psychological Bulletin*, 2006. https://augmentingcognition.com/assets/Cepeda2006.pdf
- Latimier, A., Peyre, H. & Ramus, F. A Meta-Analytic Review of the Benefit of Spacing out Retrieval Practice Episodes on Retention. *Educational Psychology Review*, 2021. https://link.springer.com/article/10.1007/s10648-020-09572-8
- The Distributed Practice Effect on Classroom Learning: A Meta-Analytic Review of Applied Research, 2025. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12189222/
- Retrieval practice enhances learning in real primary school settings, whether distributed or not, 2025. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12372469/
- Sobel, H. S., Cepeda, N. J. & Kapler, I. V. Spacing effects in real-world classroom vocabulary learning. *Applied Cognitive Psychology*, 2011. https://onlinelibrary.wiley.com/doi/abs/10.1002/acp.1747
- Karpicke, J. D. & Bauernschmidt, A. Retrieval practice over the long term: should spacing be expanding or equal-interval? *Psychonomic Bulletin & Review*, 2014. https://link.springer.com/article/10.3758/s13423-014-0636-z
- Learning Natural Categories: Effects of Interleaving Practice in Children and Young Adults. *Journal of Intelligence* 13(9):107, 2025. https://www.mdpi.com/2079-3200/13/9/107
- Kang, S. H. K. Interleaved Training and Category Learning. https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-interleaved-training-and-category-learning-kang.pdf
- Carvalho, P. F. & Goldstone, R. L. Putting category learning in order. *Memory & Cognition*, 2014. https://link.springer.com/article/10.3758/s13421-013-0371-0
- Wilson, R. C., Shenhav, A., Straccia, M. & Cohen, J. D. The Eighty Five Percent Rule for optimal learning. *Nature Communications* 10:4646, 2019. https://www.nature.com/articles/s41467-019-12552-4
- Quantifying attention span across the lifespan, 2023. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10621754/

**Motivation and reward**
- Deci, E. L., Koestner, R. & Ryan, R. M. A Meta-Analytic Review of Experiments Examining the Effects of Extrinsic Rewards on Intrinsic Motivation. *Psychological Bulletin* 125(6):627–668, 1999. https://home.ubalt.edu/tmitch/642/articles%20syllabus/Deci%20Koestner%20Ryan%20meta%20IM%20psy%20bull%2099.pdf
- Deci, E. L., Koestner, R. & Ryan, R. M. Extrinsic Rewards and Intrinsic Motivation in Education: Reconsidered Once Again. *Review of Educational Research* 71(1), 2001. https://www.selfdeterminationtheory.org/SDT/documents/2001_DeciKoestnerRyan.pdf
- Mueller, C. M. & Dweck, C. S. Praise for intelligence can undermine children's motivation and performance. *Journal of Personality and Social Psychology* 75(1):33–52, 1998. https://www.columbia.edu/cu/psychology/courses/3615/Readings/Mueller_Dweck.pdf
- Gamification enhances student intrinsic motivation, perceptions of autonomy and relatedness, but minimal impact on competency: a meta-analysis and systematic review. *Educational Technology Research and Development*, 2023. https://link.springer.com/article/10.1007/s11423-023-10337-7
- Effects of Gamification on Behavioral Change in Education: A Meta-Analysis, 2021. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8037535/
- A Meta-Analysis of Gamification's Impact on Student Motivation in K-12 Education. *Psychology in the Schools*, 2025. https://onlinelibrary.wiley.com/doi/10.1002/pits.70056

**Handwriting, typing and keyboarding**
- Longcamp, M. et al. The Influence of Writing Practice on Letter Recognition in Preschool Children: A Comparison between Handwriting and Typing. *Acta Psychologica*, 2005. https://www.researchgate.net/publication/7914118
- James, K. H. & Engelhardt, L. The effects of handwriting experience on functional brain development in pre-literate children. *Trends in Neuroscience and Education*, 2012. https://can.lab.indiana.edu/publications/pub-files/2012-james-engelhardt.pdf
- Ibaibarriaga, A., Acha, J. & Perea, M. The impact of handwriting and typing practice in children's letter and word learning: Implications for literacy development. *Journal of Experimental Child Psychology*, 2025. https://www.sciencedirect.com/science/article/pii/S0022096525000013
- Does learning to write and type make a difference in letter recognition and discrimination in primary school children? *Journal of Cognitive Psychology*, 2022. https://www.tandfonline.com/doi/full/10.1080/20445911.2022.2060240
- Handwriting or Typewriting? The Influence of Pen- or Keyboard-Based Writing Training on Reading and Writing Performance in Preschool Children, 2015. https://pmc.ncbi.nlm.nih.gov/articles/PMC4710970/
- Keyboarding instruction: Comparison of techniques for improved keyboarding skills in elementary students. *Journal of Occupational Therapy, Schools & Early Intervention*, 2018. https://www.tandfonline.com/doi/full/10.1080/19411243.2018.1512067
- Touch typing instruction: Elementary teachers' beliefs and practices. *Computers in Human Behavior*, 2016. https://www.sciencedirect.com/science/article/abs/pii/S0360131516301361
- Hebrew keyboard (SI-1452 layout description). https://en.wikipedia.org/wiki/Hebrew_keyboard

**Comprehensible input and lexical coverage**
- Hu, M. & Nation, P. Unknown Vocabulary Density and Reading Comprehension. *Reading in a Foreign Language*, 2000.
- Kremmel, B. et al. Unknown Vocabulary Density and Reading Comprehension: Replicating Hu and Nation (2000). *Language Learning*, 2023. https://onlinelibrary.wiley.com/doi/10.1111/lang.12622
- Laufer, B. & Ravenhorst-Kalovski, G. C. Lexical threshold revisited: Lexical text coverage, learners' vocabulary size and reading comprehension. *Reading in a Foreign Language* 22(1), 2010. https://eric.ed.gov/?id=EJ887873
- Laufer, B. Lexical Thresholds for Reading Comprehension. *TESOL Quarterly*, 2013. https://onlinelibrary.wiley.com/doi/abs/10.1002/tesq.140
- Laufer, B. Lexical Coverages, Inferencing Unknown Words and Reading Comprehension: How Are They Related? *TESOL Quarterly*, 2020. https://onlinelibrary.wiley.com/doi/abs/10.1002/tesq.3004
- Laufer, B. Lexical Syllabus in Elementary and Secondary Education: Construction and Implementation. *TESOL Quarterly*. https://onlinelibrary.wiley.com/doi/full/10.1002/tesq.70195
- Beyond comprehensible input: a neuro-ecological critique of Krashen's hypothesis in language education. *Frontiers in Psychology*, 2025. https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2025.1636777/full
- A Critical Review of Krashen's Input Hypothesis. *Journal of Education and Human Development*, 2015. http://jehd.thebrpi.org/journals/jehd/Vol_4_No_4_December_2015/16.pdf

**Israeli Ministry of Education (accessed via search summaries only — see gap #14)**
- English Curriculum 2020. State of Israel Ministry of Education, Pedagogical Secretariat. https://meyda.education.gov.il/files/Mazkirut_Pedagogit/English/Curriculum2020.pdf
- English Curriculum 2020 for Elementary School. https://meyda.education.gov.il/files/Mazkirut_Pedagogit/English/curriculum2020Elementary.pdf
- Lexical Pre-Band I & Band I, Elementary School, November 2020. https://meyda.education.gov.il/files/Mazkirut_Pedagogit/English/CurriculumFilesAugust21/LexicalBand1.pdf
- Intermediate Level: Lexis Band II. https://meyda.education.gov.il/files/Mazkirut_Pedagogit/English/Band22July18.pdf
- English Curriculum introduction, Ministry of Education pedagogical portal. https://pop.education.gov.il/tchumey_daat/english/yesodi/curriculum/introduction/
- State Comptroller of Israel: English Studies in the Education System, 2024. https://library.mevaker.gov.il/sites/DigitalLibrary/Documents/2024/2024.07-75A/EN/2024.07-75A-101-English-Taktzir-EN.pdf
