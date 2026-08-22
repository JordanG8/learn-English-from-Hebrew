/**
 * /speak — pronunciation practice.
 *
 * Reached from the road (components/map/LevelSelect.tsx), not from the title
 * screen: the front door has a hard one-action budget, and this is a second
 * thing to do, not the way in.
 */

import type { Metadata } from "next";
import { SpeakPractice } from "@/components/speak/SpeakPractice";

export const metadata: Metadata = {
  title: "מדברים אנגלית",
  description: "אומרים מילה באנגלית ושומעים מה יצא",
};

export default function SpeakPage() {
  return <SpeakPractice />;
}
