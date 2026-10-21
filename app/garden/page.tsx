import { redirect } from "next/navigation";
// Owl rewards paused. Keep the implementation and saved progress for later.
// import { GardenAdventure } from "@/components/garden/GardenAdventure";
// import "./garden.css";
// export default function GardenPage() { return <GardenAdventure />; }
export default function GardenPage() { redirect("/map"); }
