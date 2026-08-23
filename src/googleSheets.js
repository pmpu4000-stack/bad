const SHEET_API_URL = "https://script.google.com/macros/s/AKfycbwTqq9cHd27xd9Lk2oZqqfcsmFR8Mdmog0wCRvljOpCFQPAERSj31tqNAZqfYc7NUX_/exec";

async function postJson(payload) {
  const res = await fetch(SHEET_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
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
