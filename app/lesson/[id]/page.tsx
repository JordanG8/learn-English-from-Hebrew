import { notFound } from "next/navigation";
import { LESSONS, getLesson } from "@/lib/curriculum";
import { LessonPlayer } from "@/components/lesson/LessonPlayer";

/** The whole track is static content, so every lesson page prerenders. */
export function generateStaticParams() {
  return LESSONS.filter((l) => l.kind !== "chat").map((l) => ({ id: l.id }));
}

export default async function LessonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lesson = getLesson(id);
  if (!lesson) notFound();
  return <LessonPlayer lesson={lesson} />;
}
