# 拼字小特工 · Spelling Agent

A spelling trainer for kids learning English (Taiwan 國中 2000-word list).
Built for phonics (自然拼音) learners who read fine but struggle to **spell**. All ~2000 words are
graded into **5 levels**; a short **placement test** finds where the student belongs, then it plays
as a **level-up game** — practice a level, and once your accuracy passes **80%** you can take the
**level challenge** to climb to the next one. Every word shows its **Chinese meaning, KK phonetic, and an
example sentence**. Audio, spaced repetition, and a progress dashboard throughout.

**Vanilla JavaScript (ES modules) — no framework, no build step, no dependencies.**
It just needs to be *served* over http (a one-line local server, or GitHub Pages), because
browsers block ES modules when a page is opened directly from `file://`.

---

## How to run it

### Option 1 — Local (one command, works offline)
From this folder, start any static server and open the page:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/ in your browser
```

(Any static server works — VS Code's "Live Server" extension, `npx serve`, etc.)

### Option 2 — GitHub Pages (best for iPad / sharing a link)

> Not enabled yet — these are the steps to turn it on whenever you want.

**Method A — web UI:**
1. Go to the repo **Settings → Pages → Build and deployment → Source: _Deploy from a branch_**.
2. Choose branch `main`, folder `/ (root)`, then **Save**.
3. Wait ~1 minute. The link will be `https://deanliao.github.io/vocab_tutor/`.
   Open it on any device and bookmark it.

**Method B — one command (GitHub CLI):**
```bash
gh api -X POST repos/deanliao/vocab_tutor/pages -f 'source[branch]=main' -f 'source[path]=/'
```

Because `index.html` is the entry point, the Pages link is just the clean root URL above.

---

## Can my friend run it? Is setup hard?

**No install, no build, no dependencies** — but it does need to be *served* (not double-clicked),
since it uses ES modules. Easiest paths:

- **Open the GitHub Pages link** (Option 2) — nothing to install, works on any device.
- **Or** run `python3 -m http.server` in the folder and open `http://localhost:8000/`.

### Good to know
- Each person's **progress is saved privately in their own browser** (`localStorage`),
  so two kids keep separate scores. Nothing is uploaded anywhere.
- **Audio** uses the browser's built-in text-to-speech (Chrome / Safari / Edge on
  Mac / Windows / iPad / Android all have English voices). If a device has no English
  voice, the **偷看 (peek)** and answer-reveal still show the word, so practice isn't blocked.
- **GitHub Pages (https) is the most reliable**, especially on iPad.
- The in-app **重來 reset** clears saved progress.

## Google Sheets 同步（Apps Script）

1. 在同一份試算表保留工作表 **「使用者清單」**（A: username, B: password）。
2. 新增工作表 **「使用者進度」**，標題列：
   - A: `username`
   - B: `data`
   - C: `timestamp`
3. 在 Apps Script 編輯器用下列程式碼完整覆蓋：

```javascript
function doOptions(e) {
  return ContentService.createTextOutput("");
}

function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const usersSheet = ss.getSheetByName("使用者清單");
    const progressSheet = ss.getSheetByName("使用者進度");
    if (!usersSheet || !progressSheet) {
      return json({ status: "error", message: "找不到必要工作表（使用者清單 / 使用者進度）" });
    }

    const params = JSON.parse(e.postData.contents || "{}");
    const action = String(params.action || "login").trim();
    const username = String(params.username || "").trim();

    if (!username) return json({ status: "error", message: "缺少 username" });

    if (action === "save") {
      const progressData = String(params.data || "");
      const ts = String(params.timestamp || new Date().toISOString());
      if (!progressData) return json({ status: "error", message: "缺少 data" });

      const row = findRowByUsername(progressSheet, username);
      if (row === -1) progressSheet.appendRow([username, progressData, ts]);
      else progressSheet.getRange(row, 2, 1, 2).setValues([[progressData, ts]]);

      return json({ status: "success", message: "進度已保存" });
    }

    if (action === "load") {
      const row = findRowByUsername(progressSheet, username);
      if (row === -1) return json({ status: "error", message: "找不到此使用者的進度紀錄" });

      const values = progressSheet.getRange(row, 1, 1, 3).getValues()[0];
      return json({
        status: "success",
        data: String(values[1] || ""),
        timestamp: String(values[2] || ""),
        message: "進度已讀取"
      });
    }

    // 預設與舊前端相容：未傳 action 時走登入驗證
    const inputPass = String(params.password || "").trim();
    const rows = usersSheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === username && String(rows[i][1]).trim() === inputPass) {
        return json({ status: "success", message: "驗證成功" });
      }
    }
    return json({ status: "error", message: "帳號或密碼錯誤" });
  } catch (error) {
    return json({ status: "error", message: "後端錯誤：" + error.toString() });
  }
}

function findRowByUsername(sheet, username) {
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === username) return i + 1;
  }
  return -1;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

前端 `src/googleSheets.js` 已對應同一個 Apps Script Web App URL，並採用：
- `action: "save"`：上傳 `username/data/timestamp`
- `action: "load"`：依 `username` 載入進度
- 登入仍使用 `username/password` 驗證（與原本流程相容）

---

## Project structure

```
index.html            page structure (play screen + quiz screen); loads css + src/app.js
css/styles.css        all styles / theme tokens
data/words2000.json   the graded word bank: [{ w: word, t: trapLetterIndices, lv: 1-5 }]
data/meanings.json    per-word { zh: 中文, ph: phonetic, sent: example sentence } for all 2000
src/
  levels.js           level config + spelling helpers (misspelling generator, shuffle)
  data.js             curated "featured" trap words (verified 中文 + example + mask)
  wordbank.js         loads words2000.json, merges featured data → master word list
  store.js            progress, localStorage, grading, level state, stats (the "model")
  srs.js              Leitner spaced-repetition picker (scoped to a level)
  audio.js            text-to-speech wrapper
  confetti.js         celebration animation
  ui.js               all DOM rendering (the "view")
  app.js              placement → play → challenge orchestration (the "controller", entry point)
```

Data → model → view → controller are separated: `ui.js` never touches the store directly,
and `store.js` never touches the DOM.

### Editing the words
- **Levels / the full bank:** `data/words2000.json`. Each entry is `{ w, t, lv }` — the word,
  the indices of its "trap" (hard) letters, and its level 1-5. Levels were graded by a difficulty
  heuristic (length, syllables, suffixes, spelling traps); tweak `lv` to re-grade any word.
- **Meanings / phonetics / sentences:** `data/meanings.json`, keyed by word →
  `{ zh, ph, sent }`. Edit any gloss or sentence here.
- **Featured words** (extra-verified, hand-checked mask): `src/data.js`. Each is
  `[casedWord, 中文, exampleSentence, category]`, where UPPERCASE letters mark the traps —
  `"neCeSSary"` → `c, s, s`; `"Know"` → the silent `k`. A featured word overrides the bank entry.

### Where the meanings come from
Chinese meanings + KK phonetics for all ~2000 words come from **[ECDICT](https://github.com/skywind3000/ECDICT)**
(an open English↔Chinese dictionary, MIT-licensed), converted to Traditional Chinese and reduced to the
common junior-high sense. The example sentences are model-generated (simple, kid-level) and grounded on the
real meaning, so they're easy to review and edit in `data/meanings.json`.

ECDICT is MIT-licensed (Copyright © 2025 Linwei); its attribution and full license text are in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

---

## How the level game works
1. **Placement test** (first run, or the 🎯 測程度 button): an adaptive spelling ladder — hear a word,
   pick the correct spelling — that finds the level where accuracy drops, and starts you there.
2. **Practice a level** with any mode. Your **per-level accuracy** shows in the banner.
3. Once you've done ≥12 questions at **≥80%**, the **🏆 挑戰測驗 (level challenge)** unlocks.
4. Score **≥80%** on the challenge to **level up** and unlock the next level. Miss it → keep practicing.
   Cleared levels stay open for review.

## Today's training session
- Tap **▶️ 開始今天的練習** to start a session; a session panel tracks **作答 / 答對 / 答錯 / 正確率**
  with its own bar that fills toward a daily goal (`DAILY_GOAL`, default 20). This is separate from
  the overall progress bar at the bottom.
- Tap **⏹ 結束今天的練習** to finish — you get a recap (questions done, accuracy, distinct words,
  newly mastered). A session is scoped to one day and auto-closes if left open overnight.
- **練習紀錄 (history):** the 📊 summary panel shows a 4-week calendar heatmap of daily activity,
  plus **🔥 current streak / best streak / total days practiced** (a day counts once you've
  answered at least one question during a session).

## Modes & scoring
- **🎧 聽與拼** hear it, spell it · **✅ 選拼法** pick the correct spelling ·
  **🧩 重組** unscramble · **🖍️ 填陷阱** fill only the hard (trap) letters.
- Words you miss come back sooner (Leitner spaced repetition, within your level).
- Dashboard tracks **等級 (level)**, **答對字 (distinct words correct)**, streak, and **答對率 (pass rate)**;
  熟練度: **學習中** = right once · **練習中** = 2 in a row · **精通** = 3 in a row.
- **📊 學習總結** shows pass rate, per-level progress, mastered words, and words once
  misspelled and now corrected.

## Companion docs
- `拼字訓練計畫.md` — the teaching plan: the 6 trap categories, the Top-100 word list,
  the study method (Look–Say–Cover–Write–Check), a weekly schedule, and coaching tips.
- `國中2000單字.md` — the full verified 2000-word source list.

## License
This project is MIT-licensed — see [LICENSE](LICENSE). It also redistributes third-party
dictionary data (ECDICT); see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for attributions.
