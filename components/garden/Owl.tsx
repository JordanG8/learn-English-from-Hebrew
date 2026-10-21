"use client";
import { useEffect, useState } from "react";
const FRAMES = {
  idle: [[54,29,274,294],[363,25,584,294],[674,26,895,294],[984,26,1203,294]],
  celebrate: [[27,339,300,605],[324,340,622,599],[635,343,948,601],[985,339,1204,605]],
  hop: [[56,689,275,916],[331,644,623,888],[635,632,942,871],[982,688,1203,916]],
  sleep: [[54,960,274,1225],[365,953,587,1225],[673,960,896,1225],[983,960,1204,1225]],
};
export function Owl({ mood = "idle", paused = false }: { mood?: keyof typeof FRAMES; paused?: boolean }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setTimeout>;
    let current = 0;
    const tick = () => {
      setFrame(current);
      if (paused || motion.matches) return;
      const delay = mood === "idle" ? [2600,100,130,600][current] : mood === "sleep" ? 800 : 220;
      timer = setTimeout(() => { current = (current + 1) % 4; tick(); }, delay);
    };
    const reset = () => { clearTimeout(timer); current = 0; tick(); };
    reset(); motion.addEventListener("change", reset);
    return () => { clearTimeout(timer); motion.removeEventListener("change", reset); };
  }, [mood, paused]);
  const [l,t,r,b] = FRAMES[mood][frame];
  const w = r-l+8, h = b-t+8;
  const baseline = mood === "hop" ? [300,272,250,300][frame] : 300;
  return <svg viewBox="0 0 340 340" aria-hidden="true" className="owl-sprite"><svg x={(340-w)/2} y={baseline-h} width={w} height={h} viewBox={`${l-4} ${t-4} ${w} ${h}`} overflow="hidden"><image href="/pet-owl/owl-sprites.png" width="1254" height="1254" /></svg></svg>;
}
