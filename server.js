const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const express = require("express");
const Database = require("better-sqlite3");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const DATA_DIR = path.join(__dirname, "server-data");
const DB_PATH = path.join(DATA_DIR, "app.db");
const MIGRATION_PATH = path.join(__dirname, "db", "migrations", "001_init_auth_and_usage_logs.sql");
const DEV_SECRET_PATH = path.join(DATA_DIR, "jwt-secret.txt");
const DEV_USERS_PATH = path.join(DATA_DIR, "generated-users.json");
const TOKEN_EXPIRES_IN = process.env.TOKEN_EXPIRES_IN || "7d";

function resolveJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (IS_PRODUCTION) throw new Error("JWT_SECRET is required in production.");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DEV_SECRET_PATH)) return fs.readFileSync(DEV_SECRET_PATH, "utf8").trim();
  const generated = crypto.randomBytes(48).toString("base64url");
  fs.writeFileSync(DEV_SECRET_PATH, generated, { mode: 0o600 });
  console.warn(`Generated development JWT secret at ${DEV_SECRET_PATH}`);
  return generated;
}

const JWT_SECRET = resolveJwtSecret();

try {
  jwt.sign({ probe: true }, JWT_SECRET, { expiresIn: TOKEN_EXPIRES_IN });
} catch {
  throw new Error("TOKEN_EXPIRES_IN is invalid.");
}

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
  try {
    const stored = Buffer.from(hash, "hex");
    const actual = Buffer.from(candidate, "hex");
    if (stored.length !== actual.length) return false;
    return crypto.timingSafeEqual(stored, actual);
  } catch {
    return false;
  }
}

function seedUsersIfEmpty() {
  const count = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  if (count > 0) return;

  const seededUsers = process.env.SEED_USERS
    ? process.env.SEED_USERS.split(",").map((entry) => {
      const sep = entry.indexOf(":");
      if (sep <= 0) return null;
      const username = entry.slice(0, sep).trim();
      const password = entry.slice(sep + 1);
      return { username, password };
    }).filter((u) => u && u.username && u.password)
    : [];
  if (IS_PRODUCTION && seededUsers.length === 0) {
    throw new Error("SEED_USERS is required in production when initializing an empty database.");
  }
  const defaultUsers = seededUsers.length > 0
    ? seededUsers
    : [
      { username: "studentA", password: crypto.randomBytes(9).toString("base64url") },
      { username: "studentB", password: crypto.randomBytes(9).toString("base64url") },
    ];
  if (seededUsers.length === 0) {
    fs.writeFileSync(DEV_USERS_PATH, JSON.stringify(defaultUsers, null, 2), { mode: 0o600 });
    console.warn(`SEED_USERS not provided. Generated development users at ${DEV_USERS_PATH}`);
  }

  const insert = db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)");
  const tx = db.transaction((users) => {
    for (const user of users) insert.run(user.username, hashPassword(user.password));
  });
  tx(defaultUsers);
}

seedUsersIfEmpty();

app.use(express.json({ limit: "64kb" }));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
}));

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const token = auth.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const userId = Number(payload.sub);
    if (!Number.isFinite(userId)) {
      res.status(401).json({ message: "Invalid token" });
      return;
    }
    req.user = { id: userId, username: payload.username };
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

  const token = jwt.sign({ sub: String(user.id), username: user.username }, JWT_SECRET, { expiresIn: TOKEN_EXPIRES_IN });
  res.json({ token, user: { id: user.id, username: user.username } });
});

app.get("/api/me", authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

app.post("/api/usage-logs", authMiddleware, (req, res) => {
  const action = String(req.body?.action || "").trim();
  const detail = req.body?.detail;
  if (!action) {
    res.status(400).json({ message: "action is required" });
    return;
  }
  if (action.length > 255) {
    res.status(400).json({ message: "action is too long" });
    return;
  }
  if (detail !== undefined && detail !== null && typeof detail !== "object") {
    res.status(400).json({ message: "detail must be an object, array, or null" });
    return;
  }
  const detailText = detail === undefined || detail === null ? null : JSON.stringify(detail);

  const result = db.prepare(
    "INSERT INTO usage_logs (user_id, action, detail) VALUES (?, ?, ?)"
  ).run(req.user.id, action, detailText);

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
     ORDER BY created_at DESC, id DESC
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

app.get("/", (_, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});
app.use("/css", express.static(path.join(__dirname, "css")));
app.use("/src", express.static(path.join(__dirname, "src")));
app.use("/data", express.static(path.join(__dirname, "data")));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
