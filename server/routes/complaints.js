// server/routes/complaints.js
const express = require("express");
const router = express.Router();
const { db } = require("../db");
const multer = require("multer");
const path = require("path");

const upload = multer({ dest: path.join(__dirname, "..", "uploads") });

router.post("/", upload.array("images", 5), (req, res) => {
    const { title, description, block, apartmentNo, urgency, category, residentId, societyId } = req.body;
    const images = (req.files || []).map((f) => `/uploads/${path.basename(f.path)}`);
    const stmt = db.prepare(`INSERT INTO complaints (resident_id, society_id, block, apartment_no, title, description, category, images, urgency, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', datetime('now'))`);
    const info = stmt.run(residentId || null, societyId || 1, block, apartmentNo, title, description, category || null, JSON.stringify(images), urgency || "low");
  const created = db.prepare("SELECT * FROM complaints WHERE id = ?").get(info.lastInsertRowid);
    res.json({ complaint: created });
});

router.get("/", (req, res) => {
    const { societyId, status } = req.query;
  let sql = "SELECT * FROM complaints";
    const params = [];
    if (societyId) {
    sql += " WHERE society_id = ?";
    params.push(societyId);
    if (status) {
        sql += " AND status = ?";
        params.push(status);
    }
    } else if (status) {
    sql += " WHERE status = ?";
    params.push(status);
    }
    sql += " ORDER BY created_at DESC";
    const rows = db.prepare(sql).all(...params);
    res.json({ data: rows });
});

router.get("/clusters", (req, res) => {
    const { societyId } = req.query;
  const complaints = db.prepare("SELECT * FROM complaints WHERE society_id = ? ORDER BY created_at DESC").all(societyId || 1);
    const clusters = {};
    complaints.forEach((c) => {
    const dateKey = c.created_at ? c.created_at.split("T")[0] : c.created_at;
    const key = `${c.block || "X"}__${dateKey}`;
    clusters[key] = clusters[key] || [];
    clusters[key].push(c);
    });
    const out = Object.keys(clusters).map((k, idx) => ({
    cluster_id: `c${idx + 1}`,
    complaint_ids: clusters[k].map((x) => x.id),
    score: Math.min(0.95, 0.8 + clusters[k].length * 0.02),
    centroid_text: clusters[k].map((x) => x.title).join("; "),
    }));
    res.json({ clusters: out });
});

module.exports = router;
