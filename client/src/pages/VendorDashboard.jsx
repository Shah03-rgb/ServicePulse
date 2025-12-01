// client/src/pages/VendorDashboard.jsx
import React, { useEffect, useState, useCallback } from "react";

/**
 * VendorDashboard (fixed)
 * - Shows only vendor-specific tasks (assignedVendor normalized or bulk order vendorId)
 * - Accept -> in-progress (updates complaint wherever it lives)
 * - Mark Complete -> resolved (updates complaint wherever it lives)
 * - Handles sp_complaints and sp_bulk_orders (dedupe & merge)
 */

const API_BASE = "http://localhost:4000";

/* ---------- Utilities ---------- */
function safeParse(key, fallback = []) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn("safeParse failed", key, e);
    return fallback;
  }
}
function safeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn("safeSet failed", key, e);
  }
}
function readAuthRaw() {
  try { return JSON.parse(localStorage.getItem("sp_auth") || "{}"); } catch (e) { return {}; }
}
function normalizeAuth(raw) {
  return {
    vendorId: raw?.vendorId ?? raw?.vendor_id ?? raw?.id ?? null,
    id: raw?.id ?? null,
    name: raw?.name ?? raw?.vendorName ?? raw?.title ?? null,
    email: raw?.email ?? raw?.contactEmail ?? null,
    raw: raw || {}
  };
}
function getAuthNormalized() { return normalizeAuth(readAuthRaw()); }

const lower = v => (v == null ? "" : String(v).toLowerCase());
function primEq(a, b) { return a != null && b != null && lower(a) === lower(b); }

function makeAssignedVendorObj(vendor) {
  if (!vendor) return null;
  if (typeof vendor === "object") {
    return {
      vendorId: vendor.vendorId || vendor.vendor_id || vendor.id || null,
      name: vendor.name || vendor.vendorName || vendor.title || (vendor.email ? vendor.email.split("@")[0] : ""),
      email: vendor.email || vendor.contactEmail || ""
    };
  }
  return { vendorId: null, name: String(vendor), email: "" };
}

function assignedMatches(candidate, auth) {
  if (!candidate || !auth) return false;
  // candidate may be string/number/object/array
  if (Array.isArray(candidate)) {
    return candidate.some(c => assignedMatches(c, auth));
  }
  if (typeof candidate === "string" || typeof candidate === "number") {
    const s = lower(candidate);
    return (auth.vendorId && lower(auth.vendorId) === s) || (auth.email && lower(auth.email) === s) || (auth.name && lower(auth.name) === s);
  }
  if (typeof candidate === "object") {
    const vid = candidate.vendorId || candidate.vendor_id || candidate.id || null;
    if (vid && auth.vendorId && primEq(vid, auth.vendorId)) return true;
    const email = candidate.email || candidate.contactEmail || null;
    if (email && auth.email && primEq(email, auth.email)) return true;
    const name = candidate.name || candidate.vendorName || candidate.title || null;
    if (name && auth.name && primEq(name, auth.name)) return true;
    return false;
  }
  return false;
}

/* update a complaint wherever it exists (sp_complaints or inside sp_bulk_orders) */
function updateComplaintWherever(id, updater) {
  // try sp_complaints first
  const complaints = safeParse("sp_complaints", []);
  const idx = (complaints || []).findIndex(c => String(c.id) === String(id));
  if (idx >= 0) {
    const copy = [...complaints];
    copy[idx] = { ...copy[idx], ...updater(copy[idx]) };
    safeSet("sp_complaints", copy);
    notifyChannels();
    return true;
  }
  // try inside bulk orders
  const bulk = safeParse("sp_bulk_orders", []);
  let changed = false;
  for (let i = 0; i < bulk.length; i++) {
    const bo = bulk[i];
    if (!bo || !Array.isArray(bo.complaints)) continue;
    const ci = bo.complaints.findIndex(cc => String(cc.id) === String(id));
    if (ci >= 0) {
      const copyBulk = [...bulk];
      const copyComplaints = [...copyBulk[i].complaints];
      copyComplaints[ci] = { ...copyComplaints[ci], ...updater(copyComplaints[ci]) };
      copyBulk[i] = { ...copyBulk[i], complaints: copyComplaints };
      safeSet("sp_bulk_orders", copyBulk);
      changed = true;
      break;
    }
  }
  if (changed) {
    notifyChannels();
    return true;
  }
  return false;
}

/* Load combined complaints (dedupe by id) */
function loadCombinedComplaints() {
  const complaints = safeParse("sp_complaints", []) || [];
  const bulk = safeParse("sp_bulk_orders", []) || [];
  const map = new Map();
  // from sp_complaints (canonical)
  (complaints || []).forEach(c => {
    if (!c || c.id == null) return;
    map.set(String(c.id), { ...c, _from: "complaints" });
  });
  // embedded complaints from bulk (merge if necessary)
  (bulk || []).forEach(b => {
    if (!b || !Array.isArray(b.complaints)) return;
    b.complaints.forEach(ec => {
      if (!ec || ec.id == null) return;
      const key = String(ec.id);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...ec, bulkOrderId: b.id, bulkVendorId: b.vendorId, _from: "bulk" });
      } else {
        // merge missing fields and preserve canonical fields
        map.set(key, {
          ...existing,
          title: existing.title || ec.title,
          description: existing.description || ec.description,
          apartment: existing.apartment || ec.apartment,
          block: existing.block || ec.block,
          category: existing.category || ec.category,
          urgency: existing.urgency || ec.urgency,
          // attach bulk metadata if not present
          bulkOrderId: existing.bulkOrderId || b.id,
          bulkVendorId: existing.bulkVendorId || b.vendorId,
        });
      }
    });
  });
  return Array.from(map.values());
}

/* broadcast change to other tabs */
function notifyChannels(type = "complaints_updated") {
  try { const bc = new BroadcastChannel("servicepulse_channel"); bc.postMessage({ type }); bc.close(); } catch (e) {}
  // rewrite storage keys to trigger storage events
  try { const c = safeParse("sp_complaints", []); localStorage.setItem("sp_complaints", JSON.stringify(c)); } catch (e) {}
  try { const b = safeParse("sp_bulk_orders", []); localStorage.setItem("sp_bulk_orders", JSON.stringify(b)); } catch (e) {}
}

/* ---------- Component ---------- */
export default function VendorDashboard() {
  const [auth, setAuth] = useState(getAuthNormalized());
  const [combined, setCombined] = useState([]);
  const [myComplaints, setMyComplaints] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    const curAuth = getAuthNormalized();
    setAuth(curAuth);
    const all = loadCombinedComplaints();
    setCombined(all);

    // filter only those assigned to this vendor:
    const mine = all.filter(c => {
      // if complaint links to bulk order, check bulk vendorId first
      if (c.bulkVendorId && curAuth.vendorId && primEq(c.bulkVendorId, curAuth.vendorId)) return true;
      // if assignedVendor normalized object or string:
      if (c.assignedVendor && assignedMatches(c.assignedVendor, curAuth)) return true;
      // vendorName or vendorId field directly:
      if (c.vendorName && curAuth.name && primEq(c.vendorName, curAuth.name)) return true;
      if (c.vendorId && curAuth.vendorId && primEq(c.vendorId, curAuth.vendorId)) return true;
      return false;
    });

    setMyComplaints(mine);
    // set availability from vendors store if present
    const vendors = safeParse("sp_vendors", []);
    const match = vendors.find(v => (curAuth.vendorId && primEq(v.vendorId, curAuth.vendorId)) || (curAuth.email && v.email && primEq(v.email, curAuth.email)));
    if (match && typeof match.available !== "undefined") setAvailable(!!match.available);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();

    let bc;
    try {
      bc = new BroadcastChannel("servicepulse_channel");
      bc.onmessage = (m) => {
        if (m.data?.type === "complaints_updated" || m.data?.type === "vendors_updated") {
          refresh();
        }
      };
    } catch (e) {}
    const onStorage = (e) => {
      if (!e.key || ["sp_complaints", "sp_bulk_orders", "sp_vendors", "sp_auth"].includes(e.key)) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      try { if (bc) bc.close(); } catch (e) {}
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  useEffect(() => {
    // watch auth changes in single tab (sp_auth updated)
    const interval = setInterval(() => {
      const curAuth = getAuthNormalized();
      if (JSON.stringify(curAuth) !== JSON.stringify(auth)) {
        setAuth(curAuth);
        refresh();
      }
    }, 800);
    return () => clearInterval(interval);
  }, [auth, refresh]);

  async function acceptJob(id) {
    setLoading(true);
    const currentAuth = getAuthNormalized();
    const assignedObj = makeAssignedVendorObj(currentAuth);
    // try server first
    try {
      if (currentAuth.vendorId) {
        const resp = await fetch(`${API_BASE}/api/complaints/${id}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-demo-auth": JSON.stringify(currentAuth.raw) },
          body: JSON.stringify({ status: "in-progress", startedAt: new Date().toISOString(), assignedVendor: assignedObj })
        });
        if (resp.ok) { refresh(); setLoading(false); return; }
      }
    } catch (e) { /* ignore */ }

    // fallback: update local storage
    try {
      const ok = updateComplaintWherever(id, (existing) => ({ ...existing, status: "in-progress", startedAt: new Date().toISOString(), assignedVendor: assignedObj }));
      if (!ok) console.warn("acceptJob: complaint not found in local stores", id);
      refresh();
    } catch (err) { console.error("acceptJob fallback error", err); }
    setLoading(false);
  }

  async function markComplete(id) {
    setLoading(true);
    const currentAuth = getAuthNormalized();
    try {
      if (currentAuth.vendorId) {
        const resp = await fetch(`${API_BASE}/api/complaints/${id}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-demo-auth": JSON.stringify(currentAuth.raw) },
          body: JSON.stringify({ status: "resolved", completedAt: new Date().toISOString() })
        });
        if (resp.ok) { refresh(); setLoading(false); return; }
      }
    } catch (e) {}
    try {
      const ok = updateComplaintWherever(id, (existing) => ({ ...existing, status: "resolved", completedAt: new Date().toISOString() }));
      if (!ok) console.warn("markComplete: complaint not found", id);
      refresh();
    } catch (err) { console.error("markComplete fallback error", err); }
    setLoading(false);
  }

  const assignedCount = myComplaints.filter(c => c.status === "open" || c.status === "assigned").length;
  const inProgressCount = myComplaints.filter(c => c.status === "in-progress").length;
  const completedCount = myComplaints.filter(c => c.status === "resolved" || c.status === "completed").length;

  const displayed = myComplaints.filter(c => {
    if (filterStatus === "all") return true;
    if (filterStatus === "assigned") return c.status === "open" || c.status === "assigned";
    if (filterStatus === "in-progress") return c.status === "in-progress";
    if (filterStatus === "completed") return c.status === "resolved" || c.status === "completed";
    return true;
  }).filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.trim().toLowerCase();
    return (c.title || "").toLowerCase().includes(q) ||
      (c.description || "").toLowerCase().includes(q) ||
      (String(c.apartment || "")).includes(q) ||
      (c.block || "").toLowerCase().includes(q);
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 32 }}>Vendor Portal</h2>
          <div style={{ color: "#9fb0d7" }}>Welcome, {auth.name || auth.email || "Vendor"} — manage your assigned work</div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <div className="stat-card" style={{ padding: "14px 20px", minWidth: 140 }}>
                <div className="stat-label">Assigned</div>
                <div className="stat-value">{assignedCount}</div>
              </div>
              <div className="stat-card" style={{ padding: "14px 20px", minWidth: 140 }}>
                <div className="stat-label">In Progress</div>
                <div className="stat-value">{inProgressCount}</div>
              </div>
              <div className="stat-card" style={{ padding: "14px 20px", minWidth: 140 }}>
                <div className="stat-label">Completed</div>
                <div className="stat-value">{completedCount}</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 6 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", color: "#cfe1ff" }}>
                <input type="checkbox" checked={available} onChange={() => {
                  // simple local toggle (server update omitted for brevity)
                  const vendors = safeParse("sp_vendors", []);
                  const idx = (vendors || []).findIndex(v => (auth.vendorId && primEq(v.vendorId, auth.vendorId)) || (auth.email && v.email && primEq(v.email, auth.email)));
                  if (idx >= 0) { vendors[idx].available = !vendors[idx].available; safeSet("sp_vendors", vendors); notifyChannels("vendors_updated"); setAvailable(!!vendors[idx].available); }
                }} /> Available
              </label>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 380px", gap: 18 }}>
        <div>
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <input className="form-input" placeholder="Search title / description / block / apt" style={{ flex: 1 }} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            <div style={{ display: "flex", gap: 8 }}>
              <button className={`sp-ghost ${filterStatus === "all" ? "auth-tab active" : ""}`} onClick={() => setFilterStatus("all")}>All</button>
              <button className={`sp-ghost ${filterStatus === "assigned" ? "auth-tab active" : ""}`} onClick={() => setFilterStatus("assigned")}>Assigned</button>
              <button className={`sp-ghost ${filterStatus === "in-progress" ? "auth-tab active" : ""}`} onClick={() => setFilterStatus("in-progress")}>In Progress</button>
              <button className={`sp-ghost ${filterStatus === "completed" ? "auth-tab active" : ""}`} onClick={() => setFilterStatus("completed")}>Completed</button>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="sp-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Block</th>
                  <th>Apt</th>
                  <th>Urgency</th>
                  <th>Status</th>
                  <th style={{ width: 220 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayed.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ color: "#9fb0d7", padding: 18 }}>No assigned jobs in this view.</td>
                  </tr>
                )}
                {displayed.map((c) => (
                  <tr key={c.id}>
                    <td style={{ maxWidth: 260, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.title}</td>
                    <td>{c.category}</td>
                    <td>{c.block}</td>
                    <td>{c.apartment}</td>
                    <td><span style={{ padding: "6px 10px", borderRadius: 999, fontWeight: 700 }}>{c.urgency || "Medium"}</span></td>
                    <td><span className={`status-badge ${c.status === "open" || c.status === "assigned" ? "status-open" : c.status === "in-progress" ? "status-in-progress" : "status-resolved"}`}>{c.status}</span></td>
                    <td>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {(c.status === "open" || c.status === "assigned") && <button className="primary-btn" style={{ padding: "6px 10px" }} onClick={() => acceptJob(c.id)}>Accept</button>}
                        {c.status === "in-progress" && <button className="primary-btn" style={{ padding: "6px 10px" }} onClick={() => markComplete(c.id)}>Mark Complete</button>}
                        <button className="sp-ghost" onClick={() => setSelectedComplaint(c)}>View</button>
                        <button className="sp-ghost" onClick={() => {
                          const eta = prompt("Enter ETA (e.g., Today 2-4pm):", "");
                          if (eta == null) return;
                          updateComplaintWherever(c.id, ex => ({ ...ex, eta }));
                          refresh();
                        }}>Set ETA</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside>
          <div className="panel highlight">
            <h4>Quick actions</h4>
            <div style={{ color: "#9fb0d7", marginBottom: 12 }}>Invoice & job controls</div>
            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Invoice amount</label>
              <input className="form-input" placeholder="e.g., 1200" />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Upload invoice (PNG/JPG/PDF)</label>
              <input type="file" accept=".png,.jpg,.jpeg,.pdf" />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="primary-btn">Submit Invoice for Selected</button>
              <button className="sp-ghost">Reset</button>
            </div>
          </div>

          <div className="panel" style={{ marginTop: 14 }}>
            <h4>Recent completed</h4>
            <div style={{ color: "#9fb0d7", marginBottom: 8 }}>Latest completed jobs</div>
            {myComplaints.filter(c => c.status === "resolved" || c.status === "completed").slice(0, 6).map(c => (
              <div key={c.id} style={{ padding: 8, borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div><strong>{c.title}</strong><div style={{ fontSize: 13, color: "#9fb0d7" }}>{c.category} — Apt {c.apartment}</div></div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, color: "#9fb0d7" }}>{c.createdAt ? new Date(c.createdAt).toLocaleDateString() : ""}</div>
                    {c.invoice && <div style={{ fontWeight: 800 }}>{c.invoice.amount || "—"}</div>}
                  </div>
                </div>
              </div>
            ))}
            {myComplaints.filter(c => c.status === "resolved" || c.status === "completed").length === 0 && <div style={{ color: "#9fb0d7", padding: 8 }}>No completed jobs yet</div>}
          </div>
        </aside>
      </div>

      {selectedComplaint && (
        <div style={{
          position: "fixed", right: 18, top: 84, width: 560, maxHeight: "80vh", overflow: "auto", zIndex: 120,
          boxShadow: "0 30px 60px rgba(2,6,20,0.6)", borderRadius: 12, padding: 18, background: "linear-gradient(180deg, rgba(8,10,15,0.98), rgba(10,12,18,0.98))",
          border: "1px solid rgba(255,255,255,0.03)"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>{selectedComplaint.title}</h3>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="sp-ghost" onClick={() => setSelectedComplaint(null)}>Close</button>
            </div>
          </div>

          <div style={{ color: "#9fb0d7", marginTop: 8 }}>{selectedComplaint.description}</div>

          <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
            <div><strong>Category</strong><div style={{ color: "#9fb0d7" }}>{selectedComplaint.category}</div></div>
            <div><strong>Block</strong><div style={{ color: "#9fb0d7" }}>{selectedComplaint.block}</div></div>
            <div><strong>Apt</strong><div style={{ color: "#9fb0d7" }}>{selectedComplaint.apartment}</div></div>
          </div>

          <div style={{ marginTop: 12 }}>
            <strong>Status</strong>
            <div style={{ marginTop: 6 }}>
              <span className={`status-badge ${selectedComplaint.status === "open" || selectedComplaint.status === "assigned" ? "status-open" : selectedComplaint.status === "in-progress" ? "status-in-progress" : "status-resolved"}`}>{selectedComplaint.status}</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            {(selectedComplaint.status === "open" || selectedComplaint.status === "assigned") && <button className="primary-btn" onClick={() => { acceptJob(selectedComplaint.id); setSelectedComplaint(null); }}>Accept</button>}
            {selectedComplaint.status === "in-progress" && <button className="primary-btn" onClick={() => { markComplete(selectedComplaint.id); setSelectedComplaint(null); }}>Mark Complete</button>}
            <button className="sp-ghost" onClick={() => setSelectedComplaint(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
