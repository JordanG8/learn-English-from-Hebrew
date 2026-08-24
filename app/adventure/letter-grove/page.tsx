import type { Metadata } from "next";
import { LetterGroveEncounter } from "@/components/adventure/LetterGroveEncounter";

export const metadata: Metadata = {
  title: "ערפל הבלבול · חורשת האותיות",
  description: "משימת האות הראשונה בעולם ההרפתקה של אנגלית מההתחלה",
};

export default function LetterGrovePage() {
  return <LetterGroveEncounter />;
}

