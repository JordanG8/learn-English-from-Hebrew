import type { Metadata } from "next";
import { AdventureResume } from "@/components/adventure/AdventureResume";

export const metadata: Metadata = {
  title: "ממשיכים במסע",
  description: "המסע מחזיר אתכם למקום הבא שנפתח בעולם האנגלית",
};

export default function AdventurePage() {
  return <AdventureResume />;
}
