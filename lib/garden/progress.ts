import { GIFTS, MISSIONS, QUESTIONS } from "./curriculum";
export const GARDEN_KEY = "efh:owl-garden:v1";
export type Evidence = { lastDay: string; independentDays: string[]; attempts: number };
export type GardenProgress = { version: 1; earned: string[]; completed: string[]; gifts: string[]; placed: Record<string, number>; evidence: Record<string, Evidence> };
export const freshGarden = (): GardenProgress => ({ version: 1, earned: [], completed: [], gifts: [], placed: {}, evidence: {} });
export function localDay(now = new Date()): string { return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`; }
const ids = new Set(QUESTIONS.map(q => q.id));
const strings = (value: unknown): string[] => Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === "string"))] : [];
export function coerceGarden(raw: unknown): GardenProgress {
  const p = freshGarden();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return p;
  const r = raw as Record<string, unknown>;
  p.earned = strings(r.earned).filter(id => ids.has(id) || /^review:\d{4}-\d{2}-\d{2}:/.test(id) && ids.has(id.split(":")[2]));
  p.completed = strings(r.completed).filter(id => MISSIONS.some(m => m.id === id && m.steps.filter(s => s.kind !== "teach").every(s => p.earned.includes(s.id))));
  p.gifts = strings(r.gifts).filter(id => GIFTS.some(g => g.id === id)).slice(0, Math.floor(p.earned.length / 3));
  if (r.placed && typeof r.placed === "object") for (const [id, slot] of Object.entries(r.placed)) {
    if (p.gifts.includes(id) && Number.isInteger(slot) && slot >= 0 && slot < 3 && !Object.values(p.placed).includes(slot)) p.placed[id] = slot;
  }
  if (r.evidence && typeof r.evidence === "object") for (const [id, value] of Object.entries(r.evidence)) {
    if (!ids.has(id) || !value || typeof value !== "object") continue;
    const e = value as Record<string, unknown>;
    if (typeof e.lastDay !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(e.lastDay)) continue;
    p.evidence[id] = { lastDay: e.lastDay, independentDays: strings(e.independentDays).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)), attempts: typeof e.attempts === "number" && Number.isFinite(e.attempts) ? Math.max(0, e.attempts) : 0 };
  }
  return p;
}
export function answerGarden(p: GardenProgress, id: string, correct: boolean, independent: boolean, review = false, day = localDay()): GardenProgress {
  if (!ids.has(id)) return p;
  const old = p.evidence[id];
  const evidence = { ...p.evidence, [id]: { lastDay: correct ? day : old?.lastDay ?? "", independentDays: correct && independent ? [...new Set([...(old?.independentDays ?? []), day])] : old?.independentDays ?? [], attempts: (old?.attempts ?? 0) + 1 } };
  const token = review ? `review:${day}:${id}` : id;
  const reviewCount = p.earned.filter(k => k.startsWith(`review:${day}:`)).length;
  const eligible = !review || p.earned.includes(id) && !!old?.lastDay && old.lastDay < day && reviewCount < 3;
  return { ...p, evidence, earned: correct && eligible && !p.earned.includes(token) ? [...p.earned, token] : p.earned };
}
export function completeMission(p: GardenProgress, id: string): GardenProgress {
  const mission = MISSIONS.find(m => m.id === id);
  if (!mission || !mission.steps.filter(s => s.kind !== "teach").every(s => p.earned.includes(s.id))) return p;
  return { ...p, completed: [...new Set([...p.completed, id])] };
}
export function missionStartIndex(p: GardenProgress, missionIndex: number): number {
  const steps = MISSIONS[missionIndex]?.steps ?? [];
  if (!steps.some(s => p.earned.includes(s.id))) return 0;
  const unanswered = steps.findIndex(s => s.kind !== "teach" && !p.earned.includes(s.id));
  let index = 0;
  for (let i=0; i<unanswered; i++) if (steps[i].kind === "teach") index=i;
  return index;
}
export function claimGift(p: GardenProgress, id: string): GardenProgress {
  if (!GIFTS.some(g => g.id === id) || p.gifts.includes(id) || p.gifts.length >= Math.floor(p.earned.length / 3)) return p;
  return { ...p, gifts: [...p.gifts, id] };
}
export function placeGift(p: GardenProgress, id: string, slot: number): GardenProgress {
  if (!p.gifts.includes(id) || !Number.isInteger(slot) || slot < 0 || slot > 2) return p;
  const placed = Object.fromEntries(Object.entries(p.placed).filter(([key, value]) => key !== id && value !== slot));
  return { ...p, placed: { ...placed, [id]: slot } };
}
export function dueQuestions(p: GardenProgress, day = localDay()) {
  return QUESTIONS.filter(q => p.earned.includes(q.id) && p.evidence[q.id]?.lastDay < day && !p.earned.includes(`review:${day}:${q.id}`)).sort((a,b) => p.evidence[a.id].lastDay.localeCompare(p.evidence[b.id].lastDay)).slice(0, Math.max(0, 3 - p.earned.filter(k => k.startsWith(`review:${day}:`)).length));
}
export function retainedWords(p: GardenProgress): boolean { return ["friends-1", "friends-2", "friends-3"].every(id => (p.evidence[id]?.independentDays.length ?? 0) >= 2); }
