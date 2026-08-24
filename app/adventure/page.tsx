import type { Metadata } from "next";
import { AdventureTrail } from "@/components/adventure/AdventureTrail";

export const metadata: Metadata = {
  title: "שביל ההרפתקה · חורשת האותיות",
  description: "בוחרים משימה, מפעילים אנגלית, ואוספים ציוד לגיבור",
};

export default function AdventurePage() {
  return <AdventureTrail />;
}

