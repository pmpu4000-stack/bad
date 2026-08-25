// store.js - 處理遊戲狀態、進度與 localStorage 儲存

const STORAGE_KEY = 'spelling_history_logs';

// 1. 取得當天日期的輔助函式 (YYYY-MM-DD)
function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 載入進度：讀取陣列最後一筆（當天最新）的資料
 */
export function loadProgress() {
  try {
    const rawData = localStorage.getItem(STORAGE_KEY);
    if (!rawData) return null;

    const logs = JSON.parse(rawData);
    
    // 如果是舊版的單一物件結構，兼容處理直接回傳
    if (!Array.isArray(logs)) {
      return logs;
    }

    // 如果是新版的陣列結構，抓取最後一筆（最新、當天）的 data
    if (logs.length > 0) {
      const latestEntry = logs[logs.length - 1];
      return latestEntry.data || null;
    }
  } catch (e) {
    console.error("讀取 localStorage 失敗：", e);
  }
  
  return null;
}

/**
 * 儲存進度：一天一筆、同天多次上傳自動覆蓋，隔天往下新增
 * @param {Object} stateData - 你原本完整的遊戲狀態資料
 */
export function saveProgress(stateData) {
  try {
    const today = getTodayDateString();
    
    // 1. 讀取現有的歷史紀錄陣列（若無則初始化為空陣列）
    let logs = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];

    // 如果舊資料不是陣列（防禦性相容舊格式），先轉成陣列包裹起來
    if (!Array.isArray(logs)) {
      logs = [{ date: getTodayDateString(), timestamp: new Date().toISOString(), data: logs }];
    }

    // 2. 建立當天要記錄的資料結構
    const newEntry = {
      date: today,
      timestamp: new Date().toISOString(),
      data: stateData
    };

    // 3. 檢查陣列最後一筆是否為今天
    const lastIndex = logs.length - 1;
    if (lastIndex >= 0 && logs[lastIndex].date === today) {
      // 如果是今天：直接覆蓋最後一筆（同天多次上傳覆蓋）
      logs[lastIndex] = newEntry;
    } else {
      // 如果不是今天（跨日）：新增一筆往下推
      logs.push(newEntry);
    }

    // 4. 寫回 localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
  } catch (e) {
    console.error("儲存 localStorage 失敗（可能空間已滿）：", e);
  }
}
