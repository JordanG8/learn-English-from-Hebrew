"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { coerceGarden, freshGarden, GARDEN_KEY, type GardenProgress } from "./progress";
export function useGarden() {
  const [progress, setProgress] = useState(freshGarden);
  const current = useRef(progress);
  const [ready, setReady] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  useEffect(() => {
    try { current.current = coerceGarden(JSON.parse(localStorage.getItem(GARDEN_KEY) ?? "null")); }
    catch { current.current = freshGarden(); }
    setProgress(current.current); setReady(true);
    const sync = (e: StorageEvent) => {
      if (e.key !== GARDEN_KEY) return;
      try { current.current = coerceGarden(JSON.parse(e.newValue ?? "null")); setProgress(current.current); } catch { /* ignore malformed external writes */ }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const update = useCallback((change: (p: GardenProgress) => GardenProgress) => {
    // Event-time ref prevents rapid clicks from spending the same reward twice.
    const next = change(current.current);
    current.current = next; setProgress(next);
    try { localStorage.setItem(GARDEN_KEY, JSON.stringify(next)); setSaveFailed(false); }
    catch { setSaveFailed(true); }
  }, []);
  return { progress, ready, saveFailed, update };
}
