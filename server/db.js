// server/db.js
const Database = require("better-sqlite3");
const path = require("path");
const dbPath = path.join(__dirname, "database.db");
const db = new Database(dbPath);

function ensureColumn(table, column, def) {
  const info = db.prepare(`PRAGMA table_info(${table})`).all();
  const found = info.some(c => c.name === column);
  if (!found) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`).run();
  }
}

function init() {
  db.prepare(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    password TEXT,
    role TEXT,
    apartment TEXT,
    society_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();

  // Ensure old DBs that didn't have password column get it
  ensureColumn("users", "password", "TEXT");

  db.prepare(`CREATE TABLE IF NOT EXISTS societies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    address TEXT,
    secretary_user_id INTEGER
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS vendors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    categories TEXT,
    avg_response_mins INTEGER,
    avg_cost REAL,
    rating REAL,
    availability INTEGER
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS complaints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resident_id INTEGER,
    society_id INTEGER,
    block TEXT,
    apartment_no TEXT,
    title TEXT,
    description TEXT,
    category TEXT,
    images TEXT,
    urgency TEXT,
    status TEXT DEFAULT 'open',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    society_id INTEGER,
    created_by_id INTEGER,
    title TEXT,
    vendor_id INTEGER,
    scheduled_at TEXT,
    status TEXT,
    complaint_ids TEXT,
    total_cost REAL,
    invoice_url TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER,
    resident_id INTEGER,
    score INTEGER,
    comment TEXT
  )`).run();
}

module.exports = { db, init };
