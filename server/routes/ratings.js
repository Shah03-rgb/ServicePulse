// server/routes/ratings.js
const express = require("express");
const router = express.Router();
const { db } = require("../db");

router.post("/", (req, res) => {
    const { orderId, residentId, score, comment } = req.body;
    const stmt = db.prepare("INSERT INTO ratings (order_id, resident_id, score, comment) VALUES (?, ?, ?, ?)");
    const info = stmt.run(orderId, residentId, score, comment || null);
    res.json({ ratingId: info.lastInsertRowid });
});

module.exports = router;
