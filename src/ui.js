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
  const { onStart, onEnd, parentConfig } = callbacks;
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
          <span class="sess-parent-tag">🌟 家長專屬任務 (${parentCount} 題)</span>
        </div>
        <button class="sess-start" id="sessStart">▶️ 開始專屬練習</button>
      </div>`;
      $("#sessStart").onclick = () => onStart({ isParent: true });
    } else {
      el.session.innerHTML = `<div class="sess-idle">
        <div class="sess-title">今日練習 <span>Today's Session</span></div>
        <button class="sess-start" id="sessStart">▶️ 開始今天的練習</button>
      </div>`;
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
  const modeTag = s.isParentMode ? `<span class="sess-parent-tag">🌟 專屬特訓中</span>` : "";

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

const THEMES = [
  { id: "food", name: "🍏 飲食料理", reg: /(eat|drink|food|cook|fruit|vegetable|meat|bread|rice|soup|tea|coffee|cake|meal|breakfast|lunch|dinner|snack|sweet|taste|sugar|salt|milk|juice|egg|butter|cheese|beef|pork|chicken|fish|noodle|apple|banana|orange|grape|restaurant|cafeteria|kitchen|cabbage|carrot|cookie|hungry|thirsty|delicious|pizza|hamburger|sandwich|beer|wine|bottle|bowl|cup|plate|spoon|fork|knife|chopsticks|吃|喝|飲|食|煮|烹|果|菜|肉|麵|飯|湯|茶|啡|糕|餐|餐點|早餐|午餐|晚餐|甜|糖|鹽|乳|奶|蛋|牛|豬|雞|魚|香蕉|蘋果|橘|葡萄|餅乾|餓|渴|好吃|美味|碗|盤|杯|匙|叉|筷)/i },
  { id: "animal", name: "🐶 動物生態", reg: /(animal|pet|dog|cat|bird|fish|lion|tiger|bear|monkey|elephant|horse|cow|pig|sheep|duck|chicken|mouse|rabbit|snake|frog|insect|bug|bee|ant|butterfly|fly|spider|whale|dolphin|shark|zoo|forest|nature|tree|flower|grass|plant|leaf|mountain|river|sea|ocean|lake|beach|sky|sun|moon|star|cloud|rain|snow|wind|storm|weather|動|寵|狗|貓|鳥|魚|獅|虎|熊|猴|象|馬|牛|豬|羊|鴨|雞|鼠|兔|蛇|蛙|蟲|蜂|蟻|蝶|蜘蛛|鯨|豚|鯊|動物園|森林|自然|樹|花|草|植|葉|山|河|海|洋|湖|海灘|天|日|月|星|雲|雨|雪|風|暴|天氣)/i },
  { id: "school", name: "🏫 校園學習", reg: /(school|class|student|teacher|study|learn|book|read|write|pen|pencil|eraser|ruler|paper|notebook|desk|chair|board|blackboard|test|exam|grade|question|answer|lesson|homework|math|english|chinese|history|science|music|art|sport|library|campus|playground|chalk|diploma|college|university|學|校|班|生|師|讀|寫|書|筆|擦|尺|紙|本|桌|椅|板|黑板|考|測|分|題|答|課|作業|功課|數|英|國文|史|理|音|藝|體|圖書館|校園|操場|粉筆|大學)/i },
  { id: "home", name: "🏠 家庭居住", reg: /(home|house|family|parent|father|mother|dad|mom|brother|sister|son|daughter|grandpa|grandma|baby|child|kid|room|bedroom|bathroom|living room|door|window|wall|floor|bed|sofa|table|light|lamp|clock|phone|telephone|tv|television|clean|wash|brush|sleep|wake|live|stay|家|屋|室|房|父|母|爸|媽|兄|弟|姊|妹|兒|女|祖|嬰|孩|童|客廳|臥室|浴室|門|窗|牆|地|床|沙發|燈|鐘|電|話|視|清|洗|刷|睡|醒|住|留)/i },
  { id: "body", name: "🏃 人體健康", reg: /(body|head|face|eye|ear|nose|mouth|lip|tooth|teeth|tongue|hair|neck|arm|hand|finger|leg|foot|feet|knee|toe|heart|blood|bone|skin|health|healthy|sick|ill|cold|fever|cough|pain|hurt|hospital|doctor|nurse|medicine|dentist|ambulance|tired|rest|體|頭|臉|眼|耳|鼻|口|嘴|唇|齒|牙|舌|髮|頸|手|指|臂|腿|腳|足|膝|趾|心|血|骨|皮|膚|健|康|病|痛|燒|咳|醫|院|護士|藥|牙醫|救護車|累|休息)/i },
  { id: "traffic", name: "🚗 交通旅遊", reg: /(car|bus|train|plane|airplane|ship|boat|bicycle|bike|motorcycle|taxi|mrt|metro|station|airport|stop|street|road|way|drive|ride|fly|travel|trip|visit|hotel|ticket|map|city|town|country|walk|cross|turn|park|bridge|交|通|車|公車|火車|機|飛機|船|自行車|腳踏車|機車|計程車|捷運|站|場|機|路|街|道|駕|騎|飛|旅|遊|訪|飯店|旅館|票|地圖|市|鎮|走|行|過|轉|園|橋)/i },
  { id: "time", name: "⏰ 時間季節", reg: /(time|clock|watch|hour|minute|second|day|week|month|year|today|tomorrow|yesterday|morning|noon|afternoon|evening|night|midnight|spring|summer|autumn|fall|winter|season|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|early|late|now|then|always|never|often|sometimes|時|鐘|表|小時|分|秒|日|天|週|星期|月|年|今|明|昨|早|晨|午|下午|晚|夜|春|夏|秋|冬|季|初|晚|現|常|總|不曾|有時)/i },
  { id: "job", name: "💼 職業人物", reg: /(person|people|man|woman|men|women|boy|girl|friend|guy|adult|gentleman|lady|job|work|worker|boss|doctor|nurse|teacher|student|driver|farmer|cook|singer|actor|actress|artist|musician|policeman|police|officer|clerk|waiter|waitress|king|queen|president|leader|人|者|員|男|女|童|友|成人|紳士|女士|工作|工|老|醫|護|師|生|司機|農|廚|歌|演|藝|樂|警|官|店員|服務生|王|后|總統|領袖)/i },
  { id: "sport", name: "🎨 休閒運動", reg: /(sport|game|play|ball|baseball|basketball|football|soccer|tennis|badminton|golf|swim|run|jog|jump|dance|sing|song|music|guitar|piano|movie|film|camp|party|holiday|vacation|toy|doll|fun|hobby|exercise|win|lose|運|動|賽|戲|玩|球|棒球|籃球|足球|網球|羽毛球|高爾夫|游|跑|慢跑|跳|舞|唱|歌|樂|吉他|鋼琴|電影|影|營|派對|假|節|玩具|洋娃娃|趣味|嗜好|練|勝|贏|輸)/i },
  { id: "feeling", name: "🌟 情感狀態", reg: /(happy|sad|angry|afraid|scared|brave|surprised|proud|nervous|bored|boring|tired|excited|exciting|interested|interesting|love|like|hate|care|worry|feel|feeling|good|bad|great|wonderful|beautiful|nice|fine|cool|warm|sweet|kind|polite|honest|rich|poor|busy|free|hard|easy|new|old|young|tall|short|big|small|快|樂|悲|傷|怒|氣|怕|恐|勇|敢|驚|傲|緊|張|悶|聊|累|疲|興奮|趣|愛|喜|恨|關心|擔|憂|覺|感|好|壞|美|棒|優|妙|善|和|禮|誠|富|窮|忙|閒|難|易|新|舊|老|幼|少|高|矮|大|小)/i },
];

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

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

  // States
  let navDim = "all"; // "all" | "theme" | "az" | "level"
  let selectedTheme = null;
  let selectedLetter = null;
  let selectedLevel = 0; // 0 = all
  let presetFilter = null; // null | "wrong" | "unmastered"
  let searchQuery = "";
  let currentPage = 1;
  let pageSize = 50; // 50 | 100 | Infinity

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
        <div id="pBankArea" style="display:flex; flex-direction:column; gap:8px; flex:1; min-height:0;">
          <!-- Search Row -->
          <div class="parent-search-row">
            <input type="text" class="parent-search-input" id="pSearch" placeholder="🔍 搜尋英文單字或中文意思（例如 apple、學校）...">
            <button class="search-clear-btn" id="pSearchClear" style="display:none" title="清除">✕</button>
          </div>

          <!-- Fast Packs & Presets -->
          <div class="parent-presets">
            <span style="font-size:12px;color:var(--ink3);font-weight:700">快速任務：</span>
            <button class="preset-btn highlight" id="preSmart15" title="優先挑選孩子常錯與未熟練字">🎯 今日智能推薦 15 字</button>
            <button class="preset-btn" id="preAllWrong" title="一鍵挑選所有曾拼錯過的易錯字">⚠️ 全選曾錯字 (${everWrongIds.length})</button>
            <button class="preset-btn" id="preRand10">🎲 隨機抽 10 字</button>
            <button class="preset-btn" id="preRand20">🎲 隨機抽 20 字</button>
          </div>

          <!-- Dimension Switcher Bar -->
          <div class="parent-dims">
            <button class="dim-btn active" data-dim="all">全部單字</button>
            <button class="dim-btn" data-dim="theme">🏷️ 依主題分類</button>
            <button class="dim-btn" data-dim="az">🔤 依 A–Z 字母</button>
            <button class="dim-btn" data-dim="level">🎯 依關卡難度</button>
          </div>

          <!-- Dynamic Sub-bars -->
          <div id="subThemeBar" class="parent-theme-bar" style="display:none;"></div>
          <div id="subAzBar" class="parent-az-bar" style="display:none;"></div>
          <div id="subLevelBar" class="parent-filter-row" style="display:none;">
            <button class="parent-lv-chip active" data-lv="0">全部關卡 (2055)</button>
            <button class="parent-lv-chip" data-lv="1">Level 1 · 國一基礎</button>
            <button class="parent-lv-chip" data-lv="2">Level 2 · 國一進階</button>
            <button class="parent-lv-chip" data-lv="3">Level 3 · 國二核心</button>
            <button class="parent-lv-chip" data-lv="4">Level 4 · 國二進階</button>
            <button class="parent-lv-chip" data-lv="5">Level 5 · 國三挑戰</button>
          </div>

          <!-- Tools & Batch Actions -->
          <div class="parent-list-tools">
            <span id="pFilterStatus" style="color:var(--ink2)">符合條件：<b id="pFilteredCount" style="color:var(--violet-d)">0</b> 字</span>
            <div>
              <button class="parent-tool-btn" id="pSelectPage">全選本頁</button>
              <button class="parent-tool-btn" id="pDeselectPage">取消本頁</button>
              <button class="parent-tool-btn" id="pSelectAll">全選此條件</button>
            </div>
          </div>

          <!-- Word List -->
          <div class="parent-word-list" id="pWordList"></div>

          <!-- Pagination Bar -->
          <div class="parent-pagination" id="pPagination">
            <div class="page-btn-group">
              <button class="page-btn" id="pgFirst" title="第一頁">⏮</button>
              <button class="page-btn" id="pgPrev" title="上一頁">◀ 上一頁</button>
              <span id="pgInfo" style="margin: 0 4px; color:var(--ink2);">第 1 / 1 頁</span>
              <button class="page-btn" id="pgNext" title="下一頁">下一頁 ▶</button>
              <button class="page-btn" id="pgLast" title="最末頁">⏭</button>
            </div>
            <div>
              <select class="page-select" id="pgSizeSelect">
                <option value="50">每頁 50 字</option>
                <option value="100">每頁 100 字</option>
                <option value="all">全部展開</option>
              </select>
            </div>
          </div>
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
  const pSearchClear = $p("#pSearchClear");
  const pCustomInput = $p("#pCustomInput");
  const pParseMsg = $p("#pParseMsg");
  const subThemeBar = $p("#subThemeBar");
  const subAzBar = $p("#subAzBar");
  const subLevelBar = $p("#subLevelBar");

  // Render Sub Theme Chips
  THEMES.forEach((thm) => {
    const btn = document.createElement("button");
    btn.className = "theme-chip";
    btn.dataset.tid = thm.id;
    btn.textContent = thm.name;
    btn.onclick = () => {
      if (selectedTheme === thm.id) {
        selectedTheme = null;
        btn.classList.remove("active");
      } else {
        selectedTheme = thm.id;
        subThemeBar.querySelectorAll(".theme-chip").forEach((c) => c.classList.remove("active"));
        btn.classList.add("active");
      }
      currentPage = 1;
      renderWordList();
    };
    subThemeBar.append(btn);
  });

  // Render Sub A-Z Chips
  const allAzChip = document.createElement("button");
  allAzChip.className = "az-chip active";
  allAzChip.textContent = "All";
  allAzChip.onclick = () => {
    selectedLetter = null;
    subAzBar.querySelectorAll(".az-chip").forEach((c) => c.classList.remove("active"));
    allAzChip.classList.add("active");
    currentPage = 1;
    renderWordList();
  };
  subAzBar.append(allAzChip);

  LETTERS.forEach((lt) => {
    const btn = document.createElement("button");
    btn.className = "az-chip";
    btn.textContent = lt;
    btn.onclick = () => {
      selectedLetter = lt;
      subAzBar.querySelectorAll(".az-chip").forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      currentPage = 1;
      renderWordList();
    };
    subAzBar.append(btn);
  });

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
    const thmObj = selectedTheme ? THEMES.find((t) => t.id === selectedTheme) : null;

    return words.filter((w) => {
      if (navDim === "level" || selectedLevel > 0) {
        if (selectedLevel > 0 && w.level !== selectedLevel) return false;
      }
      if (navDim === "az" && selectedLetter) {
        if (!w.word.toUpperCase().startsWith(selectedLetter)) return false;
      }
      if (navDim === "theme" && thmObj) {
        const text = (w.word + " " + (w.zh || "")).toLowerCase();
        if (!thmObj.reg.test(text)) return false;
      }
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

  let lastFiltered = [];

  function renderWordList() {
    const filtered = getFilteredWords();
    lastFiltered = filtered;
    pFilteredCount.textContent = filtered.length;
    pWordList.innerHTML = "";

    const totalPages = pageSize === Infinity ? 1 : Math.ceil(filtered.length / pageSize) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = pageSize === Infinity ? 0 : (currentPage - 1) * pageSize;
    const endIdx = pageSize === Infinity ? filtered.length : Math.min(startIdx + pageSize, filtered.length);
    const pageSlice = filtered.slice(startIdx, endIdx);

    // Update Pagination UI
    const pgFirst = $p("#pgFirst");
    const pgPrev = $p("#pgPrev");
    const pgNext = $p("#pgNext");
    const pgLast = $p("#pgLast");
    const pgInfo = $p("#pgInfo");

    if (filtered.length === 0) {
      pgInfo.textContent = "第 0 / 0 頁";
      pgFirst.disabled = true; pgPrev.disabled = true;
      pgNext.disabled = true; pgLast.disabled = true;
      pWordList.innerHTML = `<div style="padding:24px;text-align:center;color:var(--ink3);font-size:13px">沒有符合條件的單字</div>`;
      return;
    }

    pgInfo.textContent = `第 ${currentPage} / ${totalPages} 頁 (本頁 ${pageSlice.length} 字 / 共 ${filtered.length} 字)`;
    pgFirst.disabled = currentPage === 1;
    pgPrev.disabled = currentPage === 1;
    pgNext.disabled = currentPage === totalPages;
    pgLast.disabled = currentPage === totalPages;

    pageSlice.forEach((w) => {
      const item = document.createElement("div");
      item.className = "parent-word-item";
      const isChecked = selectedIds.has(w.id);
      const phon = w.ph ? ` [${w.ph}]` : "";
      const isWrong = wrongSet.has(w.id);
      const isMast = !unmastSet.has(w.id);
      const badge = isWrong
        ? `<span class="p-w-badge" style="color:var(--coral)" title="曾拼錯">❌ 曾錯</span>`
        : isMast
        ? `<span class="p-w-badge" style="color:var(--green)" title="已精通">⭐ 精通</span>`
        : "";

      item.innerHTML = `
        <input type="checkbox" data-id="${w.id}" ${isChecked ? "checked" : ""}>
        <button class="p-w-speak" title="試聽發音">🔊</button>
        <span class="p-w-text">${w.word}</span>
        <span class="p-w-zh">${w.zh || ""}${phon}</span>
        ${badge}
        <span class="p-w-lv" style="background:${levelColor(w.level)}">L${w.level}</span>
      `;

      const cb = item.querySelector("input[type='checkbox']");
      const speakBtn = item.querySelector(".p-w-speak");

      speakBtn.onclick = (e) => {
        e.stopPropagation();
        say(w.word);
      };

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
        if (e.target !== cb && e.target !== speakBtn) toggle();
      };
      cb.onchange = () => toggle();

      pWordList.append(item);
    });

    pWordList.scrollTop = 0;
  }

  // --- Pagination Button Events ---
  $p("#pgFirst").onclick = () => { currentPage = 1; renderWordList(); };
  $p("#pgPrev").onclick = () => { if (currentPage > 1) { currentPage--; renderWordList(); } };
  $p("#pgNext").onclick = () => {
    const totalPages = pageSize === Infinity ? 1 : Math.ceil(lastFiltered.length / pageSize);
    if (currentPage < totalPages) { currentPage++; renderWordList(); }
  };
  $p("#pgLast").onclick = () => {
    currentPage = pageSize === Infinity ? 1 : Math.ceil(lastFiltered.length / pageSize);
    renderWordList();
  };

  $p("#pgSizeSelect").onchange = (e) => {
    const val = e.target.value;
    pageSize = val === "all" ? Infinity : parseInt(val);
    currentPage = 1;
    renderWordList();
  };

  // --- Dimension Switcher Events ---
  overlay.querySelectorAll(".dim-btn").forEach((btn) => {
    btn.onclick = () => {
      overlay.querySelectorAll(".dim-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      navDim = btn.dataset.dim;

      subThemeBar.style.display = navDim === "theme" ? "flex" : "none";
      subAzBar.style.display = navDim === "az" ? "flex" : "none";
      subLevelBar.style.display = navDim === "level" ? "flex" : "none";

      if (navDim === "all") {
        selectedTheme = null;
        selectedLetter = null;
        selectedLevel = 0;
      }
      currentPage = 1;
      renderWordList();
    };
  });

  // --- Level filter inside Level Bar ---
  subLevelBar.querySelectorAll(".parent-lv-chip").forEach((chip) => {
    chip.onclick = () => {
      subLevelBar.querySelectorAll(".parent-lv-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      selectedLevel = +chip.dataset.lv;
      currentPage = 1;
      renderWordList();
    };
  });

  // --- Search & Clear ---
  pSearch.oninput = (e) => {
    searchQuery = e.target.value;
    pSearchClear.style.display = searchQuery ? "block" : "none";
    currentPage = 1;
    renderWordList();
  };
  pSearchClear.onclick = () => {
    pSearch.value = "";
    searchQuery = "";
    pSearchClear.style.display = "none";
    currentPage = 1;
    renderWordList();
    pSearch.focus();
  };

  // --- Quick Mission Packs ---
  $p("#preSmart15").onclick = () => {
    const wrongCandidates = words.filter((w) => wrongSet.has(w.id));
    const unmastCandidates = words.filter((w) => unmastSet.has(w.id) && !wrongSet.has(w.id));
    const otherCandidates = words.filter((w) => !wrongSet.has(w.id) && !unmastSet.has(w.id));

    const picks = [];
    shuffle(wrongCandidates).slice(0, 8).forEach((w) => picks.push(w.id));
    shuffle(unmastCandidates).slice(0, 15 - picks.length).forEach((w) => picks.push(w.id));
    if (picks.length < 15) {
      shuffle(otherCandidates).slice(0, 15 - picks.length).forEach((w) => picks.push(w.id));
    }

    picks.forEach((id) => selectedIds.add(id));
    updateSelectedChips();
    updateListCheckboxes();
    pGoalInput.value = Math.max(15, getTotalCount());
    alert(`🎉 已為您智能推薦 ${picks.length} 個重點單字（包含曾拼錯字與未精通單字）！`);
  };

  $p("#preAllWrong").onclick = () => {
    if (everWrongIds.length === 0) {
      alert("目前沒有拼錯紀錄，太棒了！");
      return;
    }
    everWrongIds.forEach((id) => selectedIds.add(id));
    updateSelectedChips();
    updateListCheckboxes();
    pGoalInput.value = Math.max(everWrongIds.length, getTotalCount());
    alert(`已將全部 ${everWrongIds.length} 個曾拼錯的單字加入練習清單！`);
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

  // --- Batch selection tools ---
  $p("#pSelectPage").onclick = () => {
    const startIdx = pageSize === Infinity ? 0 : (currentPage - 1) * pageSize;
    const endIdx = pageSize === Infinity ? lastFiltered.length : Math.min(startIdx + pageSize, lastFiltered.length);
    const slice = lastFiltered.slice(startIdx, endIdx);
    slice.forEach((w) => selectedIds.add(w.id));
    updateSelectedChips();
    updateListCheckboxes();
  };

  $p("#pDeselectPage").onclick = () => {
    const startIdx = pageSize === Infinity ? 0 : (currentPage - 1) * pageSize;
    const endIdx = pageSize === Infinity ? lastFiltered.length : Math.min(startIdx + pageSize, lastFiltered.length);
    const slice = lastFiltered.slice(startIdx, endIdx);
    slice.forEach((w) => selectedIds.delete(w.id));
    updateSelectedChips();
    updateListCheckboxes();
  };

  $p("#pSelectAll").onclick = () => {
    lastFiltered.forEach((w) => selectedIds.add(w.id));
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
    pBankArea.style.display = "flex";
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
export function renderSummary(d, callbacks = {}) {
  const { onOpenParentConfig, onClearParentConfig, onQuickAssignWrong, onQuickAssignLevel } = callbacks;
  const parentConfig = d.parentConfig || { active: false, wordIds: [], customWords: [], goal: 0 };
  const hasParentWords = (parentConfig.wordIds && parentConfig.wordIds.length > 0) ||
                         (parentConfig.customWords && parentConfig.customWords.length > 0);
  const isParentActive = hasParentWords && parentConfig.active;
  const parentTotal = hasParentWords
    ? (parentConfig.wordIds.length + parentConfig.customWords.length)
    : 0;
  const parentGoal = parentConfig.goal || parentTotal || 10;
  const everWrongCount = d.everWrongWords ? d.everWrongWords.length : (d.everWrongIds ? d.everWrongIds.length : 0);

  // Chips preview for parent active words
  let parentChipsHtml = "";
  if (isParentActive) {
    const previewList = [];
    if (parentConfig.customWords) {
      parentConfig.customWords.forEach((cw) => previewList.push({ word: cw.word, isCustom: true }));
    }
    if (parentConfig.wordIds) {
      parentConfig.wordIds.slice(0, 15).forEach((id) => {
        const found = (d.wordsMap && d.wordsMap.get(id)) || (d.words && d.words.find((w) => w.id === id));
        previewList.push({ word: found ? found.word : id, isCustom: false });
      });
    }
    const chipsSlice = previewList.slice(0, 12);
    parentChipsHtml = chipsSlice
      .map((c) => `<span class="sp-chip ${c.isCustom ? "custom" : ""}">${c.isCustom ? "⭐ " : ""}${c.word}</span>`)
      .join("");
    if (parentTotal > 12) {
      parentChipsHtml += `<span class="sp-chip more">+${parentTotal - 12} 字</span>`;
    }
  }

  const lvRows = d.levels
    .map((L) => `<tr>
      <td><span style="color:${levelColor(L.level)}">●</span> Level ${L.level}「${levelName(L.level)}」</td>
      <td>正確率 ${L.rate}%／精通 ${L.mast}／共 ${L.total}</td>
      <td style="text-align:right">
        <button class="quick-assign-btn" data-assign-lv="${L.level}" title="指派 Level ${L.level}（${L.total}字）為今日練習">🎯 指定此關</button>
      </td>
    </tr>`)
    .join("");

  const chip = (w) => `<span class="wchip">${w.word}</span>`;
  const fchip = (w) => `<span class="wchip fixed">${w.word}</span>`;
  const echip = (w) => `<span class="wchip wrong">${w.word}</span>`;
  const none = (t) => `<span style="color:var(--ink3);font-size:13px">${t}</span>`;
  const mastered = d.mastered.slice(0, 60), fixed = d.fixed.slice(0, 60);
  const wrongList = (d.everWrongWords || []).slice(0, 60);

  el.summary.innerHTML = `
    <h3>📊 學習歷程 · 家長專區 <a id="sumClose">收起 ✕</a></h3>

    <!-- Parent Mission Control Card -->
    <div class="summary-parent-card">
      <div class="sp-card-head">
        <div class="sp-card-title">👨‍👩‍👧 家長專區 · 今日任務指派</div>
        <div class="sp-badge ${isParentActive ? "active" : ""}">
          ${isParentActive ? `🌟 已指定 ${parentTotal} 字（目標 ${parentGoal} 題）` : "💡 系統自適應出題中"}
        </div>
      </div>
      <div class="sp-card-body">
        ${isParentActive ? `
          <div class="sp-desc">學生今日進入練習將直接測驗您挑選的專屬單字：</div>
          <div class="sp-chips-bar">${parentChipsHtml}</div>
          <div class="sp-actions">
            <button class="btn ghost sm" id="sumParentEdit">⚙️ 調整單字清單</button>
            <button class="btn ghost sm" id="sumParentClear" style="color:var(--coral)">🔄 取消指定（切換回自適應出題）</button>
          </div>
        ` : `
          <div class="sp-desc">目前學生由系統自適應推薦出題。家長可點擊下方按鈕挑選 2000 字庫，或直接貼上補習班/學校小考單字：</div>
          <div class="sp-actions" style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
            <a href="https://script.google.com/macros/s/AKfycbyARhCcpjjkaLlDgibuPSOYb5bL6FcglsxnWMtDqfisOwbKP60E1jKsfa0Pzb69iGTb/exec" target="_blank" class="btn primary sm" style="text-decoration:none; display:inline-flex; align-items:center; gap:6px; background:#8b6cf0; color:#fff; font-weight:700;">
              📊 開啟「學生學習歷程與家長出題儀表板」 ➔
            </a>
            <button class="btn ghost sm" id="sumParentSetup">⚙️ 本地選字</button>
            ${everWrongCount > 0 ? `<button class="btn ghost sm highlight" id="sumAssignWrongTop">⚠️ 一鍵曾錯字 (${everWrongCount})</button>` : ""}
          </div>
        `}
      </div>
    </div>

    <div class="bigrate">
      <b class="tnum">${d.passRate}%</b>
      <span>總答對率<br><small>${d.correct} 題對 / 共作答 ${d.attempts} 題</small></span>
      <span style="margin-left:auto;text-align:right">
        <b class="tnum" style="font-size:30px;color:var(--violet)">${d.distinctCorrect}</b><br>
        <small>答對過的字（不重複）／ 共 ${d.total} 字</small></span>
    </div>

    <div class="subh">各關卡進度（點擊可快速指派關卡練習）</div>
    <table class="sumtable">${lvRows}</table>

    <div class="subh" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <span>⚠️ 曾拼錯單字（共 ${everWrongCount} 字）</span>
      ${everWrongCount > 0 ? `<button class="quick-assign-btn highlight" id="sumAssignWrongSec" title="將所有錯字指派為今日練習">⚡ 一鍵指派曾錯字特訓</button>` : ""}
    </div>
    <div class="chips-wrap">${wrongList.length ? wrongList.map(echip).join("") : none("目前沒有任何拼錯紀錄，太棒了！")}</div>

    <div class="subh">✅ 已精通 ${d.mastered.length} 字（連續答對 3 次）</div>
    <div class="chips-wrap">${mastered.length ? mastered.map(chip).join("") : none("還沒有，繼續加油！")}</div>

    <div class="subh">🛠️ 曾拼錯、現在已訂正精通 ${d.fixed.length} 字</div>
    <div class="chips-wrap">${fixed.length ? fixed.map(fchip).join("") : none("目前沒有")}</div>

    <div class="subh">📅 練習紀錄（最近 4 週）</div>
    <div class="streakline">🔥 連續 <b>${d.history.streak}</b> 天　·　最佳 <b>${d.history.best}</b> 天　·　累計練習 <b>${d.history.total}</b> 天</div>
    <div class="heatmap">${d.history.days.map((x) =>
      `<i class="hc h${x.level}" title="${x.key}：${x.a ? "作答 " + x.a + " · 正確率 " + x.rate + "%" : "沒有練習"}"></i>`).join("")}</div>
  `;

  $("#sumClose").onclick = () => { el.summary.hidden = true; };
  if ($("#sumParentSetup")) $("#sumParentSetup").onclick = onOpenParentConfig;
  if ($("#sumParentEdit")) $("#sumParentEdit").onclick = onOpenParentConfig;
  if ($("#sumParentClear")) $("#sumParentClear").onclick = onClearParentConfig;
  if ($("#sumAssignWrongTop")) $("#sumAssignWrongTop").onclick = onQuickAssignWrong;
  if ($("#sumAssignWrongSec")) $("#sumAssignWrongSec").onclick = onQuickAssignWrong;

  el.summary.querySelectorAll("[data-assign-lv]").forEach((btn) => {
    btn.onclick = () => {
      const lv = parseInt(btn.dataset.assignLv);
      if (onQuickAssignLevel) onQuickAssignLevel(lv);
    };
  });
}

export function toggleSummary(data, callbacks = {}) {
  el.summary.hidden = !el.summary.hidden;
  if (!el.summary.hidden) {
    renderSummary(data, callbacks);
    el.summary.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
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
