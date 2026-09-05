// =====================================================================
// Code.gs — Google Apps Script 後端處理程式
// 提供學生端 (GitHub Pages) 與 家長儀表板 (Web App) 資料同步與任務指派
// =====================================================================

const SPREADSHEET_ID = ""; // 若綁定在試算表上可留空，或填入試算表 ID
const USERS_SHEET_NAME = "users"; // 使用者帳密試算表 (若有)
const DATA_SHEET_PREFIX = "log_"; // 學生作答紀錄工作表前綴

function getSpreadsheet() {
  if (SPREADSHEET_ID) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Web App GET 請求：顯示家長與學生學習歷程儀表板 HTML
 */
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile("index")
    .setTitle("學生學習歷程儀表板 · 家長專區")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Web App POST 請求：接收學生端登入與儲存作答紀錄
 */
function doPost(e) {
  try {
    const contents = e.postData ? e.postData.contents : "{}";
    const body = JSON.parse(contents);
    const action = body.action;

    if (action === "login") {
      return authenticateUser(body.username, body.password);
    } else if (action === "saveRecord") {
      return handleSaveRecord(body.username, body.records);
    } else if (action === "saveParentConfig") {
      return jsonResponse(saveParentConfig({ username: body.username, parentConfig: body.parentConfig }));
    }

    return jsonResponse({ status: "error", message: "未知的請求動作" });
  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  }
}

/**
 * 輔助函數：回傳 JSON 回應
 */
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * 1. 學生/家長身分驗證
 */
function authenticateUser(username, password) {
  try {
    const ss = getSpreadsheet();
    let usersSheet = ss.getSheetByName(USERS_SHEET_NAME);
    
    // 若沒有 users 表，嘗試直接找學生個人工作表
    let userValid = false;
    if (usersSheet) {
      const uData = usersSheet.getDataRange().getValues();
      for (let i = 1; i < uData.length; i++) {
        if (String(uData[i][0]).trim() === String(username).trim() &&
            String(uData[i][1]).trim() === String(password).trim()) {
          userValid = true;
          break;
        }
      }
    } else {
      // 容錯模式：若無特定 users 工作表，允許登入
      userValid = true;
    }

    if (!userValid) {
      return jsonResponse({ status: "error", message: "帳號或密碼錯誤！" });
    }

    // 讀取該學生的歷史紀錄與最新完整 JSON
    const records = getLatestStudentRecords(username);
    return jsonResponse({ status: "success", username: username, records: records });
  } catch (err) {
    return jsonResponse({ status: "error", message: "驗證失敗：" + err.toString() });
  }
}

/**
 * 取得學生最新一筆完整備份紀錄 (用來同步 LocalStorage)
 */
function getLatestStudentRecords(username) {
  try {
    const ss = getSpreadsheet();
    const sheetName = sanitizeSheetName(username);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return null;

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return null;

    const headers = data[0];
    const rawJsonCol = headers.indexOf("完整JSON");
    if (rawJsonCol === -1) return null;

    // 從最新一筆 (最後一列) 讀取完整 JSON
    const latestRawJson = data[data.length - 1][rawJsonCol];
    if (!latestRawJson) return null;

    return JSON.parse(latestRawJson);
  } catch (e) {
    return null;
  }
}

/**
 * 2. 儲存學生作答紀錄 (由 GitHub Pages 上傳)
 */
function handleSaveRecord(username, records) {
  try {
    const ss = getSpreadsheet();
    const sheetName = sanitizeSheetName(username);
    let sheet = ss.getSheetByName(sheetName);

    const defaultHeaders = [
      "備份時間", "作答題數", "答對題數", "正確率", "精通", "分數",
      "答對單字數", "學習中", "練習中",
      "LEVEL1入門\n答對題數/作答題數",
      "LEVEL2基礎\n答對題數/作答題數",
      "LEVEL3進階\n答對題數/作答題數",
      "LEVEL4挑戰\n答對題數/作答題數",
      "LEVEL5精熟\n答對題數/作答題數",
      "等級", "連勝", "最佳連勝", "完整JSON"
    ];

    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(defaultHeaders);
    }

    // 解析 spellAgent.v2
    let spellData = {};
    if (records && records["spellAgent.v2"]) {
      try {
        spellData = typeof records["spellAgent.v2"] === "string"
          ? JSON.parse(records["spellAgent.v2"])
          : records["spellAgent.v2"];
      } catch (e) {}
    }

    const nowStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");
    const attempts = spellData.attempts || 0;
    const correct = spellData.correct || 0;
    const rate = attempts ? Math.round((correct / attempts) * 100) + "%" : "0%";
    
    // 計算精通/練習中/學習中
    let mast = 0, prac = 0, learn = 0;
    if (spellData.box) {
      for (const id in spellData.box) {
        const b = spellData.box[id];
        if (b >= 3) mast++;
        else if (b === 2) prac++;
        else if (b === 1) learn++;
      }
    }
    const score = spellData.points || 0;
    const distWord = spellData.stat ? Object.values(spellData.stat).filter(s => s.c > 0).length : 0;

    const lstat = spellData.lstat || {};
    const fmtLv = (lv) => {
      const s = lstat[lv] || { a: 0, c: 0 };
      return s.c + "/" + s.a;
    };

    const row = [
      nowStr,
      attempts,
      correct,
      rate,
      mast,
      score,
      distWord,
      learn,
      prac,
      fmtLv(1),
      fmtLv(2),
      fmtLv(3),
      fmtLv(4),
      fmtLv(5),
      spellData.level ? spellData.level.current || 1 : 1,
      spellData.streak || 0,
      spellData.best || 0,
      JSON.stringify(records)
    ];

    sheet.appendRow(row);
    return jsonResponse({ status: "success", message: "紀錄儲存成功" });
  } catch (err) {
    return jsonResponse({ status: "error", message: "儲存失敗：" + err.toString() });
  }
}

/**
 * 3. 家長儀表板調用：檢查並取得完整歷史數據 (checkAndGetData)
 */
function checkAndGetData(params) {
  try {
    const username = params.username;
    const password = params.password;

    const ss = getSpreadsheet();
    let usersSheet = ss.getSheetByName(USERS_SHEET_NAME);
    if (usersSheet) {
      const uData = usersSheet.getDataRange().getValues();
      let ok = false;
      for (let i = 1; i < uData.length; i++) {
        if (String(uData[i][0]).trim() === String(username).trim() &&
            String(uData[i][1]).trim() === String(password).trim()) {
          ok = true;
          break;
        }
      }
      if (!ok) return { status: "error", message: "帳號或密碼錯誤！" };
    }

    const sheetName = sanitizeSheetName(username);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      return { status: "success", username: username, headers: [], data: [], latestParentConfig: null, parentMissions: [] };
    }

    const values = sheet.getDataRange().getValues();
    if (values.length <= 1) {
      return { status: "success", username: username, headers: [], data: [], latestParentConfig: null, parentMissions: [] };
    }

    const headers = values[0];
    const dataRows = values.slice(1);
    const rawJsonCol = headers.indexOf("完整JSON");

    // 提取最新 parentConfig 與歷次家長任務結果
    let latestParentConfig = null;
    const parentMissions = [];

    for (let i = dataRows.length - 1; i >= 0; i--) {
      const row = dataRows[i];
      if (rawJsonCol >= 0 && row[rawJsonCol]) {
        try {
          const rec = JSON.parse(row[rawJsonCol]);
          const spell = rec && rec["spellAgent.v2"] ? (typeof rec["spellAgent.v2"] === "string" ? JSON.parse(rec["spellAgent.v2"]) : rec["spellAgent.v2"]) : null;
          if (spell) {
            if (!latestParentConfig && spell.parentConfig) {
              latestParentConfig = spell.parentConfig;
            }
            // 若該筆包含家長指定練習紀錄 (session.isParentMode 或 parentConfig.active)
            if (spell.session && (spell.session.isParentMode || (spell.parentConfig && spell.parentConfig.active))) {
              parentMissions.push({
                date: String(row[0] || "").substring(0, 10),
                time: String(row[0] || ""),
                answered: spell.session.answered || 0,
                correct: spell.session.correct || 0,
                incorrect: spell.session.incorrect || 0,
                goal: spell.session.goal || (spell.parentConfig ? spell.parentConfig.goal : 0) || 0,
                rate: spell.session.answered ? Math.round((spell.session.correct / spell.session.answered) * 100) : 0,
                wordIds: spell.parentConfig ? spell.parentConfig.wordIds || [] : [],
                customWords: spell.parentConfig ? spell.parentConfig.customWords || [] : [],
                idsResult: spell.session.ids || {}, // 該次答題的單字對錯
              });
            }
          }
        } catch (e) {}
      }
    }

    // 格式化 dataRows 日期
    const formattedRows = dataRows.map(r => {
      const copy = [...r];
      if (copy[0] instanceof Date) {
        copy[0] = Utilities.formatDate(copy[0], "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");
      }
      return copy;
    });

    return {
      status: "success",
      username: username,
      headers: headers,
      data: formattedRows,
      latestParentConfig: latestParentConfig || { active: false, wordIds: [], customWords: [], goal: 0 },
      parentMissions: parentMissions
    };
  } catch (err) {
    return { status: "error", message: err.toString() };
  }
}

/**
 * 4. 家長設定儲存 (由儀表板調用)
 */
function saveParentConfig(params) {
  try {
    const username = params.username;
    const parentConfig = params.parentConfig;

    const ss = getSpreadsheet();
    const sheetName = sanitizeSheetName(username);
    let sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow([
        "備份時間", "作答題數", "答對題數", "正確率", "精通", "分數",
        "答對單字數", "學習中", "練習中",
        "LEVEL1入門\n答對題數/作答題數",
        "LEVEL2基礎\n答對題數/作答題數",
        "LEVEL3進階\n答對題數/作答題數",
        "LEVEL4挑戰\n答對題數/作答題數",
        "LEVEL5精熟\n答對題數/作答題數",
        "等級", "連勝", "最佳連勝", "完整JSON"
      ]);
    }

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const rawJsonCol = headers.indexOf("完整JSON");

    let latestRecords = {};
    if (data.length > 1 && rawJsonCol >= 0) {
      const rawText = data[data.length - 1][rawJsonCol];
      if (rawText) {
        try { latestRecords = JSON.parse(rawText); } catch (e) {}
      }
    }

    // 更新 spellAgent.v2 中的 parentConfig
    let spell = {};
    if (latestRecords["spellAgent.v2"]) {
      try {
        spell = typeof latestRecords["spellAgent.v2"] === "string"
          ? JSON.parse(latestRecords["spellAgent.v2"])
          : latestRecords["spellAgent.v2"];
      } catch (e) {}
    }

    spell.parentConfig = parentConfig;
    latestRecords["spellAgent.v2"] = JSON.stringify(spell);

    // 更新最新一列或追加一列設定備份
    if (data.length > 1 && rawJsonCol >= 0) {
      sheet.getRange(data.length, rawJsonCol + 1).setValue(JSON.stringify(latestRecords));
    } else {
      const nowStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");
      const emptyRow = new Array(headers.length).fill("");
      emptyRow[0] = nowStr;
      emptyRow[rawJsonCol] = JSON.stringify(latestRecords);
      sheet.appendRow(emptyRow);
    }

    return { status: "success", parentConfig: parentConfig };
  } catch (err) {
    return { status: "error", message: err.toString() };
  }
}

function sanitizeSheetName(name) {
  return String(name || "default").replace(/[\\\/:\?\*\[\]]/g, "_").substring(0, 30);
}
