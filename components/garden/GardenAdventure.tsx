"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useProgress } from "@/lib/progress-context";
import { useGarden } from "@/lib/garden/use-garden";
import { claimGift, giftAllowance, GIFT_THRESHOLDS, importCourseStars, placeGift } from "@/lib/garden/progress";
import { GIFTS } from "@/lib/garden/curriculum";
import { Owl } from "./Owl";

export function GardenAdventure() {
  const course=useProgress();
  const {progress,ready,saveFailed,update}=useGarden();
  const [selected,setSelected]=useState<string|null>(null);
  const [notice,setNotice]=useState("");
  const [paused,setPaused]=useState(false);
  useEffect(()=>{if(ready && course.ready && !progress.courseImported)update(p=>importCourseStars(p,course.progress.stars));},[ready,course.ready,course.progress.stars,progress.courseImported,update]);
  if(!ready || !course.ready)return <main className="garden-shell"><p role="status">פותחים את הגינה…</p></main>;
  const stars=progress.earned.length;
  const available=progress.gifts.length<giftAllowance(stars);
  const next=GIFT_THRESHOLDS[progress.gifts.length];
  const goal=available ? "🎁 מתנה חדשה מחכה לבחירה!" : next ? `עוד ${Math.max(0,next-stars)} כוכבי גינה למתנה הבאה` : "כל האוצרות שלכם! ממשיכים לצבור כוכבים וללמוד.";
  return <main className="garden-shell">
    <header className="garden-top"><Link href="/map" aria-label="חזרה למסלול">→</Link><strong>הינשוף והפרסים שלי</strong><span className="garden-stars" aria-label={`${stars} כוכבי גינה`}>⭐ {stars}</span></header>
    <div className="garden-heading"><div><p className="garden-eyebrow">הגינה גדלה עם מה שלמדתם</p><h1>ביקור אצל הינשוף</h1></div><button className="garden-text-button" aria-pressed={paused} onClick={()=>setPaused(p=>!p)}>{paused ? "הפעלת תנועה" : "עצירת תנועה"}</button></div>
    <p className="mb-4 text-center text-lg">תשובות נכונות במסלול מזכות בכוכבי גינה. גם הצלחה אחרי רמז נחשבת!</p>
    {saveFailed && <p role="alert" className="garden-notice">הדפדפן לא הצליח לשמור. ההתקדמות עלולה להיעלם בסגירה.</p>}
    <div className="owl-garden" aria-label="הגינה שלנו"><div className="garden-pet"><Owl mood={available ? "hop" : "idle"} paused={paused}/></div>
      {[0,1,2].map(slot=>{const id=Object.keys(progress.placed).find(id=>progress.placed[id]===slot),gift=GIFTS.find(g=>g.id===id);return <button key={slot} className={`garden-slot slot-${slot} ${selected ? "placing":""}`} disabled={!selected} aria-label={selected ? `הנחת הפריט במקום ${slot+1}` : gift?.title ?? `מקום לקישוט ${slot+1}`} onClick={()=>{if(selected){update(p=>placeGift(p,selected,slot));setSelected(null);setNotice("הקישוט במקום! אפשר להזיז אותו בכל זמן.");}}}>{gift?.emoji ?? (selected ? "＋":"")}</button>;})}
      <div className="garden-goal">{goal}</div>
    </div>
    {selected && <p className="garden-hint">בחרו מקום מסומן בגינה. <button onClick={()=>setSelected(null)} className="garden-text-button">ביטול</button></p>}
    <p role="status" className="garden-feedback">{notice}</p>
    {available && <section className="gift-panel"><h2>איזו מתנה נביא לגינה?</h2><p>בוחרים מתנה ומניחים אותה בגינה. הכוכבים נשארים שלכם.</p><div className="gift-options">{GIFTS.filter(g=>!progress.gifts.includes(g.id)).map(g=><button key={g.id} onClick={()=>{update(p=>claimGift(p,g.id));setSelected(g.id);setNotice(`בחרתם ${g.title}. בחרו לה מקום בגינה.`);}}><span aria-hidden>{g.emoji}</span>{g.title}</button>)}</div></section>}
    <Link className="garden-primary text-center" href="/map">חוזרים למסלול הלימוד ←</Link>
    {progress.gifts.length>0 && <section className="gift-shelf"><h2>האוצרות שלנו</h2><p>בחרו פריט ואז מקום. החלפה שומרת את הפריט הקודם באוסף.</p><div className="gift-options">{progress.gifts.map(id=>{const g=GIFTS.find(g=>g.id===id)!;return <button key={id} aria-pressed={selected===id} onClick={()=>setSelected(id)}><span aria-hidden>{g.emoji}</span>{g.title}</button>;})}</div></section>}
    <footer className="garden-footer"><p>אין קנסות או אובדן כוכבים. כל שאלה מזכה פעם אחת, גם אם חוזרים אליה.</p><p>הגינה נשמרת בדפדפן הזה. הכוכבים מהמסלול הישן נשמרים ומזכים גם במתנות.</p></footer>
  </main>;
}
