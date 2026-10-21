export type Cue = { text: string; he: string; emoji: string; line: string };
export const CUES: Record<string, Cue> = {
  morning: { text: "Good morning", he: "בוקר טוב", emoji: "🌞", line: "sentence-good-morning" },
  night: { text: "Good night", he: "לילה טוב", emoji: "🌙", line: "sentence-good-night" },
  cat: { text: "Cat", he: "חתול", emoji: "🐱", line: "word-CAT" },
  dog: { text: "Dog", he: "כלב", emoji: "🐶", line: "word-DOG" },
  ball: { text: "Ball", he: "כדור", emoji: "⚽", line: "word-BALL" },
  mycat: { text: "My cat", he: "החתול שלי", emoji: "🐱", line: "sentence-my-cat" },
  mydog: { text: "My dog", he: "הכלב שלי", emoji: "🐶", line: "sentence-my-dog" },
};
export type GardenStep = {
  id: string; kind: "teach" | "choose" | "build"; instruction: string;
  cue: string; options?: string[]; scene?: string; phonics?: boolean;
};
export type Mission = { id: string; title: string; goal: string; emoji: string; steps: GardenStep[] };
export const MISSIONS: Mission[] = [
  { id: "hello", title: "בוקר בגינה", goal: "מברכים בבוקר ובלילה", emoji: "🌞", steps: [
    { id: "morning-demo", kind: "teach", cue: "morning", instruction: "השמש עלתה! כך אומרים בוקר טוב באנגלית." },
    { id: "night-demo", kind: "teach", cue: "night", instruction: "הירח עלה. כך אומרים לילה טוב באנגלית." },
    { id: "hello-1", kind: "choose", cue: "morning", options: ["morning", "night"], instruction: "נקשיב לברכה ונבחר את התמונה המתאימה." },
    { id: "hello-2", kind: "choose", cue: "night", options: ["morning", "night"], instruction: "מתי אומרים את הברכה הזאת?" },
    { id: "hello-3", kind: "choose", cue: "morning", options: ["morning", "night"], scene: "🌞", instruction: "בוקר בגינה! נקשיב לשתי הברכות ונבחר מה לומר לינשוף." },
  ] },
  { id: "friends", title: "חברים חדשים", goal: "מזהים חתול, כלב וכדור", emoji: "🐱", steps: [
    { id: "cat-demo", kind: "teach", cue: "cat", instruction: "חבר חדש הגיע לגינה. חתול באנגלית הוא…" },
    { id: "dog-demo", kind: "teach", cue: "dog", instruction: "גם כלב בא לשחק. כלב באנגלית הוא…" },
    { id: "ball-demo", kind: "teach", cue: "ball", instruction: "הבאנו להם כדור. כדור באנגלית הוא…" },
    { id: "friends-1", kind: "choose", cue: "cat", options: ["cat", "dog"], instruction: "מי בא לשחק? נקשיב ונמצא אותו." },
    { id: "friends-2", kind: "choose", cue: "dog", options: ["cat", "dog", "ball"], instruction: "נקשיב ונבחר את החבר שקראו לו." },
    { id: "friends-3", kind: "choose", cue: "ball", options: ["cat", "dog", "ball"], instruction: "מה נביא למשחק? נקשיב ונבחר." },
  ] },
  { id: "my-cat", title: "החתול שלי", goal: "בונים מילה ומשתמשים בה", emoji: "🏡", steps: [
    { id: "cat-sounds", kind: "teach", cue: "cat", phonics: true, instruction: "במילה הזאת יש שלושה צלילים. נקשיב לכל אות ואז נחבר אותם." },
    { id: "my-cat-1", kind: "build", cue: "cat", instruction: "נבנה את המילה חתול. אפשר ללחוץ על האותיות או להקליד באנגלית." },
    { id: "mycat-demo", kind: "teach", cue: "mycat", instruction: "כך אומרים החתול שלי. המילה הראשונה אומרת שלי." },
    { id: "mydog-demo", kind: "teach", cue: "mydog", instruction: "ואפשר גם לומר הכלב שלי. אותה התחלה, חבר אחר." },
    { id: "my-cat-2", kind: "choose", cue: "mycat", options: ["mycat", "mydog"], instruction: "על מי הינשוף מדבר? נקשיב ונבחר." },
    { id: "my-cat-3", kind: "choose", cue: "mydog", options: ["mycat", "mydog"], scene: "🐶", instruction: "הינשוף מציג את הכלב שלו. נקשיב לשני המשפטים ונבחר מה לומר." },
  ] },
];
export const QUESTIONS = MISSIONS.flatMap(m => m.steps.filter(s => s.kind !== "teach"));
export const GIFTS = [
  { id: "flowers", title: "פרחים", emoji: "🌷" }, { id: "sunflower", title: "חמנייה", emoji: "🌻" },
  { id: "ball", title: "כדור משחק", emoji: "⚽" }, { id: "kite", title: "עפיפון", emoji: "🪁" },
  { id: "house", title: "בית לחברים", emoji: "🏡" }, { id: "fountain", title: "מזרקה", emoji: "⛲" },
];
