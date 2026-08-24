import type { Metadata } from "next";
import { SunGateArrival } from "@/components/adventure/SunGateArrival";

export const metadata: Metadata = {
  title: "שער השמש · מסע האנגלית",
  description: "התחנה הבאה במסע האנגלית",
};

export default function SunGatePage() {
  return <SunGateArrival />;
}
