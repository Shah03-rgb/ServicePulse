// server/index.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const multer = require("multer");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const DATA_FILE = path.join(__dirname, "data.json");
const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function readData() {
  if (!fs.existsSync(DATA_FILE)) {
    const empty = { users: [], vendors: [], complaints: [] };
    fs.writeFileSync(DATA_FILE, JSON.stringify(empty, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE));
}
function writeData(d) { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); }

// Demo auth middleware - expects header: x-demo-auth: JSON-stringified {email,role}
function demoAuth(req, res, next) {
  const raw = req.header("x-demo-auth");
  if (!raw) return res.status(401).json({ error: "Missing x-demo-auth header" });
  try {
    req.auth = JSON.parse(raw);
    next();
  } catch (e) {
    return res.status(400).json({ error: "Invalid x-demo-auth" });
  }
}

// Role-check middleware generator
function requireRole(role) {
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: "Not authenticated" });
    if (req.auth.role !== role) return res.status(403).json({ error: "Forbidden - wrong role" });
    next();
  };
}

/* -------------------------
   Complaints endpoints
   ------------------------- */

// Create complaint (residents call this)
app.post("/api/complaints", demoAuth, (req, res) => {
  const data = readData();
  if (req.auth.role !== "resident") return res.status(403).json({ error: "Only residents may create complaints" });

  const {
    title, description, category, block, apartment, urgency, images = [], predictedByML = false, predicted = {}
  } = req.body;

  const newC = {
    id: Date.now().toString(),
    title, description, category: category || predicted.category || "", block, apartment,
    urgency: urgency || predicted.urgency || "Medium",
    images, status: "open", createdAt: new Date().toISOString(),
    residentEmail: req.auth.email, residentName: req.auth.name || "",
    assignedVendorId: null, assignedAt: null, eta: null, vendorNote: null,
    invoice: null,
    predictedByML
  };
  data.complaints.unshift(newC);
  writeData(data);
  return res.json(newC);
});

// List complaints - anyone can call (filtered by role on client)
app.get("/api/complaints", demoAuth, (req, res) => {
  const data = readData();
  // optionally filter by query params
  const { vendorId, residentEmail } = req.query;
  let list = data.complaints;
  if (vendorId) list = list.filter(c => c.assignedVendorId === vendorId);
  if (residentEmail) list = list.filter(c => c.residentEmail === residentEmail);
  return res.json(list);
});

// Update complaint status or fields (vendor-only for status changes)
app.post("/api/complaints/:id/status", demoAuth, requireRole("vendor"), (req, res) => {
  const { id } = req.params;
  const { status, eta, startedAt, completedAt, note } = req.body;
  const data = readData();
  const idx = data.complaints.findIndex(c => c.id === id);
  if (idx < 0) return res.status(404).json({ error: "Not found" });

  // ensure vendor is assigned to this complaint
  const complaint = data.complaints[idx];
  if (!complaint.assignedVendorId || complaint.assignedVendorId !== req.auth.vendorId) {
    return res.status(403).json({ error: "This complaint is not assigned to you" });
  }

  if (status) complaint.status = status;
  if (eta) complaint.eta = eta;
  if (startedAt) complaint.startedAt = startedAt;
  if (completedAt) complaint.completedAt = completedAt;
  if (note) complaint.vendorNote = note;
  data.complaints[idx] = complaint;
  writeData(data);
  return res.json(complaint);
});

// Assign vendor - secretary only
app.post("/api/complaints/:id/assign", demoAuth, requireRole("secretary"), (req, res) => {
  const { id } = req.params;
  const { vendorId } = req.body;
  const data = readData();
  const idx = data.complaints.findIndex(c => c.id === id);
  if (idx < 0) return res.status(404).json({ error: "Not found" });
  data.complaints[idx].assignedVendorId = vendorId;
  data.complaints[idx].assignedAt = new Date().toISOString();
  writeData(data);
  return res.json(data.complaints[idx]);
});

/* -------------------------
   Vendor endpoints
   ------------------------- */

// Set availability (vendor)
app.post("/api/vendors/:vendorId/availability", demoAuth, requireRole("vendor"), (req, res) => {
  const data = readData();
  const { vendorId } = req.params;
  if (req.auth.vendorId !== vendorId) return res.status(403).json({ error: "Can only change your availability" });
  const vendor = data.vendors.find(v => v.vendorId === vendorId);
  if (!vendor) return res.status(404).json({ error: "Vendor not found" });
  vendor.available = !!req.body.available;
  writeData(data);
  return res.json(vendor);
});

// Upload invoice (vendor) - multipart
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`)
});
const upload = multer({ storage });
app.post("/api/vendors/:vendorId/invoice", demoAuth, requireRole("vendor"), upload.single("file"), (req, res) => {
  const { vendorId } = req.params;
  if (req.auth.vendorId !== vendorId) return res.status(403).json({ error: "Not yours" });
  const { orderId, amount } = req.body;
  const data = readData();
  const idx = data.complaints.findIndex(c => c.id === orderId);
  if (idx < 0) return res.status(404).json({ error: "Order not found" });
  const filePath = `/uploads/${path.basename(req.file.path)}`;
  data.complaints[idx].invoice = { url: filePath, amount, uploadedAt: new Date().toISOString() };
  writeData(data);
  return res.json(data.complaints[idx]);
});

/* -------------------------
   Vendor recommendation (secretary calls)
   ------------------------- */
app.get("/api/vendors/recommend", demoAuth, requireRole("secretary"), (req, res) => {
  const { complaintId } = req.query;
  const data = readData();
  const complaint = data.complaints.find(c => c.id === complaintId);
  if (!complaint) return res.status(404).json({ error: "Complaint not found" });

  // Simple heuristic: vendors that have skill tag matching category get weight,
  // then apply availability, rating and cost (lower cost higher rank).
  const scores = data.vendors.map(v => {
    let score = 0;
    if (v.skills && v.skills.includes(complaint.category)) score += 40;
    if (v.available) score += 30;
    score += (v.rating || 3) * 5; // rating weight
    // lower cost is better
    score += Math.max(0, 20 - (v.avgCost || 10));
    return { vendor: v, score };
  });

  scores.sort((a,b) => b.score - a.score);
  const top = scores.slice(0,5).map(s => ({ vendor: s.vendor, score: s.score }));
  return res.json(top);
});

/* -------------------------
   Simple admin to create vendor / user demo endpoints
   ------------------------- */
app.post("/api/demo/createVendor", (req, res) => {
  const data = readData();
  const { name, email, skills = [], avgCost = 15 } = req.body;
  const vendor = { vendorId: `v_${Date.now()}`, name, email, skills, avgCost, rating: 4.2, available: true };
  data.vendors.push(vendor);
  writeData(data);
  res.json(vendor);
});

app.post("/api/demo/createResident", (req, res) => {
  const data = readData();
  const { name, email } = req.body;
  const user = { id: `u_${Date.now()}`, name, email, role: "resident" };
  data.users.push(user);
  writeData(data);
  res.json(user);
});

/* -------------------------
   Static uploads & start
   ------------------------- */
app.use("/uploads", express.static(UPLOAD_DIR));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
