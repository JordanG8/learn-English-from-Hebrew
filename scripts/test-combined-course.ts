import assert from "node:assert/strict";
import { LESSONS, buildReviewLesson } from "@/lib/curriculum/lessons";
import { canConnect, introducedLetters, matchingStep } from "@/lib/curriculum/matching";
import { letterPhoneme } from "@/lib/phonics";
import { freshProgress, coerceProgress } from "@/lib/progress";
import { awardCourseAnswer, claimGift, coerceGarden, freshGarden, importCourseStars } from "@/lib/garden/progress";
const taught=new Set<string>(), words=new Set<string>();
let matches=0, sentences=0, builds=0;
assert.equal(LESSONS.filter(l=>l.kind!=="chat").length,100,"saved map positions are stable");
for(const lesson of LESSONS)for(const step of lesson.steps){
  if(step.type==="letter-intro")taught.add(step.letter);
  if(step.type==="word-intro")words.add(step.word);
  if(step.type==="letter-match"){
    matches++;assert.equal(step.letters.length,3);assert.equal(new Set(step.letters.map(letterPhoneme)).size,3);
    for(const l of step.letters)assert.ok(taught.has(l),`matching ${l} before introduction`);
  }
  if(step.type==="build-word"){
    builds++;assert.ok(words.has(step.word),`${step.word} before introduction`);
    for(const l of step.word)assert.ok(taught.has(l),`${step.word} uses untaught ${l}`);
  }
  if(step.type==="build-sentence"){
    sentences++;for(const word of step.sentence.split(" ")){assert.ok(words.has(word),`${word} in sentence before introduction`);for(const l of word)assert.ok(taught.has(l));}
  }
}
assert.ok(matches>=8);assert.ok(sentences>0 && builds>0);
assert.equal(matchingStep(["S","A"],"test"),null);
assert.equal(matchingStep(["C","K","A"],"test"),null,"same sounds can't be two answers");
const triple=matchingStep(["S","A","T"],"test")!;
for(const letter of triple.letters){assert.ok(canConnect({column:0,letter},{column:1,letter}));assert.ok(canConnect({column:1,letter},{column:2,letter}));}
assert.equal(canConnect({column:0,letter:"S"},{column:1,letter:"A"}),false);
assert.equal(canConnect({column:0,letter:"S"},{column:2,letter:"S"}),false);
const fresh=freshProgress();assert.deepEqual(introducedLetters(fresh),[]);
const early=buildReviewLesson([],"review-1",["S","A"]);
for(const s of early.steps)if("letter" in s)assert.ok(["S","A"].includes(s.letter));
assert.ok(!early.steps.some(s=>s.type==="letter-match"));
const later=buildReviewLesson([],"review-2",["S","A","T"]);assert.ok(later.steps.some(s=>s.type==="letter-match"));
let garden=importCourseStars(freshGarden(),{"letter-S":3});assert.equal(garden.earned.length,3);
garden=importCourseStars(garden,{"letter-S":3});assert.equal(garden.earned.length,3);
garden=awardCourseAnswer(garden,"letter-A","sound-A-0");assert.equal(garden.earned.length,4);
garden=awardCourseAnswer(garden,"letter-A","sound-A-0");assert.equal(garden.earned.length,4);
garden=claimGift(garden,"flowers");assert.equal(garden.gifts.length,1);
assert.deepEqual(coerceGarden(JSON.parse(JSON.stringify(garden))),garden);
const old={...fresh,lessonsCompleted:["tutorial","letter-S"],stars:{"letter-S":3}};
assert.deepEqual(coerceProgress(old),old,"legacy progress remains intact");
console.log(`Combined course checks passed: ${builds} word builds, ${sentences} sentences, ${matches} matching rounds; prerequisite order, distinct sounds, early review, reward deduplication, and migration.`);
