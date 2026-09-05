// =====================================================================
// ui.js — the view. All DOM rendering lives here. It renders from plain
// data and reports intent through callbacks; it never touches the store.
// =====================================================================
import { CATS } from "./data.js";
import { say, spellOut } from "./audio.js";
import { LEVELS, levelColor, levelName, misspellings, shuffle } from "./levels.js";

const $ = (s) => document.querySelector(s);
const el = {
  playScreen: $("#screen-play"), quizScreen: $("#screen-quiz"),
  levelbar: $("#levelbar"), modes: $("#modes"), stage: $("#stage"), fb: $("#feedback"),
  catlabel: $("#catlabel"), modehint: $("#modehint"), zh: $("#zh"), sent: $("#sent"),
  peekBtn: $("#peekBtn"), checkBtn: $("#checkBtn"), summary: $("#summary"),
  card: $("#card"), banner: $("#banner"), session: $("#session"),
  quizhead: $("#quizhead"), quizbar: $("#quizprog-bar"), quizstage: $("#quizstage"),
};

const MODES = [
  ["listen", "🎧", "聽與拼"], ["pick", "✅", "選拼法"],
  ["scramble", "🧩", "重組"], ["trap", "🖍️", "填陷阱"],
];
const MHINT = {
  listen: "聽發音，把單字拼出來", pick: "哪一個拼法才正確？",
  scramble: "把打散的字母排回正確順序", trap: "只要填出螢光色的陷阱字母",
};
const CHEERS = ["太棒了！", "完全正確！", "你好厲害！", "拼對了！", "答對啦！", "進步好多！"];

function revealHtml(word) {
  const d = word.display || word.word; // proper case (teaches capitals on proper nouns)
  return d.split("").map((ch, i) => (word.mask[i] ? `<span class="hl">${ch}</span>` : ch)).join("");
}
function pulse(cls) { el.card.classList.remove("pop", "shake"); void el.card.offsetWidth; el.card.classList.add(cls); }
function miniBtn(label, onClick) {
  const b = document.createElement("button");
  b.className = "mini"; b.textContent = label; b.onclick = onClick;
  return b;
}
function textInput(placeholder, onCheck) {
  const inp = document.createElement("input");
  inp.className = "spellbox";
  inp.autocapitalize = "none"; inp.autocomplete = "off"; inp.autocorrect = "off"; inp.spellcheck = false;
  inp.placeholder = placeholder;
  inp.onkeydown = (e) => { if (e.key === "Enter") onCheck(); };
  return inp;
}

// ---------- screens ----------
export function setScreen(name) {
  el.playScreen.hidden = name !== "play";
  el.quizScreen.hidden = name !== "quiz";
}

// ---------- navigation ----------
export function renderLevelBar(levelInfo, onPick) {
  el.levelbar.innerHTML = levelInfo
    .map((L) => {
      const bg = L.state === "current" ? `style="background:${L.color}"` : "";
      const lock = L.state === "locked" ? " 🔒" : "";
      return `<button class="lvchip" data-lv="${L.n}" data-state="${L.state}" ${bg} ${L.state === "locked" ? "disabled" : ""}>
        <div class="lvn">LEVEL ${L.n}</div>
        <div class="lvname">${L.name}${lock}</div>
        <div class="lvbar"><i style="width:${L.pct}%"></i></div>
      </button>`;
    })
    .join("");
  el.levelbar.querySelectorAll(".lvchip").forEach((b) =>
    (b.onclick = () => { if (b.dataset.state !== "locked") onPick(+b.dataset.lv); }));
}

export function initModes(mode, onPick) {
  el.modes.innerHTML = MODES
    .map(([k, ic, t]) => `<button class="mode" role="tab" data-m="${k}" aria-pressed="${k === mode}"><span class="ic">${ic}</span>${t}</button>`)
    .join("");
  el.modes.querySelectorAll(".mode").forEach((b) =>
    (b.onclick = () => {
      el.modes.querySelectorAll(".mode").forEach((x) => x.setAttribute("aria-pressed", x.dataset.m === b.dataset.m));
      onPick(b.dataset.m);
    }));
}

// ---------- one practice round ----------
export function renderRound(word, mode, { onAnswer, onCheck }) {
  el.fb.textContent = ""; el.fb.className = "feedback";
  el.peekBtn.style.display = mode === "pick" ? "none" : "";
  el.checkBtn.style.display = ""; el.checkBtn.disabled = false;
  el.checkBtn.textContent = "檢查 Check"; el.checkBtn.className = "btn primary";

  if (word.isCustom) {
    el.catlabel.textContent = "家長自訂";
    el.catlabel.style.background = "var(--violet)";
  } else if (word.isParentWord) {
    el.catlabel.textContent = `👨‍👩‍👧 家長指定 · L${word.level}`;
    el.catlabel.style.background = "var(--violet)";
  } else {
    el.catlabel.textContent = `Level ${word.level}`;
    el.catlabel.style.background = levelColor(word.level);
  }
  el.modehint.textContent = MHINT[mode];
  if (word.zh) {
    const phon = word.ph ? ` <span class="phon">[${word.ph}]</span>` : "";
    const catTag = word.featured && word.cat ? ` <span style="color:var(--ink3)">（${CATS[word.cat].name}）</span>` : "";
    el.zh.innerHTML = `意思：<b>${word.zh}</b>${phon}${catTag}`;
  } else {
    el.zh.innerHTML = `<span style="color:var(--ink3)">🔊 聽發音，拼出這個字</span>`;
  }

  if (word.sent && mode !== "pick") {
    el.sent.innerHTML = word.sent.replace(new RegExp("\\b" + word.word + "\\b", "i"), "<u>?????</u>");
  } else {
    el.sent.innerHTML = "";
  }

  if (mode === "pick") return renderPick(word, onAnswer);
  if (mode === "trap") return renderTrap(word, onCheck);
  if (mode === "scramble") return renderScramble(word, onCheck);
  return renderListen(word, onCheck);
}

function renderListen(word, onCheck) {
  el.stage.innerHTML = "";
  const btn = document.createElement("button");
  btn.className = "listen-btn"; btn.setAttribute("aria-label", "播放發音");
  btn.innerHTML = "🔊"; btn.onclick = () => say(word.word);
  const row = document.createElement("div");
  row.className = "mini-row";
  row.append(miniBtn("🐢 一個字母一個字母", () => spellOut(word.word)));
  if (word.featured && word.sent) row.append(miniBtn("💬 唸例句", () => say(word.sent, 0.85)));
  const inp = textInput("在這裡拼字…", onCheck);
  el.stage.append(btn, row, inp);
  say(word.word);
  setTimeout(() => inp.focus(), 50);
  return {
    getGuess: () => inp.value.trim().toLowerCase(),
    applyTypedResult: (ok) => { inp.classList.add(ok ? "ok" : "bad"); inp.disabled = true; },
  };
}

function renderPick(word, onAnswer) {
  el.stage.innerHTML = "";
  const opts = document.createElement("div");
  opts.className = "opts";
  const choices = shuffle([word.word, ...misspellings(word.word, 3)]);
  let done = false;
  choices.forEach((choice) => {
    const b = document.createElement("button");
    b.className = "opt"; b.textContent = choice;
    b.onclick = () => {
      if (done) return; done = true;
      const ok = choice === word.word;
      b.classList.add(ok ? "ok" : "bad");
      if (!ok) opts.querySelectorAll(".opt").forEach((o) => { if (o.textContent === word.word) o.classList.add("ok"); });
      onAnswer(ok);
    };
    opts.append(b);
  });
  el.stage.append(opts, miniBtn("🔊 再聽一次", () => say(word.word)));
  el.checkBtn.style.display = "none";
  say(word.word);
  return { getGuess: null, applyTypedResult: null };
}

function renderTrap(word, onCheck) {
  el.stage.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "tiles";
  word.word.split("").forEach((ch, i) => {
    const t = document.createElement("div");
    if (word.mask[i]) {
      t.className = "tile blank";
      const inp = document.createElement("input");
      inp.maxLength = 1; inp.dataset.i = i;
      inp.autocapitalize = "none"; inp.autocomplete = "off"; inp.spellcheck = false;
      inp.oninput = () => {
        const ins = [...wrap.querySelectorAll("input")];
        const cu = ins.indexOf(inp);
        if (inp.value && cu < ins.length - 1) ins[cu + 1].focus();
      };
      inp.onkeydown = (e) => {
        if (e.key === "Enter") onCheck();
        if (e.key === "Backspace" && !inp.value) {
          const ins = [...wrap.querySelectorAll("input")];
          const cu = ins.indexOf(inp);
          if (cu > 0) ins[cu - 1].focus();
        }
      };
      t.append(inp);
    } else {
      t.className = "tile"; t.textContent = ch;
    }
    wrap.append(t);
  });
  el.stage.append(wrap, miniBtn("🔊 聽發音", () => say(word.word)));
  say(word.word);
  setTimeout(() => { const f = wrap.querySelector("input"); if (f) f.focus(); }, 50);
  return {
    getGuess: () => {
      const full = word.word.split("");
      wrap.querySelectorAll("input").forEach((inp) => { full[+inp.dataset.i] = (inp.value || " ").toLowerCase(); });
      return full.join("");
    },
    applyTypedResult: () => {
      wrap.querySelectorAll(".tile.blank").forEach((t) => {
        const inp = t.querySelector("input");
        const ok = (inp.value || "").toLowerCase() === word.word[+inp.dataset.i];
        t.classList.add(ok ? "ok" : "bad"); inp.disabled = true;
      });
    },
  };
}

function renderScramble(word, onCheck) {
  el.stage.innerHTML = "";
  let shuffled;
  do { shuffled = shuffle(word.word.split("")); }
  while (shuffled.join("") === word.word && word.word.replace(" ", "").length > 1);
  const scr = document.createElement("div");
  scr.className = "tiles";
  shuffled.forEach((ch) => {
    const t = document.createElement("div");
    t.className = "tile"; t.style.background = "#EEF6FF"; t.style.borderColor = "#CBE4FA";
    t.textContent = ch === " " ? "␣" : ch;
    scr.append(t);
  });
  const inp = textInput("排出正確的字…", onCheck);
  el.stage.append(scr, inp, miniBtn("🔊 聽發音", () => say(word.word)));
  setTimeout(() => inp.focus(), 50);
  return {
    getGuess: () => inp.value.trim().toLowerCase(),
    applyTypedResult: (ok) => { inp.classList.add(ok ? "ok" : "bad"); inp.disabled = true; },
  };
}

// ---------- feedback & actions ----------
export function note(msg) { el.fb.textContent = msg; }

export function showResult(correct, word, info) {
  if (correct) {
    el.fb.className = "feedback ok";
    el.fb.textContent = `✅ ${CHEERS[Math.floor(Math.random() * CHEERS.length)]}  +${info.gain}`;
    pulse("pop"); say(word.word);
  } else {
    el.fb.className = "feedback bad";
    el.fb.innerHTML = `❌ 再看一次！ 正確拼法：<span class="reveal" style="display:inline">${revealHtml(word)}</span>`;
    pulse("shake"); spellOut(word.word);
  }
}
export function setActionNext() {
  el.checkBtn.style.display = ""; el.checkBtn.disabled = false;
  el.checkBtn.textContent = "下一個 Next →"; el.checkBtn.className = "btn go";
}
export function peek(word) {
  say(word.word);
  el.fb.className = "feedback";
  el.fb.innerHTML = `<span class="reveal" style="display:inline;font-size:26px">🔍 ${revealHtml(word)}</span>`;
}

// ---------- header, progress bar, gate banner ----------
export function renderProgress(s) {
  $("#s-level").textContent = s.currentLevel;
  $("#s-correct").textContent = s.distinctCorrect;
  $("#s-streak").textContent = s.streak;
  $("#s-rate").textContent = s.passRate + "%";
  $("#b-learn").style.width = (s.learn / s.total * 100) + "%";
  $("#b-prac").style.width = (s.prac / s.total * 100) + "%";
  $("#b-mast").style.width = (s.mast / s.total * 100) + "%";
  $("#n-learn").textContent = s.learn; $("#n-prac").textContent = s.prac;
  $("#n-mast").textContent = s.mast; $("#n-total").textContent = s.total;
}

export function renderSession(s, defaultGoal, callbacks = {}) {
  const { onStart, onEnd, onOpenParentConfig, onToggleParentMode, parentConfig } = callbacks;
  const hasParentWords = parentConfig && (
    (parentConfig.wordIds && parentConfig.wordIds.length > 0) ||
    (parentConfig.customWords && parentConfig.customWords.length > 0)
  );
  const parentCount = hasParentWords
    ? (parentConfig.wordIds.length + parentConfig.customWords.length)
    : 0;
  const isParentActive = hasParentWords && parentConfig.active;

  if (!s.active) {
    if (isParentActive) {
      el.session.innerHTML = `<div class="sess-idle">
        <div class="sess-title">
          今日練習 <span>Today's Session</span>
          <span class="sess-parent-tag">👨‍👩‍👧 家長指定 (${parentCount} 字)</span>
        </div>
        <div class="sess-btn-group">
          <button class="sess-btn-parent" id="sessParentEdit">⚙️ 調整單字</button>
          <button class="sess-btn-toggle" id="sessParentToggle" title="切換為一般等級練習">切換等級練習</button>
          <button class="sess-start" id="sessStart">▶️ 開始指定練習</button>
        </div>
      </div>`;
      if ($("#sessParentEdit")) $("#sessParentEdit").onclick = onOpenParentConfig;
      if ($("#sessParentToggle")) $("#sessParentToggle").onclick = () => onToggleParentMode(false);
      $("#sessStart").onclick = () => onStart({ isParent: true });
    } else {
      const toggleBtn = hasParentWords ? `<button class="sess-btn-toggle" id="sessParentToggle" title="切換為家長指定單字模式">使用家長清單 (${parentCount}字)</button>` : "";
      el.session.innerHTML = `<div class="sess-idle">
        <div class="sess-title">今日練習 <span>Today's Session</span></div>
        <div class="sess-btn-group">
          <button class="sess-btn-parent" id="sessParentSetup">👨‍👩‍👧 家長挑選與設定單字</button>
          ${toggleBtn}
          <button class="sess-start" id="sessStart">▶️ 開始今天的練習</button>
        </div>
      </div>`;
      if ($("#sessParentSetup")) $("#sessParentSetup").onclick = onOpenParentConfig;
      if ($("#sessParentToggle")) $("#sessParentToggle").onclick = () => onToggleParentMode(true);
      $("#sessStart").onclick = () => onStart({ isParent: false });
    }
    return;
  }

  const goal = s.goal || defaultGoal;
  const ans = s.answered;
  const filled = Math.min(100, (ans / goal) * 100);
  const cw = ans ? (s.correct / ans) * filled : 0;
  const ww = ans ? (s.incorrect / ans) * filled : 0;
  const done = ans >= goal ? "　🎉 達成今日目標！" : "";
  const modeTag = s.isParentMode ? `<span class="sess-parent-tag">👨‍👩‍👧 家長指定模式</span>` : "";

  el.session.innerHTML = `<div class="sess-live">
    <div class="sess-head">
      <span class="sess-title">今日練習 ${modeTag} <span>目標 ${goal} 題</span></span>
      <button class="sess-end" id="sessEnd">⏹ 結束今天的練習</button>
    </div>
    <div class="sess-bar"><i class="c" style="width:${cw}%"></i><i class="w" style="width:${ww}%"></i></div>
    <div class="sess-nums">作答 <b>${ans}</b>　·　✅ 答對 <b>${s.correct}</b>　·　❌ 答錯 <b>${s.incorrect}</b>　·　正確率 <b>${s.rate}%</b>${done}</div>
  </div>`;
  $("#sessEnd").onclick = onEnd;
}

export function makeDefaultMask(word) {
  const m = new Array(word.length).fill(false);
  const vowels = "aeiou";
  let masked = false;
  for (let i = 1; i < word.length; i++) {
    if (vowels.includes(word[i].toLowerCase())) {
      m[i] = true;
      masked = true;
    }
  }
  if (!masked && word.length > 1) {
    m[Math.floor(word.length / 2)] = true;
  }
  return m;
}

export function showParentModal({
  words,
  currentConfig,
  everWrongIds = [],
  unmasteredIds = [],
  onSave,
  onClear,
}) {
  const existing = document.querySelector(".parent-modal-overlay");
  if (existing) existing.remove();

  const wordsMap = new Map();
  words.forEach((w) => wordsMap.set(w.id, w));

  const selectedIds = new Set(currentConfig.wordIds || []);
  const customWordsMap = new Map();
  (currentConfig.customWords || []).forEach((cw) => {
    customWordsMap.set(cw.word.toLowerCase(), cw);
  });

  const wrongSet = new Set(everWrongIds);
  const unmastSet = new Set(unmasteredIds);

  let searchQuery = "";
  let levelFilter = 0; // 0 = all
  let presetFilter = null; // null | "wrong" | "unmastered"

  const overlay = document.createElement("div");
  overlay.className = "parent-modal-overlay";

  overlay.innerHTML = `
    <div class="parent-dialog">
      <div class="parent-head">
        <h2>👨‍👩‍👧 家長挑選與設定練習單字</h2>
        <button class="parent-close" id="pModalClose" title="關閉">✕</button>
      </div>
      <div class="parent-tabs">
        <button class="parent-tab active" id="tabBank">📚 從 2000 單字庫挑選</button>
        <button class="parent-tab" id="tabCustom">✏️ 自訂輸入 / 貼上單字</button>
      </div>
      <div class="parent-body">
        <!-- Tab 1: Bank Area -->
        <div id="pBankArea">
          <div class="parent-search-row">
            <input type="text" class="parent-search-input" id="pSearch" placeholder="🔍 搜尋英文單字或中文意思（例如 apple、學校）...">
          </div>
          <div class="parent-presets" style="margin-top: 8px;">
            <span style="font-size:12px;color:var(--ink3);font-weight:700">智慧篩選：</span>
            <button class="preset-btn" id="preWrong">⚠️ 曾拼錯字 (${everWrongIds.length})</button>
            <button class="preset-btn" id="preUnmastered">🌱 未精通單字</button>
            <button class="preset-btn" id="preRand10">🎲 隨機抽 10 字</button>
            <button class="preset-btn" id="preRand20">🎲 隨機抽 20 字</button>
          </div>
          <div class="parent-filter-row" style="margin-top: 8px;">
            <button class="parent-lv-chip active" data-lv="0">全部關卡</button>
            <button class="parent-lv-chip" data-lv="1">Level 1</button>
            <button class="parent-lv-chip" data-lv="2">Level 2</button>
            <button class="parent-lv-chip" data-lv="3">Level 3</button>
            <button class="parent-lv-chip" data-lv="4">Level 4</button>
            <button class="parent-lv-chip" data-lv="5">Level 5</button>
          </div>
          <div class="parent-list-tools" style="margin-top: 8px;">
            <span>符合篩選：<b id="pFilteredCount" style="color:var(--ink)">0</b> 字</span>
            <div>
              <button class="parent-tool-btn" id="pSelectAll">全選此篩選</button>
              <button class="parent-tool-btn" id="pDeselectAll">取消勾選此篩選</button>
            </div>
          </div>
          <div class="parent-word-list" id="pWordList" style="margin-top: 4px;"></div>
        </div>

        <!-- Tab 2: Custom Area -->
        <div id="pCustomArea" style="display:none;" class="parent-custom-area">
          <p style="font-size:13px;color:var(--ink2);line-height:1.6;">
            貼上或輸入學校、補習班的單字清單（支援逗號、頓號、空格或換行分隔）：<br>
            <small style="color:var(--ink3)">系統會自動比對 2000 字庫對應例句與中文，非庫內單字亦能進行語音發音與拼字測驗！</small>
          </p>
          <textarea class="parent-textarea" id="pCustomInput" placeholder="例如：apple, banana, library, astronaut, volcano..."></textarea>
          <div style="display:flex;gap:10px;align-items:center;">
            <button class="btn primary" id="pParseCustomBtn" style="flex:none;padding:8px 18px;font-size:13px">🔍 解析並加入單字</button>
            <span id="pParseMsg" style="font-size:12.5px;font-weight:700"></span>
          </div>
        </div>

        <!-- Selected Summary Box -->
        <div class="parent-selected-box">
          <div class="parent-selected-title">
            <span>已挑選清單（共 <b id="pTotalSelected" style="color:var(--violet-d);font-size:15px">0</b> 字）</span>
            <a id="pClearAllBtn" style="color:var(--coral);cursor:pointer;font-size:11.5px;text-decoration:underline">清空已選</a>
          </div>
          <div class="parent-chips-bar" id="pChipsBar"></div>
        </div>

        <!-- Goal Row -->
        <div class="parent-goal-row">
          <span>今日練習目標題數：</span>
          <input type="number" min="1" max="100" class="parent-goal-input" id="pGoalInput" value="${currentConfig.goal || 10}">
          <span style="font-size:12px;color:var(--ink3)">題（預設自動調整為選取總字數）</span>
        </div>
      </div>

      <div class="parent-foot">
        <button class="btn ghost" id="pCancelBtn" style="flex:none;min-width:70px">取消</button>
        <button class="btn ghost" id="pClearConfigBtn" style="flex:none;min-width:100px;color:var(--coral)" title="清空家長挑選設定">清空設定</button>
        <button class="btn ghost" id="pSaveOnlyBtn" style="flex:1;min-width:120px">💾 僅儲存設定</button>
        <button class="btn go" id="pSaveAndStartBtn" style="flex:1;min-width:150px">▶️ 儲存並開始練習</button>
      </div>
    </div>
  `;

  document.body.append(overlay);

  const $p = (sel) => overlay.querySelector(sel);
  const pWordList = $p("#pWordList");
  const pChipsBar = $p("#pChipsBar");
  const pTotalSelected = $p("#pTotalSelected");
  const pFilteredCount = $p("#pFilteredCount");
  const pGoalInput = $p("#pGoalInput");
  const pSearch = $p("#pSearch");
  const pCustomInput = $p("#pCustomInput");
  const pParseMsg = $p("#pParseMsg");

  function getTotalCount() {
    return selectedIds.size + customWordsMap.size;
  }

  function updateSelectedChips() {
    const total = getTotalCount();
    pTotalSelected.textContent = total;
    if (total > 0 && (!pGoalInput.dataset.manual || pGoalInput.value == 0)) {
      pGoalInput.value = total;
    }
    pChipsBar.innerHTML = "";

    if (total === 0) {
      pChipsBar.innerHTML = `<span style="color:var(--ink3);font-size:12px">尚未挑選任何單字，請從上方題庫勾選或貼上自訂單字。</span>`;
      return;
    }

    // Render bank words
    selectedIds.forEach((id) => {
      const w = wordsMap.get(id);
      if (!w) return;
      const chip = document.createElement("span");
      chip.className = "parent-chip";
      chip.innerHTML = `${w.word} <span class="rm" title="移除">✕</span>`;
      chip.querySelector(".rm").onclick = () => {
        selectedIds.delete(id);
        updateSelectedChips();
        updateListCheckboxes();
      };
      pChipsBar.append(chip);
    });

    // Render custom words
    customWordsMap.forEach((cw, key) => {
      const chip = document.createElement("span");
      chip.className = "parent-chip";
      chip.style.borderColor = "var(--violet)";
      chip.innerHTML = `⭐ ${cw.word} <span class="rm" title="移除">✕</span>`;
      chip.querySelector(".rm").onclick = () => {
        customWordsMap.delete(key);
        updateSelectedChips();
      };
      pChipsBar.append(chip);
    });
  }

  function getFilteredWords() {
    const q = searchQuery.trim().toLowerCase();
    return words.filter((w) => {
      if (levelFilter > 0 && w.level !== levelFilter) return false;
      if (presetFilter === "wrong" && !wrongSet.has(w.id)) return false;
      if (presetFilter === "unmastered" && !unmastSet.has(w.id)) return false;
      if (q) {
        const inWord = w.word.toLowerCase().includes(q);
        const inZh = w.zh && w.zh.includes(q);
        if (!inWord && !inZh) return false;
      }
      return true;
    });
  }

  function updateListCheckboxes() {
    pWordList.querySelectorAll("input[type='checkbox']").forEach((cb) => {
      cb.checked = selectedIds.has(cb.dataset.id);
    });
  }

  function renderWordList() {
    const filtered = getFilteredWords();
    pFilteredCount.textContent = filtered.length;
    pWordList.innerHTML = "";

    if (filtered.length === 0) {
      pWordList.innerHTML = `<div style="padding:24px;text-align:center;color:var(--ink3);font-size:13px">沒有符合條件的單字</div>`;
      return;
    }

    const MAX_SHOW = 150;
    const slice = filtered.slice(0, MAX_SHOW);

    slice.forEach((w) => {
      const item = document.createElement("div");
      item.className = "parent-word-item";
      const isChecked = selectedIds.has(w.id);
      const phon = w.ph ? ` [${w.ph}]` : "";
      const isWrong = wrongSet.has(w.id);
      const badge = isWrong ? `<span class="p-w-badge" style="color:var(--coral)" title="曾拼錯">❌</span>` : "";

      item.innerHTML = `
        <input type="checkbox" data-id="${w.id}" ${isChecked ? "checked" : ""}>
        <span class="p-w-text">${w.word}</span>
        <span class="p-w-zh">${w.zh || ""}${phon}</span>
        ${badge}
        <span class="p-w-lv" style="background:${levelColor(w.level)}">L${w.level}</span>
      `;

      const cb = item.querySelector("input[type='checkbox']");
      const toggle = () => {
        if (selectedIds.has(w.id)) {
          selectedIds.delete(w.id);
          cb.checked = false;
        } else {
          selectedIds.add(w.id);
          cb.checked = true;
        }
        updateSelectedChips();
      };

      item.onclick = (e) => {
        if (e.target !== cb) toggle();
      };
      cb.onchange = () => toggle();

      pWordList.append(item);
    });

    if (filtered.length > MAX_SHOW) {
      const more = document.createElement("div");
      more.style.padding = "10px";
      more.style.textAlign = "center";
      more.style.color = "var(--ink3)";
      more.style.fontSize = "12px";
      more.textContent = `... 還有 ${filtered.length - MAX_SHOW} 個單字，請輸入關鍵字進一步篩選。`;
      pWordList.append(more);
    }
  }

  // --- Search & Filter Events ---
  pSearch.oninput = (e) => {
    searchQuery = e.target.value;
    renderWordList();
  };

  overlay.querySelectorAll(".parent-lv-chip").forEach((chip) => {
    chip.onclick = () => {
      overlay.querySelectorAll(".parent-lv-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      levelFilter = +chip.dataset.lv;
      renderWordList();
    };
  });

  const preWrong = $p("#preWrong");
  const preUnmastered = $p("#preUnmastered");
  preWrong.onclick = () => {
    if (presetFilter === "wrong") {
      presetFilter = null;
      preWrong.classList.remove("active");
    } else {
      presetFilter = "wrong";
      preWrong.classList.add("active");
      preUnmastered.classList.remove("active");
    }
    renderWordList();
  };

  preUnmastered.onclick = () => {
    if (presetFilter === "unmastered") {
      presetFilter = null;
      preUnmastered.classList.remove("active");
    } else {
      presetFilter = "unmastered";
      preUnmastered.classList.add("active");
      preWrong.classList.remove("active");
    }
    renderWordList();
  };

  $p("#preRand10").onclick = () => {
    const list = getFilteredWords();
    const picks = shuffle([...list]).slice(0, 10);
    picks.forEach((w) => selectedIds.add(w.id));
    updateSelectedChips();
    updateListCheckboxes();
  };

  $p("#preRand20").onclick = () => {
    const list = getFilteredWords();
    const picks = shuffle([...list]).slice(0, 20);
    picks.forEach((w) => selectedIds.add(w.id));
    updateSelectedChips();
    updateListCheckboxes();
  };

  $p("#pSelectAll").onclick = () => {
    const list = getFilteredWords();
    list.forEach((w) => selectedIds.add(w.id));
    updateSelectedChips();
    updateListCheckboxes();
  };

  $p("#pDeselectAll").onclick = () => {
    const list = getFilteredWords();
    list.forEach((w) => selectedIds.delete(w.id));
    updateSelectedChips();
    updateListCheckboxes();
  };

  $p("#pClearAllBtn").onclick = () => {
    selectedIds.clear();
    customWordsMap.clear();
    updateSelectedChips();
    updateListCheckboxes();
  };

  pGoalInput.oninput = () => {
    pGoalInput.dataset.manual = "true";
  };

  // --- Tabs ---
  const tabBank = $p("#tabBank");
  const tabCustom = $p("#tabCustom");
  const pBankArea = $p("#pBankArea");
  const pCustomArea = $p("#pCustomArea");

  tabBank.onclick = () => {
    tabBank.classList.add("active");
    tabCustom.classList.remove("active");
    pBankArea.style.display = "";
    pCustomArea.style.display = "none";
  };

  tabCustom.onclick = () => {
    tabCustom.classList.add("active");
    tabBank.classList.remove("active");
    pBankArea.style.display = "none";
    pCustomArea.style.display = "flex";
  };

  // --- Parse Custom Words ---
  $p("#pParseCustomBtn").onclick = () => {
    const text = pCustomInput.value;
    if (!text.trim()) {
      pParseMsg.style.color = "var(--coral)";
      pParseMsg.textContent = "請先輸入單字文字";
      return;
    }
    const tokens = text.match(/[a-zA-Z][a-zA-Z' -]*/g) || [];
    if (!tokens.length) {
      pParseMsg.style.color = "var(--coral)";
      pParseMsg.textContent = "未找到有效的英文單字";
      return;
    }

    const wordsLowerMap = new Map();
    words.forEach((w) => wordsLowerMap.set(w.word.toLowerCase(), w));

    let bankCount = 0, customCount = 0;
    tokens.forEach((raw) => {
      const clean = raw.trim();
      const lower = clean.toLowerCase();
      if (!lower) return;

      if (wordsLowerMap.has(lower)) {
        selectedIds.add(wordsLowerMap.get(lower).id);
        bankCount++;
      } else {
        if (!customWordsMap.has(lower)) {
          customWordsMap.set(lower, {
            id: "custom_" + lower,
            word: lower,
            display: clean,
            level: 1,
            mask: makeDefaultMask(lower),
            zh: "家長自訂單字",
            sent: "",
            ph: "",
            isCustom: true,
          });
          customCount++;
        }
      }
    });

    pParseMsg.style.color = "var(--green)";
    pParseMsg.textContent = `已加入！其中 ${bankCount} 個在庫單字、${customCount} 個新自訂單字。`;
    pCustomInput.value = "";
    updateSelectedChips();
    updateListCheckboxes();
  };

  // --- Close & Save ---
  const close = () => overlay.remove();
  $p("#pModalClose").onclick = close;
  $p("#pCancelBtn").onclick = close;
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };

  $p("#pClearConfigBtn").onclick = () => {
    if (confirm("確定要清空家長挑選設定，切換回一般等級練習嗎？")) {
      onClear();
      close();
    }
  };

  function doSave(startNow) {
    const total = getTotalCount();
    if (total === 0) {
      alert("請至少挑選或輸入 1 個單字！");
      return;
    }
    const goal = parseInt(pGoalInput.value) || total || 10;
    const config = {
      active: true,
      wordIds: Array.from(selectedIds),
      customWords: Array.from(customWordsMap.values()),
      goal,
    };
    onSave(config, startNow);
    close();
  }

  $p("#pSaveOnlyBtn").onclick = () => doSave(false);
  $p("#pSaveAndStartBtn").onclick = () => doSave(true);

  // Initial render
  updateSelectedChips();
  renderWordList();
}

export function renderBanner(level, ls, ready, hint, onChallenge) {
  const pct = Math.round(ls.rate * 100);
  el.banner.innerHTML = `
    <div class="gate">
      <div>
        <div class="info">Level ${level}「${levelName(level)}」· 正確率 <b>${pct}%</b>（本關練習 ${ls.attempts} 題）</div>
        <div class="meter"><i style="width:${Math.min(100, pct)}%"></i></div>
        <div class="info" style="margin-top:6px;color:var(--ink3)">${hint}</div>
      </div>
      <button class="challenge" id="challengeBtn" ${ready ? "" : "disabled"}>🏆 挑戰測驗</button>
    </div>`;
  $("#challengeBtn").onclick = () => { if (ready) onChallenge(); };
}

// ---------- summary ----------
export function summaryHidden() { return el.summary.hidden; }
export function renderSummary(d) {
  const lvRows = d.levels
    .map((L) => `<tr><td><span style="color:${levelColor(L.level)}">●</span> Level ${L.level}「${levelName(L.level)}」</td><td>正確率 ${L.rate}%／精通 ${L.mast}／共 ${L.total}</td></tr>`)
    .join("");
  const chip = (w) => `<span class="wchip">${w.word}</span>`;
  const fchip = (w) => `<span class="wchip fixed">${w.word}</span>`;
  const none = (t) => `<span style="color:var(--ink3);font-size:13px">${t}</span>`;
  const mastered = d.mastered.slice(0, 60), fixed = d.fixed.slice(0, 60);

  el.summary.innerHTML = `
    <h3>📊 學習總結 Summary <a id="sumClose">收起 ✕</a></h3>
    <div class="bigrate">
      <b class="tnum">${d.passRate}%</b>
      <span>總答對率<br><small>${d.correct} 題對 / 共作答 ${d.attempts} 題</small></span>
      <span style="margin-left:auto;text-align:right">
        <b class="tnum" style="font-size:30px;color:var(--violet)">${d.distinctCorrect}</b><br>
        <small>答對過的字（不重複）／ 共 ${d.total} 字</small></span>
    </div>
    <div class="subh">各關卡進度</div>
    <table class="sumtable">${lvRows}</table>
    <div class="subh">✅ 已精通 ${d.mastered.length} 字（連續答對 3 次）</div>
    <div class="chips-wrap">${mastered.length ? mastered.map(chip).join("") : none("還沒有，繼續加油！")}</div>
    <div class="subh">🛠️ 曾拼錯、現在已訂正 ${d.fixed.length} 字</div>
    <div class="chips-wrap">${fixed.length ? fixed.map(fchip).join("") : none("目前沒有")}</div>
    <div class="subh">📅 練習紀錄（最近 4 週）</div>
    <div class="streakline">🔥 連續 <b>${d.history.streak}</b> 天　·　最佳 <b>${d.history.best}</b> 天　·　累計練習 <b>${d.history.total}</b> 天</div>
    <div class="heatmap">${d.history.days.map((x) =>
      `<i class="hc h${x.level}" title="${x.key}：${x.a ? "作答 " + x.a + " · 正確率 " + x.rate + "%" : "沒有練習"}"></i>`).join("")}</div>`;
  $("#sumClose").onclick = () => { el.summary.hidden = true; };
}
export function toggleSummary(data) {
  el.summary.hidden = !el.summary.hidden;
  if (!el.summary.hidden) { renderSummary(data); el.summary.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
}

// ---------- quiz (placement & challenge) ----------
function quizHead(title, color, index, total) {
  el.quizhead.innerHTML = `<span class="pill" style="background:${color}">測驗 QUIZ</span> ${title}
    <span class="count">第 ${index}／${total} 題</span>`;
  el.quizbar.style.width = ((index - 1) / total * 100) + "%";
}

// Ask one "pick the correct spelling" question. Resolves true/false when answered.
export function askPick(word, meta) {
  return new Promise((resolve) => {
    quizHead(meta.title, meta.color, meta.index, meta.total);
    el.quizstage.innerHTML = "";
    const q = document.createElement("div");
    q.className = "quizq"; q.textContent = "🔊 聽發音，選出正確的拼法";
    const opts = document.createElement("div");
    opts.className = "opts";
    const choices = shuffle([word.word, ...misspellings(word.word, 3)]);
    let done = false;
    choices.forEach((choice) => {
      const b = document.createElement("button");
      b.className = "opt"; b.textContent = choice;
      b.onclick = () => {
        if (done) return; done = true;
        const ok = choice === word.word;
        b.classList.add(ok ? "ok" : "bad");
        if (!ok) opts.querySelectorAll(".opt").forEach((o) => { if (o.textContent === word.word) o.classList.add("ok"); });
        el.quizbar.style.width = (meta.index / meta.total * 100) + "%";
        say(word.word);
        setTimeout(() => resolve(ok), 700);
      };
      opts.append(b);
    });
    el.quizstage.append(q, opts, miniBtn("🔊 再聽一次", () => say(word.word)));
    say(word.word);
  });
}

// Show a full-card result with a single continue button.
export function quizResult({ emoji, headline, sub, extraHtml = "", btnLabel, color }, onBtn) {
  el.quizhead.innerHTML = `<span class="pill" style="background:${color}">結果 RESULT</span>`;
  el.quizbar.style.width = "100%";
  el.quizstage.innerHTML = `
    <div class="result">
      <div class="big">${emoji}</div>
      <div class="headline">${headline}</div>
      <div class="sub">${sub}</div>
      ${extraHtml}
      <button class="btn go" id="quizDone" style="max-width:280px">${btnLabel}</button>
    </div>`;
  $("#quizDone").onclick = onBtn;
}

// ---------- one-time button wiring ----------
export function onPeek(fn) { el.peekBtn.onclick = fn; }
export function onCheckClick(fn) { el.checkBtn.onclick = fn; }
export function onReset(fn) { $("#resetBtn").onclick = fn; }
export function onSummary(fn) { $("#sumBtn").onclick = fn; }
export function onPlace(fn) { $("#placeBtn").onclick = fn; }
