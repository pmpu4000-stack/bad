// =====================================================================
// store.js — the model. Progress state, localStorage, grading rules,
// per-level accounting, and derived statistics. No DOM in here.
// =====================================================================
import { CATS } from "./data.js";

const LS_KEY = "spellAgent.v3"; // 升級版本 Key，支援多筆歷史陣列

// Local calendar date "YYYY-M-D" (used to scope a training session to one day).
function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}

// 取得詳細的時間戳記 (ISO 格式)
function getTimestamp() {
  return new Date().toISOString();
}

// The calendar date `offset` days before today, as { key, dnum }.
function dayAgo(offset) {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return {
    key: d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(),
    dnum: d.getDate()
  };
}

// box (Leitner): 0 new · 1 learning · 2 practicing · 3 mastered
// stat[id]: { a: attempts, c: corrects, ew: everWrong }
// lstat[level]: { a, c } — per-level attempts/corrects (drives the 80% gate)
// level: { current, unlocked, placed }
function fresh() {
  return {
    box: {},
    stat: {},
    lstat: {},
    level: { current: 1, unlocked: 1, placed: false },
    // one day's training run; counters reset each time you "start today's training"
    session: { active: false, date: null, answered: 0, correct: 0, incorrect: 0, ids: {}, mastered: 0 },
    // per-day practice log, keyed by date -> { a: answered, c: correct, w: wrong, m: newly mastered }
    history: {},
    points: 0,
    streak: 0,
    best: 0,
    attempts: 0,
    correct: 0,
  };
}

function load() {
  try {
    const rawData = localStorage.getItem(LS_KEY);
    if (!rawData) return fresh();

    const parsedLogs = JSON.parse(rawData);
    const base = fresh();

    // 兼容處理：如果舊資料不是陣列，當作舊單一物件處理
    if (!Array.isArray(parsedLogs)) {
      return {
        ...base,
        ...parsedLogs,
        level: { ...base.level, ...(parsedLogs.level || {}) },
        session: { ...base.session, ...(parsedLogs.session || {}) },
        history: parsedLogs.history || {},
      };
    }

    if (parsedLogs.length === 0) {
      return fresh();
    }

    // 因為現在最新紀錄在最前面 (index 0)，所以我們抓取第 0 筆作為當前狀態
    const latestEntry = parsedLogs[0];
    const currentDBData = latestEntry.data || {};

    const merged = {
      ...base,
      ...currentDBData,
      level: { ...base.level, ...(currentDBData.level || {}) },
      session: { ...base.session, ...(currentDBData.session || {}) },
      history: currentDBData.history || {},
    };

    // a session left open from a previous day is over
    if (merged.session.active && merged.session.date !== todayStr()) {
      merged.session.active = false;
    }
    return merged;
  } catch {
    return fresh();
  }
}

let DB = load();

function save() {
  try {
    const today = todayStr();
    const timestamp = getTimestamp();

    // 1. 讀取現有的歷史紀錄陣列（若無則初始化為空陣列）
    let logs = JSON.parse(localStorage.getItem(LS_KEY)) || [];
    if (!Array.isArray(logs)) {
      logs = [];
    }

    // 2. 建立今天要寫入的資料包裝
    const newEntry = {
      date: today,
      timestamp: timestamp,
      data: DB              
    };

    // 3. 檢查陣列中是否已經存在「同一個日期 (today)」的紀錄
    const existingIndex = logs.findIndex(entry => entry.date === today);

    if (existingIndex !== -1) {
      // 如果已經存在今天的紀錄：直接在原本的位置覆蓋，確保同一天不重複
      logs[existingIndex] = newEntry;
    } else {
      // 如果是新的一天：使用 unshift 放到陣列最前方（最新在最上面，舊的往下挪）
      logs.unshift(newEntry);
    }

    // 4. 寫回 localStorage
    localStorage.setItem(LS_KEY, JSON.stringify(logs));
  } catch (e) {
    console.error("儲存失敗（可能空間已滿）：", e);
  }
}

export function box(id) {
  return DB.box[id] || 0;
}

export function everWrong(id) {
  return !!(DB.stat[id] && DB.stat[id].ew);
}

export function correctCount(id) {
  return DB.stat[id] ? DB.stat[id].c : 0;
}

// Grade one practice attempt. `level` (optional) also updates that level's tally.
export function grade(id, correct, level) {
  const before = box(id);
  const st = DB.stat[id] || (DB.stat[id] = { a: 0, c: 0, ew: false });
  st.a++;
  DB.attempts++;
  let gain = 0, newlyMastered = false;
  if (correct) {
    st.c++;
    DB.correct++;
    DB.box[id] = Math.min(3, before + 1);
    DB.streak++;
    DB.best = Math.max(DB.best, DB.streak);
    gain = 8 + Math.min(12, DB.streak * 2);
    DB.points += gain;
    if (DB.box[id] === 3 && before < 3) newlyMastered = true;
  } else {
    st.ew = true;
    DB.box[id] = 1;
    DB.streak = 0;
  }
  if (level) {
    const ls = DB.lstat[level] || (DB.lstat[level] = { a: 0, c: 0 });
    ls.a++;
    if (correct) ls.c++;
  }
  if (DB.session.active) {
    const s = DB.session;
    s.answered++;
    if (correct) s.correct++;
    else s.incorrect++;
    s.ids[id] = 1;
    if (newlyMastered) s.mastered++;
    // log into today's history (survives even if the session is never explicitly ended)
    const h = DB.history[todayStr()] || (DB.history[todayStr()] = { a: 0, c: 0, w: 0, m: 0 });
    h.a++;
    if (correct) h.c++;
    else h.w++;
    if (newlyMastered) h.m++;
  }
  save();
  return { correct, gain, streak: DB.streak, box: DB.box[id], newlyMastered };
}

export function reset() {
  DB = fresh();
  save();
}

// ---- today's training session ----
export function sessionStart() {
  DB.session = { active: true, date: todayStr(), answered: 0, correct: 0, incorrect: 0, ids: {}, mastered: 0 };
  save();
}

export function sessionEnd() {
  const s = DB.session;
  const summary = {
    answered: s.answered,
    correct: s.correct,
    incorrect: s.incorrect,
    distinct: Object.keys(s.ids).length,
    mastered: s.mastered,
    rate: s.answered ? Math.round((s.correct / s.answered) * 100) : 0,
  };
  DB.session.active = false;
  save();
  return summary;
}

// Practice history for the last `n` days + streaks, for the calendar heatmap.
export function historyData(n = 28) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const { key, dnum } = dayAgo(i);
    const h = DB.history[key];
    const a = h ? h.a : 0, c = h ? h.c : 0;
    days.push({ key, dnum, a, c, rate: a ? Math.round((c / a) * 100) : 0, level: a === 0 ? 0 : a < 10 ? 1 : a < 20 ? 2 : 3 });
  }
  const has = (off) => !!DB.history[dayAgo(off).key];
  let streak = 0;
  let start = has(0) ? 0 : has(1) ? 1 : null; // streak stays alive through today or yesterday
  if (start !== null) {
    let k = start;
    while (has(k)) {
      streak++;
      k++;
    }
  }
  const toIdx = (ds) => {
    const [y, m, d] = ds.split("-").map(Number);
    return Math.round(new Date(y, m - 1, d).getTime() / 86400000);
  };
  const idxs = Object.keys(DB.history).map(toIdx).sort((x, y) => x - y);
  let best = 0, cur = 0, prev = null;
  for (const i of idxs) {
    cur = (prev !== null && i === prev + 1) ? cur + 1 : 1;
    best = Math.max(best, cur);
    prev = i;
  }
  return { days, streak, best, total: idxs.length };
}

export function sessionState() {
  const s = DB.session;
  return {
    active: s.active,
    answered: s.answered,
    correct: s.correct,
    incorrect: s.incorrect,
    distinct: Object.keys(s.ids).length,
    rate: s.answered ? Math.round((s.correct / s.answered) * 100) : 0,
  };
}

// ---- level progression ----
export function progress() {
  return { ...DB.level };
}

export function levelStats(level) {
  const s = DB.lstat[level] || { a: 0, c: 0 };
  return { attempts: s.a, correct: s.c, rate: s.a ? s.c / s.a : 0 };
}

export function setCurrentLevel(n) {
  DB.level.current = n;
  if (n > DB.level.unlocked) DB.level.unlocked = n;
  save();
}

export function completePlacement(startLevel) {
  DB.level.placed = true;
  DB.level.current = startLevel;
  DB.level.unlocked = Math.max(DB.level.unlocked, startLevel);
  save();
}

// Promote after clearing a challenge; returns the new current level.
export function promote() {
  const next = Math.min(5, DB.level.current + 1);
  DB.level.unlocked = Math.max(DB.level.unlocked, next);
  DB.level.current = next;
  save();
  return next;
}

// ---- header + progress-bar numbers ----
export function stats(words) {
  let learn = 0, prac = 0, mast = 0;
  for (const w of words) {
    const b = box(w.id);
    if (b >= 3) mast++;
    else if (b === 2) prac++;
    else if (b === 1) learn++;
  }
  const distinctCorrect = Object.values(DB.stat).filter((s) => s.c > 0).length;
  const passRate = DB.attempts ? Math.round((DB.correct / DB.attempts) * 100) : 0;
  return {
    learn,
    prac,
    mast,
    total: words.length,
    currentLevel: DB.level.current,
    streak: DB.streak,
    distinctCorrect,
    passRate,
    attempts: DB.attempts,
    correct: DB.correct,
  };
}

// Everything the summary panel needs, as plain data.
export function summary(words) {
  const s = stats(words);
  const mastered = words.filter((w) => box(w.id) >= 3);
  const fixed = words.filter((w) => box(w.id) >= 3 && everWrong(w.id));
  const levels = [1, 2, 3, 4, 5].map((lv) => {
    const ws = words.filter((w) => w.level === lv);
    const ls = levelStats(lv);
    return {
      level: lv,
      total: ws.length,
      mast: ws.filter((w) => box(w.id) >= 3).length,
      correct: ws.filter((w) => correctCount(w.id) > 0).length,
      rate: Math.round(ls.rate * 100),
      attempts: ls.attempts,
    };
  });
  const catCounts = Object.keys(CATS).map((k) => {
    const ws = words.filter((w) => w.cat === k);
    return { name: CATS[k].name, color: CATS[k].color, total: ws.length, mast: ws.filter((w) => box(w.id) >= 3).length };
  });
  return {
    passRate: s.passRate,
    distinctCorrect: s.distinctCorrect,
    attempts: s.attempts,
    correct: s.correct,
    total: s.total,
    mastered,
    fixed,
    levels,
    catCounts,
    history: historyData(),
  };
}
