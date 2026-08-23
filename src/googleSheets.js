const SHEET_API_URL =
  "https://script.google.com/macros/s/AKfycbwTqq9cHd27xd9Lk2oZqqfcsmFR8Mdmog0wCRvljOpCFQPAERSj31tqNAZqfYc7NUX_/exec";

async function post(payload) {
  const response = await fetch(SHEET_API_URL, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function uploadProgress(username, progressData) {
  if (!username) return { success: false, message: "請先登入" };
  try {
    const result = await post({
      action: "save",
      username,
      data: progressData,
      timestamp: new Date().toISOString(),
    });
    return {
      success: result.status === "success",
      message: result.message || (result.status === "success" ? "上傳成功" : "上傳失敗"),
    };
  } catch (error) {
    console.error("uploadProgress failed:", error);
    return { success: false, message: "上傳失敗，請稍後再試" };
  }
}

export async function downloadProgress(username) {
  if (!username) return { success: false, message: "請先登入" };
  try {
    const result = await post({ action: "load", username });
    if (result.status !== "success" || !result.data) {
      return { success: false, message: result.message || "找不到雲端進度" };
    }
    const data = typeof result.data === "string" ? result.data : JSON.stringify(result.data);
    return { success: true, data };
  } catch (error) {
    console.error("downloadProgress failed:", error);
    return { success: false, message: "下載失敗，請稍後再試" };
  }
}
