// client/src/pages/SecretaryDashboard.jsx
import React, { useEffect, useMemo, useState } from "react";

/*
  SecretaryDashboard.jsx (updated)
  - Normalizes assignedVendor
  - Ensures updates are applied to sp_complaints OR embedded complaint inside sp_bulk_orders
  - Broadcasts changes so vendor dashboards refresh
  - UI: Mark Resolved button shows "Resolved" and is disabled when complaint.status === "resolved"
*/

const ML_BASE = "http://localhost:8001";

/* ---------- storage helpers ---------- */
function safeParse(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("safeParse failed for", key, err);
    return [];
  }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.warn("safeSet failed", key, e); }
}

/* ---------- vendor normalization & display ---------- */
function loadLocalVendorsNormalized() {
  try {
    const raw = safeParse("sp_vendors");
    return raw.map(v => {
      const speciality = v.speciality || v.specialityList || v.specialities || (v.category ? (Array.isArray(v.category) ? v.category : [v.category]) : []);
      return {
        vendorId: v.vendorId || v.id || v.vendor_id || null,
        id: v.id || v.vendorId || v.vendor_id || null,
        name: v.name || v.vendorName || v.title || (v.email ? v.email.split("@")[0] : "Vendor"),
        email: v.email || v.contactEmail || "",
        speciality: Array.isArray(speciality) ? speciality : [String(speciality)],
        rating: typeof v.rating === "number" ? v.rating : (Number(v.avgRating) || 4.0),
        avgCost: v.avgCost || v.cost || null,
        avgResponseMins: v.avgResponseMins || v.responseMins || null,
        available: typeof v.available === "boolean" ? v.available : true,
        raw: v
      };
    });
  } catch (err) {
    console.warn("Failed to parse sp_vendors", err);
    return [];
  }
}

function displayAssignedVendor(v) {
  if (!v) return "-";
  if (typeof v === "string") return v;
  if (typeof v === "object") return v.name || v.vendorId || v.email || "-";
  return String(v);
}

function makeAssignedVendorObj(vendor) {
  if (!vendor) return null;
  if (typeof vendor === "object") {
    return {
      vendorId: vendor.vendorId || vendor.id || vendor.vendor_id || null,
      name: vendor.name || vendor.vendorName || vendor.title || (vendor.email ? vendor.email.split("@")[0] : "Vendor"),
      email: vendor.email || vendor.contactEmail || ""
    };
  }
  return { vendorId: null, name: String(vendor), email: "" };
}

/* ---------- ML helpers (unchanged) ---------- */
async function callMlPredict(title = "", description = "") {
  const body = { title: title || "", description: description || "" };
  try {
    const res = await fetch(`${ML_BASE}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) { console.warn("ML predict failed:", await res.text()); return null; }
    return await res.json();
  } catch (err) {
    console.error("callMlPredict error:", err);
    return null;
  }
}
function recommendVendors(vendors, complaints) {
  return (vendors || [])
    .map(v => {
      const score = (v.rating || 3) * 2 - (v.avgCost || 50) / 100 - (v.avgResponseMins || 1440) / 1000;
      return { ...v, score: Math.round(score * 100) / 100 };
    })
    .sort((a,b) => b.score - a.score);
}
function mockClusterComplaints(complaints) {
  const groups = {};
  (complaints || []).forEach(c => {
    const key = `${c.category || "Other"}|${c.block || "?"}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  });
  return Object.entries(groups).map(([key, items]) => ({ key, items })).sort((a,b) => b.items.length - a.items.length);
}

/* ---------- cross-tab notification ---------- */
function notifyAllComplaintsUpdated() {
  try { const bc = new BroadcastChannel("servicepulse_channel"); bc.postMessage({ type: "complaints_updated" }); bc.close(); } catch (e) {}
  try { window.dispatchEvent(new Event("sp_complaints_updated")); } catch (e) {}
  try {
    const cur = safeParse("sp_complaints");
    localStorage.setItem("sp_complaints", JSON.stringify(cur));
  } catch (e) {}
}

/* ---------- IMPORTANT: update wherever complaint lives ---------- */
function updateComplaintWherever(id, updater) {
  // Try canonical sp_complaints
  const complaints = safeParse("sp_complaints");
  const idx = (complaints || []).findIndex(c => String(c.id) === String(id));
  if (idx >= 0) {
    const copy = [...complaints];
    copy[idx] = { ...copy[idx], ...updater(copy[idx]) };
    safeSet("sp_complaints", copy);
    notifyAllComplaintsUpdated();
    return true;
  }

  // Try inside sp_bulk_orders (embedded complaints)
  const bulk = safeParse("sp_bulk_orders");
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
    notifyAllComplaintsUpdated();
    return true;
  }

  return false;
}

/* ---------- CSV util ---------- */
function downloadCSV(filename, rows) {
  if (!rows || !rows.length) return;
  const csv = [
    Object.keys(rows[0]).join(","),
    ...rows.map(r => Object.values(r).map(v => `"${String(v).replace(/"/g,'""')}"`).join(","))
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------- Component ---------- */
export default function SecretaryDashboard() {
  const [complaints, setComplaints] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [bulkOrders, setBulkOrders] = useState([]);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({ category: "", block: "", urgency: "", status: "" });
  const [selected, setSelected] = useState(new Set());
  const [clusters, setClusters] = useState([]);
  const [recommended, setRecommended] = useState([]);
  const [chosenVendor, setChosenVendor] = useState(null);
  const [slaHours, setSlaHours] = useState(48);
  const [mlBusy, setMlBusy] = useState(false);
  const [debugVisible, setDebugVisible] = useState(false);

  useEffect(() => {
    setComplaints(safeParse("sp_complaints"));
    setVendors(loadLocalVendorsNormalized());
    setBulkOrders(safeParse("sp_bulk_orders"));

    let bc;
    try {
      bc = new BroadcastChannel("servicepulse_channel");
      bc.onmessage = (m) => {
        try {
          if (m.data?.type === "complaints_updated") {
            setComplaints(safeParse("sp_complaints"));
            setBulkOrders(safeParse("sp_bulk_orders"));
          }
          if (m.data?.type === "vendors_updated") setVendors(loadLocalVendorsNormalized());
        } catch (err) { console.warn("bc onmessage error:", err); }
      };
    } catch (e) {}

    const onWindowEvent = () => {
      setComplaints(safeParse("sp_complaints"));
      setVendors(loadLocalVendorsNormalized());
      setBulkOrders(safeParse("sp_bulk_orders"));
    };
    window.addEventListener("sp_complaints_updated", onWindowEvent);

    const onStorage = (e) => {
      if (!e.key) return;
      if (e.key === "sp_complaints") setComplaints(safeParse("sp_complaints"));
      if (e.key === "sp_vendors") setVendors(loadLocalVendorsNormalized());
      if (e.key === "sp_bulk_orders") setBulkOrders(safeParse("sp_bulk_orders"));
    };
    window.addEventListener("storage", onStorage);

    return () => {
      try { if (bc) bc.close(); } catch (e) {}
      window.removeEventListener("sp_complaints_updated", onWindowEvent);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    setClusters(mockClusterComplaints(complaints));
  }, [complaints]);

  useEffect(() => {
    if (selected.size === 0) {
      setRecommended([]);
      setChosenVendor(null);
      return;
    }
    const sel = complaints.filter(c => selected.has(c.id));
    const categories = Array.from(new Set(sel.map(s => s.category).filter(Boolean)));
    const pool = categories.length > 0 ? vendors.filter(v => (v.speciality || []).some(s => categories.includes(s))) : vendors;
    const rec = recommendVendors(pool, sel);
    setRecommended(rec);
    setChosenVendor(rec[0] || null);
  }, [selected, vendors, complaints]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (complaints || []).filter(c => {
      if (filters.category && c.category !== filters.category) return false;
      if (filters.block && c.block !== filters.block) return false;
      if (filters.urgency && c.urgency !== filters.urgency) return false;
      if (filters.status && c.status !== filters.status) return false;
      if (!q) return true;
      return (c.title || "").toLowerCase().includes(q) || (c.description || "").toLowerCase().includes(q) || (c.userEmail||"").toLowerCase().includes(q);
    });
  }, [complaints, filters, query]);

  function toggleSelect(id) {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelected(s);
  }
  function selectAllVisible() { setSelected(new Set(filtered.map(c => c.id))); }
  function clearSelection() { setSelected(new Set()); setChosenVendor(null); }

  async function autoLabelSelected() {
    if (selected.size === 0) { alert("Select complaints to auto-label"); return; }
    setMlBusy(true);
    const sel = complaints.filter(c => selected.has(c.id));
    const promises = sel.map(c => callMlPredict(c.title, c.description).then(res => ({ id: c.id, res })).catch(err => ({ id: c.id, res: null })));
    try {
      const results = await Promise.all(promises);
      const all = safeParse("sp_complaints");
      let updatedCount = 0;
      results.forEach(r => {
        const idx = all.findIndex(x => x.id === r.id);
        if (idx >= 0 && r.res) {
          const changed = {};
          if (r.res.category && (!all[idx].category || all[idx].category === "")) { all[idx].category = r.res.category; changed.category = r.res.category; }
          if (r.res.urgency && (!all[idx].urgency || all[idx].urgency === "")) { all[idx].urgency = r.res.urgency; changed.urgency = r.res.urgency; }
          if (Object.keys(changed).length > 0) updatedCount++;
        }
      });
      safeSet("sp_complaints", all);
      setComplaints(all);
      notifyAllComplaintsUpdated();
      alert(`Auto-labeling done — updated ${updatedCount} complaints.`);
    } catch (err) {
      console.error("autoLabelSelected error", err);
      alert("Auto-labeling failed — check ML server or console.");
    } finally {
      setMlBusy(false);
    }
  }

  function createBulkOrder() {
    if (selected.size === 0) { alert("Select complaints to create a bulk order."); return; }
    if (!chosenVendor) { alert("Choose a vendor to assign the bulk order."); return; }

    const selComplaints = (complaints || []).filter(c => selected.has(c.id));
    const order = {
      id: "bo_" + Date.now(),
      vendorId: chosenVendor.vendorId || chosenVendor.id || chosenVendor.name,
      vendorName: chosenVendor.name,
      complaints: selComplaints.map(c => ({ id: c.id, title: c.title, apartment: c.apartment, status: c.status || "assigned" })),
      slaHours,
      status: "assigned",
      createdAt: new Date().toISOString()
    };

    // Add bulk order
    const allBulk = safeParse("sp_bulk_orders");
    allBulk.unshift(order);
    safeSet("sp_bulk_orders", allBulk);
    setBulkOrders(allBulk);

    // Update canonical complaints by marking assignedVendor and linking bulkOrderId
    const allComplaints = safeParse("sp_complaints");
    const assignedObj = makeAssignedVendorObj(chosenVendor);
    const updated = allComplaints.map(c => selected.has(c.id) ? { ...c, status: "in-progress", assignedVendor: assignedObj, bulkOrderId: order.id } : c);
    safeSet("sp_complaints", updated);
    setComplaints(updated);

    clearSelection();
    notifyAllComplaintsUpdated();
    alert("Bulk order created and assigned to " + chosenVendor.name);
  }

  /* assignVendorToSingle: update whichever store contains the complaint */
  function assignVendorToSingle(complaintId, vendor) {
    try {
      const assignedObj = makeAssignedVendorObj(vendor);

      // first try canonical complaints
      const complaintsArr = safeParse("sp_complaints");
      const idx = (complaintsArr || []).findIndex(c => String(c.id) === String(complaintId));
      if (idx >= 0) {
        complaintsArr[idx] = { ...complaintsArr[idx], assignedVendor: assignedObj, vendorContact: assignedObj.email || complaintsArr[idx].vendorContact || null, status: "in-progress" };
        safeSet("sp_complaints", complaintsArr);
        setComplaints(complaintsArr);
        notifyAllComplaintsUpdated();
        return;
      }

      // else try inside bulk orders
      const bulk = safeParse("sp_bulk_orders");
      for (let i = 0; i < bulk.length; i++) {
        const bo = bulk[i];
        if (!bo || !Array.isArray(bo.complaints)) continue;
        const ci = bo.complaints.findIndex(cc => String(cc.id) === String(complaintId));
        if (ci >= 0) {
          const copyBulk = [...bulk];
          const copyComplaints = [...copyBulk[i].complaints];
          copyComplaints[ci] = { ...copyComplaints[ci], assignedVendor: assignedObj, vendorContact: assignedObj.email || copyComplaints[ci].vendorContact || null, status: "in-progress" };
          copyBulk[i] = { ...copyBulk[i], complaints: copyComplaints };
          safeSet("sp_bulk_orders", copyBulk);
          setBulkOrders(copyBulk);
          notifyAllComplaintsUpdated();
          return;
        }
      }

      console.warn("assignVendorToSingle: complaint not found in either store", complaintId);
    } catch (err) {
      console.error("assignVendorToSingle error:", err);
    }
  }

  /* markResolved should update complaint wherever it is stored, and update bulk status if required */
  function markResolved(id) {
    try {
      const ok = updateComplaintWherever(id, (existing) => ({ ...existing, status: "resolved", completedAt: new Date().toISOString() }));
      if (!ok) console.warn("markResolved: complaint not found in any store", id);

      // If complaint belonged to a bulk order, maybe update bulk status (quick pass)
      const bulk = safeParse("sp_bulk_orders");
      let updatedBulk = false;
      for (let i = 0; i < bulk.length; i++) {
        const bo = bulk[i];
        if (!bo || !Array.isArray(bo.complaints)) continue;
        const found = bo.complaints.find(cc => String(cc.id) === String(id));
        if (found) {
          // check whether all complaints in this bulk are now resolved (we only have embedded statuses here)
          const allResolved = bo.complaints.every(cc => {
            // If embedded complaint doesn't have status (old data), check canonical sp_complaints too
            const canonical = safeParse("sp_complaints").find(x => String(x.id) === String(cc.id));
            const s = (cc.status || canonical?.status || "").toLowerCase();
            return s === "resolved" || s === "completed";
          });
          if (allResolved) {
            const copyBulk = [...bulk];
            copyBulk[i] = { ...copyBulk[i], status: "resolved" };
            safeSet("sp_bulk_orders", copyBulk);
            setBulkOrders(copyBulk);
            updatedBulk = true;
          }
        }
      }

      // Refresh complaints state from storage
      setComplaints(safeParse("sp_complaints"));
      if (updatedBulk) notifyAllComplaintsUpdated();
      else notifyAllComplaintsUpdated();
    } catch (err) {
      console.error("markResolved error:", err);
    }
  }

  function exportSelectedCSV() {
    if (selected.size === 0) { alert("Select some complaints first."); return; }
    const sel = complaints.filter(c => selected.has(c.id));
    downloadCSV("selected_complaints.csv", sel);
  }

  const total = (complaints || []).length;
  const open = (complaints || []).filter(c => c.status === "open").length;
  const inProgressCount = (complaints || []).filter(c => c.status === "in-progress").length;
  const resolvedCount = (complaints || []).filter(c => c.status === "resolved").length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: 34, fontWeight: 800 }}>Secretary Dashboard</h2>
          <div style={{ color: "#9fb0d7", marginBottom: 6 }}>Manage complaints, cluster similar issues, and assign vendors in bulk</div>
        </div>

        
      </div>

      <div className="resident-stats-row" style={{ marginBottom: 18 }}>
        <div className="stat-card"><div className="stat-label">Total</div><div className="stat-value">{total}</div></div>
        <div className="stat-card"><div className="stat-label">Open</div><div className="stat-value">{open}</div></div>
        <div className="stat-card"><div className="stat-label">In Progress</div><div className="stat-value">{inProgressCount}</div></div>
        <div className="stat-card"><div className="stat-label">Resolved</div><div className="stat-value">{resolvedCount}</div></div>
      </div>

      {debugVisible && (
        <div style={{ marginBottom: 12, padding: 12, background: "#071023", borderRadius: 8 }}>
          <strong style={{ color: "#d8e7ff" }}>Debug — local state</strong>
          <div style={{ marginTop: 8, color: "#9fb0d7" }}>
            <div><strong>sp_complaints (first 6)</strong></div>
            <pre style={{ maxHeight: 180, overflow: "auto", background: "#0b0d10", padding: 8, borderRadius: 6, color: "#d8e7ff" }}>{JSON.stringify((safeParse("sp_complaints") || []).slice(0,6), null, 2)}</pre>
            <div style={{ marginTop: 8 }}><strong>sp_vendors (normalized)</strong></div>
            <pre style={{ maxHeight: 160, overflow: "auto", background: "#0b0d10", padding: 8, borderRadius: 6, color: "#d8e7ff" }}>{JSON.stringify(loadLocalVendorsNormalized().slice(0,6), null, 2)}</pre>
            <div style={{ marginTop: 8 }}><strong>sp_bulk_orders (first 6)</strong></div>
            <pre style={{ maxHeight: 160, overflow: "auto", background: "#0b0d10", padding: 8, borderRadius: 6, color: "#d8e7ff" }}>{JSON.stringify((safeParse("sp_bulk_orders") || []).slice(0,6), null, 2)}</pre>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 18 }}>
        <div style={{ flex: 1 }}>
          <div className="panel" style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div style={{ display: "flex", gap: 12 }}>
                <input placeholder="Search by text/email/title..." value={query} onChange={e => setQuery(e.target.value)} className="form-input" style={{ width: 420 }} />
                <select className="form-input" value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}>
                  <option value="">All categories</option>
                  <option>Plumbing</option><option>Electrical</option><option>Carpentry</option><option>Painting</option><option>Cleaning</option><option>Security</option><option>Other</option>
                </select>
                <select className="form-input" value={filters.block} onChange={e => setFilters(f => ({ ...f, block: e.target.value }))}>
                  <option value="">All blocks</option>
                  <option>A</option><option>B</option><option>C</option><option>D</option>
                </select>
                <select className="form-input" value={filters.urgency} onChange={e => setFilters(f => ({ ...f, urgency: e.target.value }))}>
                  <option value="">All urgency</option><option>Low</option><option>Medium</option><option>High</option>
                </select>
                <select className="form-input" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
                  <option value="">All status</option><option>open</option><option>in-progress</option><option>resolved</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button className="sp-ghost" onClick={selectAllVisible}>Select all</button>
                <button className="sp-ghost" onClick={clearSelection}>Clear</button>
                <button className="sp-ghost" onClick={exportSelectedCSV}>Export CSV</button>
                <button className="sp-ghost" onClick={autoLabelSelected} disabled={mlBusy}>{mlBusy ? "Auto-labeling..." : "Auto-label selected"}</button>
              </div>
            </div>
          </div>

          <div className="panel highlight" style={{ padding: 8 }}>
            <table className="sp-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ width: 36 }}></th>
                  <th>Title</th><th>Category</th><th>Block</th><th>Apt</th><th>Urgency</th><th>Status</th><th>Vendor</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id}>
                    <td><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} /></td>
                    <td style={{ maxWidth: 220 }}>{c.title}</td>
                    <td>{c.category}</td>
                    <td>{c.block}</td>
                    <td>{c.apartment}</td>
                    <td>{c.urgency}</td>
                    <td>{c.status}</td>
                    <td>{displayAssignedVendor(c.assignedVendor)}</td>
                    <td>

                      {/* -------- CHANGE: show Resolved when resolved and disable button -------- */}
                      <button
                        className="primary-btn"
                        style={{ marginLeft: 8, opacity: c.status === "resolved" ? 0.6 : 1 }}
                        disabled={c.status === "resolved"}
                        onClick={() => markResolved(c.id)}
                      >
                        {c.status === "resolved" ? "Resolved" : "Mark Resolved"}
                      </button>
                      {/* ---------------------------------------------------------------------- */}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={9} style={{ color: "#9fb0d7", padding: 18 }}>No complaints found</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="panel" style={{ marginTop: 12 }}>
            <h4>Auto-clustered groups</h4>
            <div style={{ color: "#9fb0d7", marginBottom: 8 }}>Groups that may be combined into bulk orders</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <button className="sp-ghost" onClick={async () => {
                // naive ML clustering call (if available)
                try {
                  // build small filtered list for ML
                  const items = filtered;
                  const res = await fetch(`${ML_BASE}/ml/cluster`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ complaints: items.map(i => ({ id: i.id, title: i.title, description: i.description || "" })), n_clusters: Math.min(6, Math.max(1, Math.floor(items.length/2))) })
                  });
                  if (!res.ok) { alert("ML cluster failed"); return; }
                  const json = await res.json();
                  const byKey = json.clusters.map(g => {
                    const items = g.members.map(id => filtered.find(f => f.id === id) || complaints.find(f => f.id === id)).filter(Boolean);
                    return { key: `cluster_${g.cluster_id}`, items };
                  });
                  setClusters(byKey);
                } catch (err) {
                  console.warn("cluster ML error", err);
                  alert("ML clustering failed — check the ML server or console");
                }
              }}>Cluster using ML</button>

              <button className="sp-ghost" onClick={() => {
                const g = mockClusterComplaints(complaints);
                setClusters(g);
              }}>Use local clustering</button>
            </div>

            {clusters.slice(0,6).map(g => (
              <div key={g.key} className="panel" style={{ marginBottom: 10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div><strong>{g.key}</strong> — {g.items.length} complaints</div>
                  <div>
                    <button className="sp-ghost" onClick={() => {
                      const s = new Set(selected);
                      g.items.forEach(i => s.add(i.id));
                      setSelected(s);
                    }}>Select group</button>
                    <button className="primary-btn" style={{ marginLeft: 8 }} onClick={() => {
                      const rec = recommendVendors(vendors, g.items);
                      setRecommended(rec);
                      setChosenVendor(rec[0] || null);
                    }}>Recommend Vendor</button>
                  </div>
                </div>
                <div style={{ marginTop: 8, color: "#9fb0d7" }}>
                  {g.items.slice(0,5).map(it => <div key={it.id}>• {it.title} — Apt {it.apartment} ({it.block})</div>)}
                </div>
              </div>
            ))}
            {clusters.length === 0 && <div style={{ color: "#9fb0d7" }}>No clusters</div>}
          </div>
        </div>

        <div style={{ width: 420 }}>
          <div className="panel">
            <h4>Vendor Recommendation</h4>
            <div style={{ color: "#9fb0d7", marginBottom: 10 }}>Choose a vendor to assign selected complaints / create bulk order.</div>

            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input type="number" value={slaHours} onChange={e => setSlaHours(Number(e.target.value||0))} className="form-input" style={{ width: 120 }} />
              <div style={{ color: "#9fb0d7", alignSelf:"center" }}>SLA (hours)</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 280, overflow: "auto" }}>
              {(vendors || []).length === 0 && <div style={{ color: "#9fb0d7", padding: 12 }}>No vendors found. Add vendors via Vendor signup.</div>}

              {recommended.length === 0 ? (
                vendors.map(v => {
                  const isChosen = chosenVendor && (chosenVendor.vendorId === v.vendorId || chosenVendor.id === v.id || chosenVendor.name === v.name);
                  return (
                    <div
                      key={v.vendorId || v.id || v.email || v.name}
                      role="button"
                      tabIndex={0}
                      onClick={() => setChosenVendor(v)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setChosenVendor(v); } }}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: 12,
                        borderRadius: 8,
                        cursor: "pointer",
                        outline: isChosen ? "2px solid rgba(142,167,255,0.28)" : undefined,
                        border: isChosen ? "2px solid rgba(142,167,255,0.12)" : "1px solid rgba(255,255,255,0.03)",
                        background: isChosen ? "linear-gradient(90deg, rgba(142,167,255,0.04), rgba(142,167,255,0.02))" : "transparent"
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800 }}>{v.name}</div>
                        <div style={{ color: "#9fb0d7", fontSize: 13 }}>{(v.speciality || []).join(", ")}</div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 800 }}>{v.rating || "★"} ★</div>
                        <button
                          className="primary-btn"
                          onClick={(ev) => { ev.stopPropagation(); setChosenVendor(v); }}
                          style={{ marginTop: 8 }}
                          aria-label={`Choose ${v.name}`}
                        >
                          Choose
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                recommended.map(v => {
                  const isChosen = chosenVendor && (chosenVendor.vendorId === v.vendorId || chosenVendor.id === v.id || chosenVendor.name === v.name);
                  return (
                    <div
                      key={v.vendorId || v.id || v.email || v.name}
                      role="button"
                      tabIndex={0}
                      onClick={() => setChosenVendor(v)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setChosenVendor(v); } }}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: 12,
                        borderRadius: 8,
                        cursor: "pointer",
                        outline: isChosen ? "2px solid rgba(142,167,255,0.28)" : undefined,
                        border: isChosen ? "2px solid rgba(142,167,255,0.12)" : "1px solid rgba(255,255,255,0.03)",
                        background: isChosen ? "linear-gradient(90deg, rgba(142,167,255,0.04), rgba(142,167,255,0.02))" : "transparent"
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800 }}>{v.name}</div>
                        <div style={{ color: "#9fb0d7", fontSize: 13 }}>score: {v.score} • {(v.speciality || []).join(", ")}</div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 800 }}>{v.rating} ★</div>
                        <button
                          className="primary-btn"
                          onClick={(ev) => { ev.stopPropagation(); setChosenVendor(v); }}
                          style={{ marginTop: 8 }}
                          aria-label={`Choose ${v.name}`}
                        >
                          Choose
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ marginTop: 12, display:"flex", gap: 8 }}>
              <button className="primary-btn" style={{ flex: 1 }} onClick={createBulkOrder}>Create Bulk Order</button>
              <button className="sp-ghost" onClick={() => {
                if (!chosenVendor || selected.size === 0) return alert("Choose a vendor and select complaints");
                const s = Array.from(selected);
                s.forEach(id => assignVendorToSingle(id, chosenVendor));
                clearSelection();
                alert("Assigned vendor to selected complaints");
              }}>Assign</button>
            </div>
          </div>

          <div className="panel highlight" style={{ marginTop: 12 }}>
            <h4>Existing Bulk Orders</h4>
            {bulkOrders.length === 0 ? <div style={{ color: "#9fb0d7" }}>No bulk orders</div> : (
              <ul>
                {bulkOrders.map(b => (
                  <li key={b.id} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <div><strong>{b.vendorName}</strong> • {b.complaints.length} complaints</div>
                      <div style={{ color: "#9fb0d7" }}>{b.status}</div>
                    </div>
                    <div style={{ color: "#9fb0d7", fontSize: 13 }}>{new Date(b.createdAt).toLocaleString()}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
