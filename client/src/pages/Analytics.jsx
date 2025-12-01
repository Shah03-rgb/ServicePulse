// client/src/pages/Analytics.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  BarChart, Bar
} from "recharts";

/*
Analytics.jsx (updated)
- Defensive: hides accidental fullscreen overlays / restores body scroll on mount
- Listens to BroadcastChannel "servicepulse_channel" and storage events to refresh
- Safe parsing of localStorage to avoid crashes if data is malformed
- Otherwise same charts / KPIs as before
*/

const COLORS = ["#8EA7FF", "#A2E7C4", "#FFD16A", "#FF9AA2", "#C6F7D8", "#b7a9ff"];

function isoToDateKey(iso) {
  try {
    const d = new Date(iso);
    return d.toISOString().slice(0, 10);
  } catch { return ""; }
}

function parseComplaints() {
  try {
    const raw = JSON.parse(localStorage.getItem("sp_complaints") || "[]");
    if (!Array.isArray(raw)) return [];
    // Ensure createdAt/resolvedAt fields exist for demo and normalize types
    return raw.map(c => ({
      ...c,
      createdAt: c.createdAt || new Date().toISOString(),
      resolvedAt: c.resolvedAt || (c.status === "resolved" ? new Date().toISOString() : null),
    }));
  } catch (err) {
    console.warn("parseComplaints: failed to parse sp_complaints", err);
    return [];
  }
}

function parseVendors() {
  try {
    const raw = JSON.parse(localStorage.getItem("sp_vendors") || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch (err) {
    console.warn("parseVendors: failed to parse sp_vendors", err);
    return [];
  }
}

export default function Analytics() {
  const [complaints, setComplaints] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [rangeDays, setRangeDays] = useState(30); // last N days filter
  const [selectedCategory, setSelectedCategory] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    // Defensive overlay fix: hide accidental fullscreen overlays and restore scroll
    const overlaySelectors = [
      ".modal-backdrop", ".backdrop", ".overlay", ".fullscreen-loader",
      ".loading-overlay", ".sp-overlay", "#modal-root", ".modal-root"
    ];
    const hiddenStack = [];

    function hideOverlaysOnce() {
      try {
        // restore body scroll if previously frozen
        if (document && document.body) {
          // only clear overflow:hidden if it's set (non-destructive)
          if (document.body.style.overflow === "hidden") document.body.style.overflow = "";
        }

        overlaySelectors.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => {
            // Save previous inline style for restore
            hiddenStack.push({ el, prevStyle: el.getAttribute && el.getAttribute("style") });
            el.style.display = "none";
            el.style.opacity = "0";
            el.style.pointerEvents = "none";
            el.style.zIndex = "0";
          });
        });

        // Try to detect any huge fixed element that may accidentally cover viewport
        document.querySelectorAll("body *").forEach(el => {
          try {
            const cs = getComputedStyle(el);
            if (cs.position === "fixed" || cs.position === "sticky") {
              const r = el.getBoundingClientRect();
              if (r.width >= window.innerWidth - 2 && r.height >= window.innerHeight - 2) {
                hiddenStack.push({ el, prevStyle: el.getAttribute && el.getAttribute("style") });
                el.style.display = "none";
                el.style.opacity = "0";
                el.style.pointerEvents = "none";
                el.style.zIndex = "0";
              }
            }
          } catch (e) { /* ignore */ }
        });
      } catch (e) {
        console.warn("hideOverlaysOnce error", e);
      }
    }

    function restoreOverlays() {
      try {
        hiddenStack.forEach(({ el, prevStyle }) => {
          if (!el) return;
          if (prevStyle != null) el.setAttribute("style", prevStyle);
          else el.removeAttribute("style");
        });
        // restore body scroll safely
        if (document && document.body && !document.body.style.overflow) {
          document.body.style.overflow = "";
        }
      } catch (e) {
        console.warn("restoreOverlays error", e);
      }
    }

    // run immediately and then again shortly after (for race conditions)
    hideOverlaysOnce();
    const t = setTimeout(hideOverlaysOnce, 450);

    // cleanup on unmount
    return () => {
      clearTimeout(t);
      restoreOverlays();
    };
  }, []); // run once on mount

  useEffect(() => {
    // initial load
    refresh();

    // storage listener
    function onStorage(e) {
      if (!e) return;
      if (e.key === "sp_complaints" || e.key === "sp_vendors" || e.key === "sp_bulk_orders") {
        refresh();
      }
    }
    window.addEventListener("storage", onStorage);

    // BroadcastChannel for immediate cross-tab updates (matches other pages)
    let bc;
    try {
      bc = new BroadcastChannel("servicepulse_channel");
      bc.onmessage = (m) => {
        try {
          if (m.data?.type === "complaints_updated" || m.data?.type === "vendors_updated") refresh();
        } catch (err) { console.warn("bc.onmessage error", err); }
      };
    } catch (err) {
      // BroadcastChannel may not be available in some environments; that's okay
    }

    return () => {
      window.removeEventListener("storage", onStorage);
      try { if (bc) bc.close(); } catch (e) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refresh() {
    setComplaints(parseComplaints());
    setVendors(parseVendors());
  }

  // derived / filters
  const filtered = useMemo(() => {
    if (!complaints) return [];
    const now = new Date();
    const start = startDate ? new Date(startDate) : new Date(+now - rangeDays * 24 * 3600 * 1000);
    const end = endDate ? new Date(endDate + "T23:59:59") : now;
    return complaints.filter(c => {
      const t = new Date(c.createdAt);
      if (selectedCategory && c.category !== selectedCategory) return false;
      if (t < start || t > end) return false;
      return true;
    });
  }, [complaints, rangeDays, selectedCategory, startDate, endDate]);

  // KPI values
  const kpis = useMemo(() => {
    const total = filtered.length;
    const open = filtered.filter(c => c.status === "open").length;
    const inProgress = filtered.filter(c => c.status === "in-progress").length;
    const resolvedList = filtered.filter(c => c.status === "resolved" || c.status === "completed");
    const resolved = resolvedList.length;

    // avg resolution hours (only resolved ones)
    const avgResolutionHours = resolvedList.length === 0 ? 0 : resolvedList.reduce((acc, r) => {
      const created = new Date(r.createdAt);
      const resolvedAt = r.resolvedAt ? new Date(r.resolvedAt) : new Date();
      return acc + (resolvedAt - created) / (1000 * 3600);
    }, 0) / resolvedList.length;

    // SLA compliance sample: treat urgency->SLA (High:24h, Medium:72h, Low:168h)
    const slaOkCount = resolvedList.reduce((acc, r) => {
      const created = new Date(r.createdAt);
      const resolvedAt = r.resolvedAt ? new Date(r.resolvedAt) : new Date();
      const diffHours = (resolvedAt - created) / (1000 * 3600);
      let sla = 72;
      if (r.urgency === "High") sla = 24;
      if (r.urgency === "Low") sla = 168;
      return acc + (diffHours <= sla ? 1 : 0);
    }, 0);
    const slaPct = resolvedList.length === 0 ? 0 : Math.round((slaOkCount / resolvedList.length) * 100);

    return {
      total, open, inProgress, resolved, avgResolutionHours: Math.round(avgResolutionHours * 10) / 10, slaPct
    };
  }, [filtered]);

  // Chart: category distribution
  const categoryData = useMemo(() => {
    const counts = {};
    filtered.forEach(c => {
      const cat = c.category || "Other";
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  // Chart: complaints per day (last N days or window)
  const timeseries = useMemo(() => {
    const dateCounts = {};
    const now = new Date();
    const start = startDate ? new Date(startDate) : new Date(+now - rangeDays * 24 * 3600 * 1000);
    const end = endDate ? new Date(endDate + "T23:59:59") : now;
    // fill all dates with 0
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dateCounts[d.toISOString().slice(0, 10)] = 0;
    }
    filtered.forEach(c => {
      const k = isoToDateKey(c.createdAt);
      if (k in dateCounts) dateCounts[k] = (dateCounts[k] || 0) + 1;
    });
    return Object.entries(dateCounts).map(([date, count]) => ({ date, count }));
  }, [filtered, rangeDays, startDate, endDate]);

  // Vendor performance derived
  const vendorPerf = useMemo(() => {
    const m = {};
    complaints.forEach(c => {
      // normalize vendor id/name for grouping
      let vid = null;
      if (c.assignedVendor && typeof c.assignedVendor === "object") vid = c.assignedVendor.vendorId || c.assignedVendor.name || JSON.stringify(c.assignedVendor);
      else if (c.assignedVendor) vid = String(c.assignedVendor);
      else if (c.vendorId) vid = c.vendorId;
      else vid = "unassigned";

      if (!m[vid]) m[vid] = { vendor: vid, completed: 0, total: 0, avgTimeHours: 0 };
      m[vid].total += 1;
      if (c.status === "resolved" || c.status === "completed") {
        m[vid].completed += 1;
        const created = new Date(c.createdAt);
        const resolvedAt = c.resolvedAt ? new Date(c.resolvedAt) : new Date();
        const hours = (resolvedAt - created) / (1000 * 3600);
        m[vid].avgTimeHours = ((m[vid].avgTimeHours * (m[vid].completed - 1)) + hours) / m[vid].completed;
      }
    });
    // enrich using sp_vendors metadata where possible
    const vendorMap = {};
    vendors.forEach(v => {
      const key = v.id || v.vendorId || v.name || v.email;
      vendorMap[key] = v;
    });
    return Object.values(m).map(v => ({ ...v, rating: vendorMap[v.vendor]?.rating ?? vendorMap[v.vendor]?.score ?? "—" }));
  }, [complaints, vendors]);

  // helper: export CSV
  function exportCSV(rows, filename = "export.csv") {
    if (!rows || rows.length === 0) return alert("No data");
    const keys = Object.keys(rows[0]);
    const csv = [keys.join(","), ...rows.map(r => keys.map(k => `"${String(r[k] ?? "").replace(/"/g,'""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <h2 style={{ fontSize: 34, marginBottom: 6 }}>Analytics</h2>
      <div style={{ color: "#9fb0d7", marginBottom: 16 }}>Insights and performance metrics for complaints, vendors and SLAs</div>

      {/* KPI cards */}
      <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
        <div className="stat-card" style={{ minWidth: 160 }}>
          <div className="stat-label">Total complaints</div>
          <div className="stat-value">{kpis.total}</div>
        </div>
        <div className="stat-card" style={{ minWidth: 160 }}>
          <div className="stat-label">Open</div>
          <div className="stat-value">{kpis.open}</div>
        </div>
        <div className="stat-card" style={{ minWidth: 160 }}>
          <div className="stat-label">In Progress</div>
          <div className="stat-value">{kpis.inProgress}</div>
        </div>
        <div className="stat-card" style={{ minWidth: 160 }}>
          <div className="stat-label">Resolved</div>
          <div className="stat-value">{kpis.resolved}</div>
        </div>
        <div className="stat-card" style={{ minWidth: 200 }}>
          <div className="stat-label">Avg resolution (hrs)</div>
          <div className="stat-value">{kpis.avgResolutionHours}</div>
        </div>
        <div className="stat-card" style={{ minWidth: 160 }}>
          <div className="stat-label">SLA OK %</div>
          <div className="stat-value">{kpis.slaPct}%</div>
        </div>
      </div>

      {/* Filters */}
      <div className="panel" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <label className="form-label" style={{ margin: 0 }}>Last</label>
          <select className="form-input" value={rangeDays} onChange={(e) => setRangeDays(Number(e.target.value))} style={{ width: 140 }}>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={365}>365 days</option>
          </select>

          <label className="form-label" style={{ margin: 0 }}>Category</label>
          <select className="form-input" value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} style={{ width: 180 }}>
            <option value="">All</option>
            {Array.from(new Set(complaints.map(c => c.category || "Other"))).map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button className="sp-ghost" onClick={() => exportCSV(filtered, "complaints_filtered.csv")}>Export filtered CSV</button>
            <button className="sp-ghost" onClick={() => exportCSV(vendorPerf, "vendor_performance.csv")}>Export vendor perf</button>
          </div>
        </div>
      </div>

      {/* Charts grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 18 }}>
        <div className="panel">
          <h4>Complaints over time</h4>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeseries}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                <XAxis dataKey="date" tick={{ fill: "#9fb0d7" }} />
                <YAxis tick={{ fill: "#9fb0d7" }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="count" name="Complaints" stroke="#8EA7FF" strokeWidth={3} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ marginTop: 16 }}>
            <h4>Category distribution</h4>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categoryData} dataKey="value" nameKey="name" label>
                    {categoryData.map((entry, idx) => <Cell key={entry.name} fill={COLORS[idx % COLORS.length]} />)}
                  </Pie>
                  <Legend />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <aside className="panel">
          <h4>Vendor performance</h4>
          <div style={{ maxHeight: 340, overflow: "auto" }}>
            {vendorPerf.length === 0 && <div style={{ color: "#9fb0d7" }}>No vendor data</div>}
            {vendorPerf.map(v => (
              <div key={v.vendor} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 8, borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                <div>
                  <div style={{ fontWeight: 800 }}>{v.vendor}</div>
                  <div style={{ color: "#9fb0d7", fontSize: 13 }}>{v.completed}/{v.total} completed</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800 }}>{v.rating ?? "—"}</div>
                  <div style={{ color: "#9fb0d7", fontSize: 12 }}>{Math.round(v.avgTimeHours || 0)} hrs avg</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 18 }}>
            <h4>Urgency counts</h4>
            <BarChart width={340} height={160} data={[
              { name: "High", value: filtered.filter(c => c.urgency === "High").length },
              { name: "Medium", value: filtered.filter(c => c.urgency === "Medium").length },
              { name: "Low", value: filtered.filter(c => c.urgency === "Low").length },
            ]}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
              <XAxis dataKey="name" tick={{ fill: "#9fb0d7" }} />
              <YAxis tick={{ fill: "#9fb0d7" }} />
              <Tooltip />
              <Bar dataKey="value" fill="#8EA7FF" />
            </BarChart>
          </div>
        </aside>
      </div>
    </div>
  );
}
