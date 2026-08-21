/**
 * /studio — the recording desk.
 *
 * Not linked from any child-facing screen, and marked noindex: it is an
 * authoring tool that happens to be deployed with the app so it can be opened
 * on a phone, which is the only device that has a decent microphone within
 * arm's reach of the person whose voice this should be.
 */

import type { Metadata } from "next";
import { VoiceStudio } from "@/components/studio/VoiceStudio";

export const metadata: Metadata = {
  title: "אולפן ההקלטות",
  description: "הקלטת הקול של האפליקציה",
  robots: { index: false, follow: false },
};

export default function StudioPage() {
  return <VoiceStudio />;
}
