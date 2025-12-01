// server/routes/vendors.js
const express = require("express");
const router = express.Router();
const { db } = require("../db");

router.get("/", (req, res) => {
    const { category } = req.query;
  const rows = db.prepare("SELECT * FROM vendors ORDER BY rating DESC").all();
    const parsed = rows.map((r) => ({ ...r, categories: JSON.parse(r.categories || "[]") }));
    if (category) {
    res.json({ data: parsed.filter((v) => v.categories.includes(category)) });
    } else res.json({ data: parsed });
});

router.get("/recommend", (req, res) => {
    const { orderId } = req.query;
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
    if (!order) return res.status(404).json({ error: "order not found" });
  const vendors = db.prepare("SELECT * FROM vendors").all().map((v) => ({ ...v, categories: JSON.parse(v.categories || "[]") }));
    const complaintIds = (order.complaint_ids || "").split(",").map((id) => id && Number(id)).filter(Boolean);
    let categoryGuess = null;
    if (complaintIds.length) {
    const q = db.prepare(`SELECT category FROM complaints WHERE id IN (${complaintIds.map(() => "?").join(",")})`).all(...complaintIds);
    const counts = {};
    q.forEach((r) => {
        counts[r.category] = (counts[r.category] || 0) + 1;
    });
    categoryGuess = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    }
    const results = vendors.map((v) => {
    let score = 0;
    if (categoryGuess && v.categories.includes(categoryGuess)) score += 0.4;
    score += 0.4 * ((v.rating || 3) / 5);
    score += 0.2 * (1 - Math.min(1, (v.avg_response_mins || 1000) / 600));
    const reasons = [];
    if (categoryGuess && v.categories.includes(categoryGuess)) reasons.push("Matches category");
    if ((v.rating || 3) >= 4) reasons.push("High rating");
    if (v.avg_response_mins && v.avg_response_mins <= 120) reasons.push("Fast responder");
    if (v.availability) reasons.push("Available");
    return { vendor_id: v.id, name: v.name, score: Math.round(score * 100) / 100, reasons };
    });
    results.sort((a, b) => b.score - a.score);
    res.json({ recommendations: results.slice(0, 3) });
});

module.exports = router;
