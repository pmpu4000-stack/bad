// =====================================================================
// srs.js — spaced repetition, scoped to one level. Struggling words
// (low Leitner box) come up more often than mastered ones.
// =====================================================================
import { box } from "./store.js";

const WEIGHT = { 0: 5, 1: 6, 2: 3, 3: 1 };

export function nextWord(words, level, currentId) {
  const pool = words.filter((w) => w.level === level);
  if (!pool.length) return null;

  const bag = [];
  for (const w of pool) {
    if (currentId && w.id === currentId && pool.length > 1) continue; // avoid immediate repeat
    const weight = WEIGHT[box(w.id)] ?? 1;
    for (let k = 0; k < weight; k++) bag.push(w);
  }
  return bag[Math.floor(Math.random() * bag.length)] || pool[0];
}

export function nextParentWord(parentWords, sessionAnsweredIds = {}, currentId = null) {
  if (!parentWords || !parentWords.length) return null;
  if (parentWords.length === 1) return parentWords[0];

  // 1. Prioritize words that haven't been answered in this session yet
  const unattempted = parentWords.filter((w) => !sessionAnsweredIds[w.id]);
  if (unattempted.length > 0) {
    const pool = (currentId && unattempted.length > 1)
      ? unattempted.filter((w) => w.id !== currentId)
      : unattempted;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // 2. All have been attempted at least once -> pick using Leitner weights (struggling words come up more)
  const bag = [];
  for (const w of parentWords) {
    if (currentId && w.id === currentId && parentWords.length > 1) continue;
    const weight = WEIGHT[box(w.id)] ?? 1;
    for (let k = 0; k < weight; k++) bag.push(w);
  }
  return bag[Math.floor(Math.random() * bag.length)] || parentWords[0];
}
