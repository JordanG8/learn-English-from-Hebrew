import assert from "node:assert/strict";
import { LESSONS } from "@/lib/curriculum/lessons";
import { readResume, writeResume, clearResume } from "@/lib/lesson-resume";
const data = new Map<string,string>();
Object.defineProperty(globalThis,"window",{value:{localStorage:{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)}}});
let count=0;
for (const lesson of LESSONS) {
 if (lesson.steps.length < 2) continue;
 const saved={index:1,wrongTotal:1,steps:lesson.steps};
 writeResume(lesson.id,saved);
 assert.deepEqual(readResume(lesson.id),saved,lesson.id);
 clearResume(lesson.id); assert.equal(readResume(lesson.id),null); count++;
}
console.log(`Resume validation passed for ${count} lessons, including introductions and matching.`);

