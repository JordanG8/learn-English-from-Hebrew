import type { Metadata } from "next";
import { RecorderStudio } from "@/components/studio/RecorderStudio";

export const metadata: Metadata = {
  title: "אולפן ההקלטות · אנגלית מההתחלה",
  description: "הקלטת הקול של האפליקציה — אותיות, מילים וקריינות ההדרכה",
  // A grown-up tool, not a page anyone should land on from a search result.
  robots: { index: false, follow: false },
};

export default function RecordPage() {
  return <RecorderStudio />;
}
