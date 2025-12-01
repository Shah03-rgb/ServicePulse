// server/routes/orders.js
const express = require("express");
const router = express.Router();
const { db } = require("../db");
const multer = require("multer");
const path = require("path");
const upload = multer({ dest: path.join(__dirname, "..", "uploads") });

router.post("/", (req, res) => {
    const { title, complaintIds, vendorId, scheduledAt, createdById, societyId, totalCost } = req.body;
    const complaintCsv = Array.isArray(complaintIds) ? complaintIds.join(",") : (complaintIds || "");
    const stmt = db.prepare(`INSERT INTO orders (society_id, created_by_id, title, vendor_id, scheduled_at, status, complaint_ids, total_cost, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`);
    const info = stmt.run(societyId || 1, createdById || 1, title, vendorId || null, scheduledAt || null, vendorId ? "assigned" : "created", complaintCsv, totalCost || null);
  const created = db.prepare("SELECT * FROM orders WHERE id = ?").get(info.lastInsertRowid);
    res.json({ order: created });
});

router.get("/", (req, res) => {
    const { vendorId } = req.query;
    let rows;
  if (vendorId) rows = db.prepare("SELECT * FROM orders WHERE vendor_id = ? ORDER BY created_at DESC").all(vendorId);
  else rows = db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all();
    res.json({ data: rows });
});

router.patch("/:id/assign", (req, res) => {
    const id = req.params.id;
    const { vendorId } = req.body;
    db.prepare("UPDATE orders SET vendor_id = ?, status = ? WHERE id = ?").run(vendorId, "assigned", id);
  const o = db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
    res.json({ order: o });
});

router.patch("/:id/status", (req, res) => {
    const id = req.params.id;
    const { status } = req.body;
    db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, id);
  const o = db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
    res.json({ order: o });
});

router.post("/:id/invoice", upload.single("invoice"), (req, res) => {
    const id = req.params.id;
    if (!req.file) return res.status(400).json({ error: "file required" });
    const url = `/uploads/${path.basename(req.file.path)}`;
    db.prepare("UPDATE orders SET invoice_url = ? WHERE id = ?").run(url, id);
  const o = db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
    res.json({ order: o });
});

module.exports = router;
