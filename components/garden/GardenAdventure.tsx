"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { playSequence, playSfx, preloadLines, primeAudio, speakLine, stopSpeech } from "@/lib/audio";
import { useSound } from "@/lib/sound-pref";
import { CUES, GIFTS, MISSIONS, type GardenStep } from "@/lib/garden/curriculum";
import { answerGarden, claimGift, completeMission, dueQuestions, missionStartIndex, placeGift, retainedWords } from "@/lib/garden/progress";
import { useGarden } from "@/lib/garden/use-garden";
import { Owl } from "./Owl";

const cueAudio = (key: string) => ({ lineId: CUES[key].line, fallback: { text: CUES[key].text, rate: .75 } });
function shuffle(values: string[]) {
  const result = [...values];
  for (let i=result.length-1; i>0; i--) { const j=Math.floor(Math.random()*(i+1)); [result[i],result[j]]=[result[j],result[i]]; }
  return result;
}

function Activity({ step, onAnswer, onNext, alreadyEarned, muted }: {
  step: GardenStep; onAnswer: (correct: boolean, independent: boolean) => void; onNext: () => void; alreadyEarned: boolean; muted: boolean;
}) {
  const [options] = useState(() => shuffle(step.options ?? []));
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [help, setHelp] = useState(false);
  const [typed, setTyped] = useState("");
  const [feedback, setFeedback] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const submitted = useRef(false);
  const cue = CUES[step.cue];
  const narrate = async () => {
    primeAudio();
    await playSequence([
      { lineId: `garden-${step.id}`, fallback: { text: step.instruction, lang: "he-IL", rate: .9 } },
      ...(!step.scene ? [cueAudio(step.cue)] : []),
    ]);
  };
  useEffect(() => {
    heading.current?.focus();
    void narrate();
    return () => { stopSpeech(); };
    // Each activity is keyed by its immutable step id and sound setting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const solve = () => {
    if (submitted.current || solved) return;
    const correct = step.kind === "build" ? typed.toUpperCase() === "CAT" : picked === step.cue;
    stopSpeech();
    if (correct) {
      submitted.current = true; setSolved(true); playSfx("correct");
      setFeedback(alreadyEarned ? "נכון! התרגול מחזק את מה שלמדנו." : "נכון! הרווחתם כוכב לגינה ⭐");
    } else {
      setAttempts(a => a+1); setHelp(true); setFeedback(`ננסה יחד: ${cue.text} — ${cue.he}. הקשיבו שוב ובחרו.`);
      void speakLine(cue.line, { fallback: { text: cue.text } });
    }
    onAnswer(correct, !help && attempts === 0 && !muted);
  };
  const showHelp = () => { setHelp(true); void speakLine(cue.line, { fallback: { text: cue.text } }); };
  const saySounds = () => void playSequence([
    { lineId: "phoneme-k" }, { lineId: "phoneme-a", pauseMs: 300 }, { lineId: "phoneme-t", pauseMs: 300 }, { ...cueAudio("cat"), pauseMs: 350 },
  ]);
  const disabledOption = (key: string) => attempts >= 2 && key !== step.cue && key !== options.find(o => o !== step.cue);
  return <section className="garden-activity" aria-labelledby="activity-heading">
    <div className="activity-owl"><Owl mood={solved ? "celebrate" : step.cue === "night" && step.kind === "teach" ? "sleep" : "idle"} /></div>
    <h2 ref={heading} tabIndex={-1} id="activity-heading">{step.instruction}</h2>
    <button className="garden-secondary" onClick={() => void narrate()}>🔊 שמיעת ההוראות שוב</button>
    {step.kind === "teach" ? <>
      <div className="cue-art" aria-hidden>{cue.emoji}</div>
      <div className="cue-word" lang="en" dir="ltr">{cue.text}</div><p className="cue-translation">{cue.he}</p>
      <button className="garden-secondary" onClick={() => void speakLine(cue.line, { fallback: { text: cue.text } })}>🔊 נשמע שוב באנגלית</button>
      {step.phonics && <div className="phonics-demo"><div dir="ltr">{["C","A","T"].map((letter, i) => <button key={letter} aria-label={`הצליל של ${letter}`} onClick={() => void speakLine(["phoneme-k","phoneme-a","phoneme-t"][i])}>{letter}</button>)}</div><button className="garden-secondary" onClick={saySounds}>🔊 מחברים את הצלילים</button></div>}
      <button className="garden-primary" onClick={onNext}>הבנתי, בואו נשחק ←</button>
    </> : <>
      {step.scene && <div className="cue-art" aria-label={cue.he}>{step.scene}</div>}
      {!step.scene && <button className="listen-cue" onClick={() => void speakLine(cue.line, { fallback: { text: cue.text } })}>🔊 להקשיב באנגלית</button>}
      {(help || muted) && <p className="garden-hint">{muted ? "תרגול עם טקסט: " : "רמז: "}<span lang="en" dir="ltr">{cue.text}</span> — {cue.he}</p>}
      {step.kind === "build" ? <div className="build-word">
        <label htmlFor="cat-input">המילה שלנו באנגלית</label>
        <input id="cat-input" lang="en" dir="ltr" value={typed} maxLength={3} autoComplete="off" spellCheck={false} disabled={solved} onChange={e => { setTyped(e.target.value.replace(/[^a-z]/gi, "").toUpperCase()); setFeedback(""); }} onKeyDown={e => { if (e.key === "Enter" && typed.length === 3) solve(); }} />
        <div dir="ltr" className="letter-tiles">{["T","C","A"].map(letter => <button key={letter} disabled={solved || typed.length >= 3} onClick={() => { setTyped(t => t+letter); setFeedback(""); }}>{letter}</button>)}<button aria-label="מחיקת אות אחרונה" disabled={solved || !typed} onClick={() => setTyped(t => t.slice(0,-1))}>⌫</button></div>
      </div> : <div className="garden-options" role="group" aria-label="בחירת תשובה">{options.filter(o => !disabledOption(o)).map((key, i) => <button key={key} disabled={solved} aria-pressed={picked === key} className={help && key === step.cue ? "suggested" : ""} onClick={() => { setPicked(key); setFeedback(""); if (step.scene) void speakLine(CUES[key].line, { fallback: { text: CUES[key].text } }); }}>
        {step.scene ? <><span aria-hidden>🔊</span><span>אפשרות {i+1}</span>{(help || muted) && <span lang="en" dir="ltr">{CUES[key].text}</span>}</> : <><span aria-hidden>{CUES[key].emoji}</span><span>{CUES[key].he}</span></>}
      </button>)}</div>}
      <p className="garden-feedback" role="status">{feedback}</p>
      {solved ? <button className="garden-primary" onClick={onNext}>ממשיכים ←</button> : <>
        <button className="garden-primary" disabled={step.kind === "build" ? typed.length !== 3 : !picked} onClick={solve}>זאת התשובה שלי ✓</button>
        <button className="garden-text-button" onClick={showHelp}>אפשר רמז?</button>
      </>}
    </>}
  </section>;
}

export function GardenAdventure() {
  const { progress, ready, saveFailed, update } = useGarden();
  const sound = useSound();
  const [paused, setPaused] = useState(false);
  const [run, setRun] = useState<{ mission: number; steps: GardenStep[]; index: number; review: boolean } | null>(null);
  const [finished, setFinished] = useState(false);
  const [selectedGift, setSelectedGift] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => { preloadLines([...Object.values(CUES).map(c => c.line), ...MISSIONS.flatMap(m => m.steps.map(s => `garden-${s.id}`))]); return () => stopSpeech(); }, []);
  const stars = progress.earned.length;
  const giftsAvailable = progress.gifts.length < Math.min(GIFTS.length, Math.floor(stars / 3));
  const due = dueQuestions(progress);
  const start = (mission: number) => {
    primeAudio(); stopSpeech(); setFinished(false);
    const steps = MISSIONS[mission].steps;
    const index = missionStartIndex(progress, mission);
    setRun({ mission, steps, index, review: false });
  };
  const next = () => {
    if (!run) return;
    stopSpeech();
    if (run.index+1 < run.steps.length) setRun({ ...run, index: run.index+1 });
    else { if (!run.review) update(p => completeMission(p, MISSIONS[run.mission].id)); setRun(null); setFinished(true); playSfx("celebrate"); }
  };
  if (!ready) return <main className="garden-shell"><p role="status">פותחים את הגינה…</p></main>;
  return <main className="garden-shell">
    <header className="garden-top"><Link href="/" aria-label="מסך הבית">🏡</Link><strong>הגינה של הינשוף</strong><span className="garden-stars" aria-label={`${stars} כוכבים`}>⭐ {stars}</span><button aria-label={sound.on ? "כיבוי צלילים" : "הפעלת צלילים"} aria-pressed={!sound.on} onClick={() => { stopSpeech(); sound.toggle(); }}>{sound.on ? "🔊" : "🔇"}</button></header>
    {saveFailed && <p role="alert" className="garden-notice">הדפדפן לא הצליח לשמור. אפשר לשחק עכשיו, אבל ההתקדמות עלולה להיעלם בסגירה.</p>}
    {run ? <>
      <div className="mission-top"><button className="garden-secondary" onClick={() => { stopSpeech(); setRun(null); }}>חזרה לגינה</button><span>{run.review ? "נזכרים יחד" : MISSIONS[run.mission].title} · {run.index+1}/{run.steps.length}</span></div>
      <progress aria-label="התקדמות במשימה" max={run.steps.length} value={run.index} />
      <p className="garden-feedback">{giftsAvailable ? "🎁 מתנה מחכה לכם בגינה!" : progress.gifts.length < GIFTS.length ? stars%3 === 2 ? "עוד כוכב אחד למתנה הבאה" : `עוד ${3-(stars%3)} כוכבים למתנה הבאה` : "⭐ כל הצלחה מצטרפת לאוסף שלכם"}</p>
      <Activity key={`${run.review ? "review" : "mission"}-${run.steps[run.index].id}-${sound.on}`} step={run.steps[run.index]} muted={!sound.on} alreadyEarned={!run.review && progress.earned.includes(run.steps[run.index].id)} onAnswer={(correct, independent) => update(p => answerGarden(p, run.steps[run.index].id, correct, independent, run.review))} onNext={next} />
    </> : <>
      <div className="garden-heading"><div><p className="garden-eyebrow">לומדים אנגלית, מגדלים חברות</p><h1>{finished ? "עשינו את זה ביחד!" : "איזו הרפתקה נעשה היום?"}</h1></div><button className="garden-text-button" aria-pressed={paused} onClick={() => setPaused(p => !p)}>{paused ? "הפעלת תנועה" : "עצירת תנועה"}</button></div>
      <div className="owl-garden" aria-label="הגינה שלנו"><div className="garden-pet"><Owl mood={finished ? "hop" : "idle"} paused={paused} /></div>
        {[0,1,2].map(slot => { const giftId = Object.keys(progress.placed).find(id => progress.placed[id] === slot); const gift = GIFTS.find(g => g.id === giftId); return <button key={slot} className={`garden-slot slot-${slot} ${selectedGift ? "placing" : ""}`} aria-label={selectedGift ? `הנחת הפריט במקום ${slot+1}` : gift ? gift.title : `מקום לקישוט ${slot+1}`} disabled={!selectedGift} onClick={() => { if (selectedGift) { update(p => placeGift(p, selectedGift, slot)); setSelectedGift(null); setNotice("הקישוט במקום! אפשר להזיז אותו בכל זמן."); } }}>{gift ? gift.emoji : selectedGift ? "＋" : ""}</button>; })}
        <div className="garden-goal">{giftsAvailable ? "🎁 מתנה חדשה מחכה לבחירה!" : progress.gifts.length === GIFTS.length ? "כל המתנות שלכם! ממשיכים ללמוד ולשחק." : stars%3 === 2 ? "עוד כוכב אחד למתנה הבאה" : `עוד ${3-(stars%3)} כוכבים למתנה הבאה`}</div>
      </div>
      {selectedGift && <p role="status" className="garden-hint">בחרו אחד משלושת המקומות בגינה. <button className="garden-text-button" onClick={() => setSelectedGift(null)}>ביטול</button></p>}
      <p role="status" className="garden-feedback">{notice}</p>
      {giftsAvailable && <section className="gift-panel"><h2>איזו מתנה נביא לגינה?</h2><p>כל שלושה כוכבים פותחים בחירה. הכוכבים נשארים שלכם.</p><div className="gift-options">{GIFTS.filter(g => !progress.gifts.includes(g.id)).slice(0,2).map(g => <button key={g.id} onClick={() => { update(p => claimGift(p, g.id)); setSelectedGift(g.id); setFinished(false); setNotice(`בחרתם ${g.title}. עכשיו נבחר לה מקום בגינה.`); }}><span aria-hidden>{g.emoji}</span>{g.title}</button>)}</div></section>}
      {due.length > 0 && <button className="garden-review" onClick={() => { primeAudio(); setFinished(false); setRun({ mission: 0, steps: due, index: 0, review: true }); }}>🌱 זוכרים מאתמול? {due.length} שאלות קצרות וכוכבי זיכרון</button>}
      {retainedWords(progress) && <p className="garden-badge">🏅 מומחי מילים — זיהיתם את שלוש המילים בלי רמזים בימים שונים!</p>}
      <section className="mission-list" aria-label="המשימות שלנו">{MISSIONS.map((m,i) => { const locked = i>0 && !progress.completed.includes(MISSIONS[i-1].id); const done = progress.completed.includes(m.id); return <button key={m.id} disabled={locked} className="mission-card" onClick={() => start(i)}><span className="mission-icon" aria-hidden>{locked ? "🔒" : m.emoji}</span><span><strong>{m.title}</strong><small>{m.goal}</small></span><span>{done ? "שוב ↻" : locked ? "בהמשך" : "למשחק ←"}</span></button>; })}</section>
      {progress.completed.length === 3 && <p className="garden-notice">שלוש ההרפתקאות הראשונות הושלמו! אפשר לשחק שוב, לחזור לתרגול קצר מחר, או להמשיך במסלול האותיות.</p>}
      {progress.gifts.length > 0 && <section className="gift-shelf"><h2>האוצרות שלנו</h2><p>בחרו פריט ואז מקום בגינה. אפשר להחליף קישוטים בלי לאבד אותם.</p><div className="gift-options">{progress.gifts.map(id => { const g = GIFTS.find(g => g.id === id)!; return <button key={id} aria-pressed={selectedGift === id} onClick={() => setSelectedGift(id)}><span aria-hidden>{g.emoji}</span>{g.title}</button>; })}</div></section>}
      <footer className="garden-footer"><Link href="/map">מסלול האותיות וההקלדה ←</Link><p>הגינה נשמרת בדפדפן הזה. אין צורך בחשבון.</p></footer>
    </>}
  </main>;
}
