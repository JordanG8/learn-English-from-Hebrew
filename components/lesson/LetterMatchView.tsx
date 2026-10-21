"use client";
import { useEffect, useRef, useState } from "react";
import type { LetterMatchStep } from "@/lib/types";
import { getLetter } from "@/lib/curriculum/alphabet";
import { canConnect } from "@/lib/curriculum/matching";
import { playSfx, speakLine, stopSpeech } from "@/lib/audio";
import { letterNameLineId, letterSoundLineId } from "@/lib/voice/lines";
import type { StepRenderProps } from "./steps";

type Node = { column: number; letter: string };
const key = (n: Node) => `${n.column}:${n.letter}`;
export function LetterMatchView({ step, onAnswer, onAdvance, locked }: { step: LetterMatchStep } & StepRenderProps) {
  const [selected, setSelected] = useState<Node | null>(null);
  const [links, setLinks] = useState<string[]>([]);
  const [message, setMessage] = useState("בחרו אות וחברו אותה לשם שלה. אחר כך חברו את השם לצליל.");
  const [example, setExample] = useState(false);
  const [cursor, setCursor] = useState<{x:number;y:number} | null>(null);
  const board = useRef<HTMLDivElement>(null);
  const drag = useRef<{node: Node; x:number; y:number; moved:boolean} | null>(null);
  const suppressClick = useRef(false);
  const solved = useRef(false);
  const count = step.letters.length;
  const totalLinks = count * 2;
  const columns = [step.letters, [...step.letters.slice(1),step.letters[0]], [...step.letters.slice(-1),...step.letters.slice(0,-1)]];
  const point = (n: Node) => ({ x: 110+n.column*340, y: (count === 2 ? 120 : 92)+columns[n.column].indexOf(n.letter)*(count === 2 ? 156 : 112) });
  const speak = (n: Node) => { if (n.column > 0) void speakLine(n.column === 1 ? letterNameLineId(n.letter) : letterSoundLineId(n.letter)); };
  const connect = (a: Node, b: Node) => {
    if (locked || solved.current) return;
    if (a.column === b.column) { setSelected(b); return; }
    if (Math.abs(a.column-b.column) !== 1) { setMessage("מחברים בין עמודות שכנות: אות לשם, ואז שם לצליל."); setSelected(b); return; }
    if (!canConnect(a,b)) {
      setMessage("עוד ניסיון! הקשיבו לשם ולצליל, ואז חברו שוב. הקווים הנכונים נשארים.");
      onAnswer(false); setSelected(null); return;
    }
    const id = `${Math.min(a.column,b.column)}:${a.letter}`;
    const next = links.includes(id) ? links : [...links,id];
    setLinks(next); setSelected(null); setExample(false);
    if (next.length === totalLinks) { solved.current=true; setMessage("כל האותיות מחוברות לשמות ולצלילים שלהן!"); onAnswer(true); playSfx("correct"); }
    else { setMessage(`חיבור נכון! ${next.length} מתוך ${totalLinks} חיבורים.`); playSfx("tap"); }
  };
  const choose = (node: Node) => {
    if (suppressClick.current) { suppressClick.current=false; return; }
    speak(node);
    if (selected && key(selected) !== key(node)) connect(selected,node);
    else setSelected(node);
  };
  const narration = () => void speakLine("matching-instructions", {fallback:{text:"מחברים כל אות לשם שלה, ואז את השם לצליל שלה. אפשר לגרור קו, או ללחוץ על שני קצוות. לחצו על רמקול כדי להקשיב.",lang:"he-IL",rate:.9}});
  useEffect(() => { narration(); return () => stopSpeech(); }, []);
  const renderLine = (id: string, demo=false) => {
    const [col,letter]=id.split(":"); const a=point({column:Number(col),letter}), b=point({column:Number(col)+1,letter});
    return <line key={`${demo}-${id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={demo ? "#a76b1c" : "#3d785b"} strokeWidth="5" strokeDasharray={demo ? "8 6" : undefined} vectorEffect="non-scaling-stroke" />;
  };
  return <section className="mx-auto w-full max-w-4xl rounded-3xl border-2 border-brand-soft bg-white p-3 sm:p-6">
    <h2 className="text-center text-2xl font-bold">{step.promptHe}</h2>
    <p className="my-2 text-center text-lg">גוררים קו או לוחצים על שני קצוות. הרמקולים משמיעים שם או צליל.</p>
    <div className="flex flex-wrap justify-center gap-2"><button className="min-h-14 rounded-xl border-2 px-4" onClick={narration}>🔊 ההוראות</button><button disabled={solved.current || locked} className="min-h-14 rounded-xl border-2 px-4" onClick={() => { setExample(true); setSelected(null); setMessage(`דוגמה: ${step.letters[0]} מתחברת לשם ${getLetter(step.letters[0])?.nameHe}, ואז לצליל שלה. עכשיו נסו בעצמכם.`); onAnswer(false); }}>הראו לי דוגמה</button></div>
    <div ref={board} className="relative mt-4 h-[390px] w-full select-none" dir="ltr"
      onPointerMove={e => { const d=drag.current, rect=board.current?.getBoundingClientRect(); if(!d || !rect)return; if(!d.moved && Math.hypot(e.clientX-d.x,e.clientY-d.y)>8){d.moved=true;setSelected(d.node);speak(d.node);} if(d.moved)setCursor({x:(e.clientX-rect.left)/rect.width*900,y:(e.clientY-rect.top)/rect.height*400}); }}
      onPointerUp={e => { const d=drag.current; drag.current=null;setCursor(null);if(!d?.moved)return;suppressClick.current=true;const el=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>("[data-match-node]");if(el){const [column,letter]=el.dataset.matchNode!.split(":");connect(d.node,{column:Number(column),letter});} }}
      onPointerCancel={() => {drag.current=null;setCursor(null);setSelected(null);}}>
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 900 400" preserveAspectRatio="none" aria-hidden="true">{links.map(id=>renderLine(id))}{example && [0,1].map(c=>renderLine(`${c}:${step.letters[0]}`,true))}{cursor && selected && <line x1={point(selected).x} y1={point(selected).y} x2={cursor.x} y2={cursor.y} stroke="#72509a" strokeWidth="4" vectorEffect="non-scaling-stroke" />}</svg>
      {columns.map((letters,column)=><div key={column}><h3 className="absolute top-0 w-[25%] text-center text-lg font-bold" style={{left:`${(110+column*340)/9}%`,transform:"translateX(-50%)"}}>{["האות","שם האות","הצליל"][column]}</h3>{letters.map((letter,row)=>{
        const node={column,letter};const p=point(node);const completed=column===0 ? links.includes(`0:${letter}`) : column===2 ? links.includes(`1:${letter}`) : links.includes(`0:${letter}`)&&links.includes(`1:${letter}`);
        return <button key={letter} data-match-node={key(node)} aria-label={column===0 ? `האות ${letter}` : column===1 ? `שם האות ${getLetter(letter)?.nameHe}` : `צליל ${row+1}`} aria-pressed={selected?.column===column && selected.letter===letter} disabled={locked || solved.current} style={{left:`${p.x/9}%`,top:`${p.y/4}%`,transform:"translate(-50%,-50%)",touchAction:"none"}} className={`absolute flex h-[76px] w-[25%] flex-col items-center justify-center rounded-2xl border-[3px] bg-white text-xl shadow-sm focus-visible:outline-4 focus-visible:outline-purple-600 ${completed ? "border-green-700" : selected && key(selected)===key(node) ? "border-purple-700 bg-purple-50" : "border-slate-300"}`}
          onPointerDown={e=>{if(e.button!==0)return;suppressClick.current=false;drag.current={node,x:e.clientX,y:e.clientY,moved:false};e.currentTarget.setPointerCapture(e.pointerId);}}
          onClick={()=>choose(node)}>
          {column===0 ? <span className="text-3xl font-black">{letter} <small>{letter.toLowerCase()}</small></span> : column===1 ? <span dir="rtl">🔊 {getLetter(letter)?.nameHe}</span> : <span>🔊 {row+1}</span>}{completed && <small aria-label="מחובר" className="text-sm text-green-800">✓</small>}
        </button>;
      })}</div>)}
    </div>
    <p role="status" className="min-h-14 text-center text-lg font-semibold">{message}</p>
    {solved.current && <button onClick={onAdvance} className="mx-auto block min-h-16 rounded-2xl bg-brand px-10 text-2xl font-bold text-white">ממשיכים ←</button>}
  </section>;
}
