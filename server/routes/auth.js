// server/src/routes/auth.js
const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

// In real app use database. This is just an example user store.
const users = []; // replace with DB

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

// Signup
router.post("/signup", async (req, res) => {
  const { name, email, password, role = "resident" } = req.body;
  if (!email || !password) return res.status(400).json({ message: "Email/password required" });

  if (users.find(u => u.email === email)) return res.status(409).json({ message: "Email exists" });
  const hash = await bcrypt.hash(password, 10);
  const user = { id: users.length + 1, name, email, password: hash, role };
  users.push(user);

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

// Login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email);
  if (!user) return res.status(401).json({ message: "Invalid credentials" });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ message: "Invalid credentials" });
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

module.exports = router;
