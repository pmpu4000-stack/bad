function getSheetApiUrl() {
  return window.SHEET_API_URL || "";
}

async function postJson(payload) {
  const SHEET_API_URL = getSheetApiUrl();
  if (!SHEET_API_URL) throw new Error("Missing Google Apps Script URL");
  const res = await fetch(SHEET_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function uploadProgress(username, progressData) {
  const payload = {
    action: "save",
    username,
    data: JSON.stringify(progressData),
    timestamp: new Date().toISOString(),
  };
  return postJson(payload);
}

export async function downloadProgress(username) {
  const payload = { action: "load", username };
  return postJson(payload);
}
