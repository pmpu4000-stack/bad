const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const express = require("express");
const Database = require("better-sqlite3");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-change-this-secret";
const TOKEN_EXPIRES_IN = process.env.TOKEN_EXPIRES_IN || "7d";
const DATA_DIR = path.join(__dirname, "server-data");
const DB_PATH = path.join(DATA_DIR, "app.db");
const MIGRATION_PATH = path.join(__dirname, "db", "migrations", "001_init_auth_and_usage_logs.sql");

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(fs.readFileSync(MIGRATION_PATH, "utf8"));

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = String(storedHash || "").split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(candidate, "hex"));
}

function seedUsersIfEmpty() {
  const count = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  if (count > 0) return;

  const defaultUsers = process.env.SEED_USERS
    ? process.env.SEED_USERS.split(",").map((entry) => {
      const [username, password] = entry.split(":");
      return { username: username?.trim(), password: password?.trim() };
    }).filter((u) => u.username && u.password)
    : [
      { username: "studentA", password: "pass1234" },
      { username: "studentB", password: "pass1234" },
    ];

  const insert = db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)");
  const tx = db.transaction((users) => {
    for (const user of users) insert.run(user.username, hashPassword(user.password));
  });
  tx(defaultUsers);
}

seedUsersIfEmpty();

app.use(express.json({ limit: "64kb" }));

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const token = auth.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: Number(payload.sub), username: payload.username };
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
}

app.post("/api/login", (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  if (!username || !password) {
    res.status(400).json({ message: "username and password are required" });
    return;
  }

  const user = db.prepare("SELECT id, username, password_hash FROM users WHERE username = ?").get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    res.status(401).json({ message: "invalid credentials" });
    return;
  }

  const token = jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, { expiresIn: TOKEN_EXPIRES_IN });
  res.json({ token, user: { id: user.id, username: user.username } });
});

app.get("/api/me", authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

app.post("/api/usage-logs", authMiddleware, (req, res) => {
  const action = String(req.body?.action || "").trim();
  const detail = req.body?.detail === undefined ? null : req.body.detail;
  if (!action) {
    res.status(400).json({ message: "action is required" });
    return;
  }

  const result = db.prepare(
    "INSERT INTO usage_logs (user_id, action, detail) VALUES (?, ?, ?)"
  ).run(req.user.id, action, detail === null ? null : JSON.stringify(detail));

  const created = db.prepare(
    "SELECT id, user_id, action, detail, created_at FROM usage_logs WHERE id = ?"
  ).get(result.lastInsertRowid);

  res.status(201).json({
    id: created.id,
    user_id: created.user_id,
    action: created.action,
    detail: created.detail ? JSON.parse(created.detail) : null,
    created_at: created.created_at,
  });
});

app.get("/api/usage-logs", authMiddleware, (req, res) => {
  const rawLimit = Number(req.query.limit);
  const rawOffset = Number(req.query.offset);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100) : 20;
  const offset = Number.isFinite(rawOffset) ? Math.max(Math.trunc(rawOffset), 0) : 0;

  const rows = db.prepare(
    `SELECT id, user_id, action, detail, created_at
     FROM usage_logs
     WHERE user_id = ?
     ORDER BY id DESC
     LIMIT ? OFFSET ?`
  ).all(req.user.id, limit, offset);

  res.json({
    items: rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      action: row.action,
      detail: row.detail ? JSON.parse(row.detail) : null,
      created_at: row.created_at,
    })),
    limit,
    offset,
  });
});

app.use(express.static(__dirname));

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running at http://localhost:${PORT}`);
});
