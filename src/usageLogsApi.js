const TOKEN_KEY = "spellAgent.authToken";

function authHeaders() {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: ["Bearer", token].join(" ") } : {};
}

async function parseResponse(res) {
  if (res.ok) return res.json();
  let message = `Request failed: ${res.status}`;
  try {
    const body = await res.json();
    if (body?.message) message = body.message;
  } catch {
    // ignore invalid json body
  }
  const err = new Error(message);
  err.status = res.status;
  throw err;
}

export async function createUsageLog(action, detail) {
  const res = await fetch("/api/usage-logs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ action, detail }),
  });
  return parseResponse(res);
}

export async function fetchUsageLogs({ limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  const res = await fetch(`/api/usage-logs?${params.toString()}`, {
    headers: authHeaders(),
  });
  return parseResponse(res);
}

export { TOKEN_KEY };
