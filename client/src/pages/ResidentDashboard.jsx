// client/src/pages/ResidentDashboard.jsx
import React, { useEffect, useState, useCallback } from "react";
import { getComplaints, addComplaint, updateComplaint, updateVendorRating } from "../utils/storageService";

function readFileAsDataURL(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

const ML_BASE = "http://localhost:8001";

export default function ResidentDashboard() {
  const storedAuth = JSON.parse(localStorage.getItem("sp_auth") || "{}");
  const userEmail = storedAuth?.email || "demo@local";

  const [complaints, setComplaints] = useState([]);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState("");
  const [block, setBlock] = useState("");
  const [apartment, setApartment] = useState("");
  const [urgency, setUrgency] = useState("Medium");
  const [images, setImages] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // broadcast + storage notifier so other dashboards update
  function notifyAllComplaintsUpdated() {
    try {
      const bc = new BroadcastChannel("servicepulse_channel");
      bc.postMessage({ type: "complaints_updated" });
      bc.close();
    } catch (e) {
      // ignore
    }
    try {
      window.dispatchEvent(new Event("sp_complaints_updated"));
    } catch (e) {}
    try {
      const cur = JSON.parse(localStorage.getItem("sp_complaints") || "[]");
      localStorage.setItem("sp_complaints", JSON.stringify(cur));
    } catch (e) {}
  }

  // -------------------------
  // Fetch complaints via storageService (server fallback handled inside)
  // -------------------------
  const fetchComplaints = useCallback(async () => {
    try {
      const list = await getComplaints(userEmail);
      setComplaints(list || []);
    } catch (err) {
      console.error("fetchComplaints error:", err);
      // fallback: try reading localStorage directly
      try {
        const stored = JSON.parse(localStorage.getItem("sp_complaints") || "[]");
        const mine = stored.filter((c) => c.userEmail === userEmail || c.residentEmail === userEmail);
        setComplaints(mine);
      } catch (e) {
        setComplaints([]);
      }
    }
  }, [userEmail]);

  useEffect(() => {
    fetchComplaints();

    // realtime listeners: BroadcastChannel, storage event, custom event
    let bc;
    try {
      bc = new BroadcastChannel("servicepulse_channel");
      bc.onmessage = (m) => {
        if (m.data?.type === "complaints_updated") fetchComplaints();
      };
    } catch (e) {
      // BroadcastChannel unsupported
    }

    const onStorage = (e) => {
      if (e.key === "sp_complaints") {
        // try to read new value
        try {
          const updated = JSON.parse(e.newValue || "[]");
          const mine = updated.filter((c) => c.userEmail === userEmail || c.residentEmail === userEmail);
          setComplaints(mine);
        } catch (err) {
          fetchComplaints();
        }
      }
    };

    const onCustom = () => fetchComplaints();

    window.addEventListener("storage", onStorage);
    window.addEventListener("sp_complaints_updated", onCustom);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("sp_complaints_updated", onCustom);
      try { if (bc) bc.close(); } catch (e) {}
    };
  }, [fetchComplaints, userEmail]);

  // local fallback refresh (keeps same behavior)
  function refreshFromStorage() {
    fetchComplaints();
  }

  async function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    if (files.length > 3) {
      alert("You can upload up to 3 images");
      return;
    }
    const allowed = files.every((f) =>
      ["image/png", "image/jpeg", "image/jpg"].includes(f.type)
    );
    if (!allowed) {
      alert("Only PNG/JPG images allowed");
      return;
    }
    const data = await Promise.all(files.map((f) => readFileAsDataURL(f)));
    setImages(data);
  }

  // -------------------------
  // ML: Predict category + urgency helper (calls /predict)
  // -------------------------
  async function callMlPredict(titleTxt, descTxt) {
    const textBody = { title: titleTxt || "", description: descTxt || "" };
    try {
      const res = await fetch(`${ML_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(textBody),
      });
      if (!res.ok) return null;
      const json = await res.json();
      // expects { category, urgency, confidence, candidates }
      return json;
    } catch (err) {
      return null;
    }
  }

  // -------------------------
  // Submit complaint via storageService (addComplaint handles server fallback)
  // -------------------------
  async function handleSubmit(e) {
    e.preventDefault();
    if (!title || !desc || !block || !apartment) {
      alert("Please fill all required fields");
      return;
    }
    if (isNaN(Number(apartment)) || Number(apartment) < 100 || Number(apartment) > 999) {
      alert("Apartment No must be a 3-digit number between 100 and 999");
      return;
    }
    setSubmitting(true);
    try {
      // call ML predict (best-effort)
      let predicted = null;
      try {
        predicted = await callMlPredict(title, desc);
      } catch (e) {}

      const payload = {
        title,
        description: desc,
        category: category || (predicted && predicted.category) || "",
        block,
        apartment,
        urgency: urgency || (predicted && predicted.urgency) || "Medium",
        images,
        predictedByML: !!predicted,
        predicted: predicted || null,
        residentEmail: userEmail,
        userEmail: userEmail,
        status: "open",
        createdAt: new Date().toISOString()
      };

      // use storageService.addComplaint (tries server, falls back to localStorage)
      const saved = await addComplaint(payload);

      // update UI
      setComplaints((prev) => [saved, ...prev]);

      // notify other dashboards (storageService might do it, call here to be safe)
      notifyAllComplaintsUpdated();

      // clear form
      setTitle(""); setDesc(""); setCategory(""); setBlock(""); setApartment(""); setUrgency("Medium"); setImages([]);
    } catch (err) {
      console.error(err);
      alert("Could not submit complaint");
    } finally {
      setSubmitting(false);
    }
  }

  // -------------------------
  // Status updates via storageService.updateComplaint
  // -------------------------
  async function markAsInProgress(id) {
    try {
      const updated = await updateComplaint(id, { status: "in-progress", startedAt: new Date().toISOString() });
      if (updated) {
        setComplaints((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        notifyAllComplaintsUpdated();
      } else {
        // fallback to local change if updateComplaint returned null
        const all = JSON.parse(localStorage.getItem("sp_complaints") || "[]");
        const idx = all.findIndex((c) => c.id === id);
        if (idx >= 0) {
          all[idx].status = "in-progress";
          all[idx].startedAt = new Date().toISOString();
          localStorage.setItem("sp_complaints", JSON.stringify(all));
          refreshFromStorage();
          notifyAllComplaintsUpdated();
        }
      }
    } catch (err) {
      console.error("markAsInProgress error:", err);
    }
  }

  async function markAsResolved(id) {
    try {
      const updated = await updateComplaint(id, { status: "resolved", completedAt: new Date().toISOString() });
      if (updated) {
        setComplaints((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        notifyAllComplaintsUpdated();
      } else {
        const all = JSON.parse(localStorage.getItem("sp_complaints") || "[]");
        const idx = all.findIndex((c) => c.id === id);
        if (idx >= 0) {
          all[idx].status = "resolved";
          all[idx].completedAt = new Date().toISOString();
          localStorage.setItem("sp_complaints", JSON.stringify(all));
          refreshFromStorage();
          notifyAllComplaintsUpdated();
        }
      }
    } catch (err) {
      console.error("markAsResolved error:", err);
    }
  }

  // -------------------------
  // Rate vendor (resident rates vendor after completion)
  // - Prompts user for rating 1-5 (simple UI). Integrate a nicer star UI later if desired.
  // -------------------------
  async function rateVendor(complaint) {
    if (!complaint) {
      alert("Invalid complaint");
      return;
    }
    // Get assigned vendor identity robustly
    const assigned = complaint.assignedVendor || complaint.vendor || complaint.vendorId || complaint.assignedTo || null;
    let vendorIdOrName = null;
    if (!assigned) {
      alert("No vendor assigned for this complaint.");
      return;
    }
    if (typeof assigned === "string") vendorIdOrName = assigned;
    else if (typeof assigned === "object") vendorIdOrName = assigned.vendorId || assigned.id || assigned.name || assigned.email;
    else vendorIdOrName = String(assigned);

    // only allow rating when complaint is resolved/completed
    if (!(complaint.status === "resolved" || complaint.status === "completed")) {
      const ok = window.confirm("This task is not marked completed yet. Do you still want to submit a vendor rating?");
      if (!ok) return;
    }

    const r = prompt("Rate the vendor 1 (worst) to 5 (best):", "5");
    if (r == null) return;
    const num = Number(r);
    if (isNaN(num) || num < 1 || num > 5) return alert("Please enter a number between 1 and 5.");

    try {
      // attach rating to complaint via updateComplaint
      const updated = await updateComplaint(complaint.id, { vendorRating: num });
      if (updated) {
        setComplaints((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      } else {
        // fallback: patch localStorage complaint
        const all = JSON.parse(localStorage.getItem("sp_complaints") || "[]");
        const idx = all.findIndex((c) => c.id === complaint.id);
        if (idx >= 0) {
          all[idx].vendorRating = num;
          localStorage.setItem("sp_complaints", JSON.stringify(all));
          refreshFromStorage();
        }
      }

      // update vendor aggregated rating store (local sp_vendors or server via storageService)
      try {
        await updateVendorRating(vendorIdOrName, num);
      } catch (err) {
        console.warn("updateVendorRating failed:", err);
      }

      notifyAllComplaintsUpdated();
      alert("Thanks for rating!");
    } catch (err) {
      console.error("rateVendor error:", err);
      alert("Could not submit rating.");
    }
  }

  // small helper to display assignedVendor info in UI
  function renderAssignedVendorInfo(c) {
    const av = c.assignedVendor || c.vendor || c.assignedTo || null;
    if (!av) return null;
    if (typeof av === "string") return <>{av}</>;
    if (typeof av === "object") {
      const name = av.name || av.vendorName || av.vendor || av.id || av.vendorId || "Vendor";
      const contact = av.email || av.contact || av.vendorContact || null;
      return (
        <div>
          <div style={{ fontWeight: 700 }}>{name}</div>
          {contact && <div style={{ color: "#9fb0d7", fontSize: 13 }}>{contact}</div>}
        </div>
      );
    }
    return <>{String(av)}</>;
  }

  const total = complaints.length;
  const inProgress = complaints.filter((c) => c.status === "in-progress").length;
  const resolved = complaints.filter((c) => c.status === "resolved").length;

  return (
    <div>
      <h2 style={{ fontSize: 36, fontWeight: 800, marginBottom: 6 }}>Resident Dashboard</h2>
      <div style={{ color: "#9fb0d7", marginBottom: 18 }}>Submit and track your complaints</div>

      <div className="resident-stats-row">
        <div className="stat-card">
          <div className="stat-label">Total Complaints</div>
          <div className="stat-value">{total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">In Progress</div>
          <div className="stat-value">{inProgress}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Resolved</div>
          <div className="stat-value">{resolved}</div>
        </div>
      </div>

      <div className="resident-main-grid">
        <div className="complaint-panel">
          <h3 style={{ marginTop: 0 }}>Submit New Complaint</h3>
          <div style={{ color: "#9fb0d7", marginBottom: 12 }}>Describe your issue and we'll help categorize it</div>

          <form onSubmit={handleSubmit}>
            <label className="form-label">Complaint Title</label>
            <input
              className="form-input"
              placeholder="Brief description of the issue"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <label className="form-label">Description</label>
            <textarea
              className="form-input"
              placeholder="Describe your issue in detail..."
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              onBlur={async () => {
                if (!category && (title || desc) && (title + desc).trim().length > 8) {
                  const suggestion = await callMlPredict(title, desc);
                  if (suggestion && suggestion.confidence >= 0.6) {
                    setCategory(suggestion.category);
                    if (suggestion.urgency) setUrgency(suggestion.urgency);
                  }
                }
              }}
            />

            <label className="form-label">Category</label>
            <select
              name="category"
              className="form-input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Select category</option>
              <option>Plumbing</option>
              <option>Electrical</option>
              <option>Carpentry</option>
              <option>Painting</option>
              <option>Cleaning</option>
              <option>Security</option>
              <option>Other</option>
            </select>

            <div className="form-row equal-cols" style={{ marginTop: 14 }}>
              <div className="form-group">
                <label className="form-label">Block</label>
                <input
                  name="block"
                  className="form-input"
                  placeholder="e.g., A, B, C"
                  value={block}
                  onChange={(e) => setBlock(e.target.value)}
                />
              </div>

              <div className="form-group">
  <label className="form-label">Apartment No</label>
  <input
    name="apartmentNo"
    className="form-input"
    placeholder="e.g., 101"
    autoComplete="new-password"   /* prevents browser autofill in most browsers */
    spellCheck={false}
    autoCorrect="off"
    autoCapitalize="off"
    value={apartment}
    onChange={(e) => setApartment(e.target.value)}
  />
</div>
            </div>

            <label className="form-label">Urgency</label>
            <select
              name="urgency"
              className="form-input"
              value={urgency}
              onChange={(e) => setUrgency(e.target.value)}
            >
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
            </select>

            <label className="form-label">Images (Optional, max 3)</label>
            <input
              type="file"
              accept="image/png,image/jpeg"
              multiple
              className="form-input"
              onChange={handleFiles}
            />

            {images.length > 0 && (
              <div className="image-previews">
                {images.map((src, i) => (
                  <div className="preview" key={i}>
                    <img src={src} alt={`upload-${i}`} />
                  </div>
                ))}
              </div>
            )}

            <button type="submit" className="primary-btn" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit Complaint"}
            </button>
          </form>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          <div className="panel highlight" style={{ minHeight: 160 }}>
            <h4>Recent Complaints</h4>
            <div style={{ color: "#9fb0d7", marginBottom: 12 }}>Your complaint history</div>
            {complaints.length === 0 ? (
              <div style={{ color: "#9fb0d7", padding: 18 }}>No complaints yet</div>
            ) : (
              <table className="sp-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Category</th>
                    <th>Block</th>
                    <th>Apt</th>
                    <th>Urgency</th>
                    <th>Status</th>
                    <th>Vendor</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {complaints.map((c) => (
                    <tr key={c.id}>
                      <td style={{ maxWidth: 220 }}>{c.title}</td>
                      <td>{c.category}</td>
                      <td>{c.block}</td>
                      <td>{c.apartment}</td>
                      <td>{c.urgency}</td>
                      <td>
                        <span
                          className={`status-badge ${
                            c.status === "open"
                              ? "status-open"
                              : c.status === "in-progress"
                              ? "status-in-progress"
                              : "status-resolved"
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>

                      <td style={{ minWidth: 160 }}>
                        {/* show vendor name + contact if assigned */}
                        {c.assignedVendor ? (
                          typeof c.assignedVendor === "string" ? (
                            <div style={{ color: "#9fb0d7" }}>{c.assignedVendor}</div>
                          ) : (
                            <div>
                              <div style={{ fontWeight: 800 }}>{c.assignedVendor.name || c.assignedVendor.vendorName || c.assignedVendor.vendorId || "Vendor"}</div>
                              { (c.assignedVendor.email || c.assignedVendor.contact) && <div style={{ color: "#9fb0d7", fontSize: 13 }}>{c.assignedVendor.email || c.assignedVendor.contact}</div> }
                            </div>
                          )
                        ) : (
                          <div style={{ color: "#9fb0d7" }}>—</div>
                        )}
                      </td>

                      <td>
                        {/* Only allow resident quick actions appropriate for their role.
                            We keep mark buttons here but typically vendor should change state.
                            Resident can still trigger updateComplaint which may hit server (admin override). */}
                        {c.status === "open" && (
                          <button
                            className="primary-btn"
                            style={{ padding: "6px 10px", width: "auto" }}
                            onClick={() => markAsInProgress(c.id)}
                          >
                            Mark In Progress
                          </button>
                        )}
                        {c.status !== "resolved" && (
                          <button
                            style={{ marginLeft: 8 }}
                            className="primary-btn"
                            onClick={() => markAsResolved(c.id)}
                          >
                            Mark Resolved
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="panel highlight" style={{ minHeight: 160 }}>
            <h4>Completed Orders</h4>
            <div style={{ color: "#9fb0d7", marginBottom: 12 }}>Resolved problems for your account</div>
            {complaints.filter((c) => c.status === "resolved").length === 0 ? (
              <div style={{ color: "#9fb0d7", padding: 18 }}>No completed orders awaiting rating</div>
            ) : (
              <ul style={{ marginTop: 6 }}>
                {complaints
                  .filter((c) => c.status === "resolved")
                  .map((c) => (
                    <li key={c.id} style={{ padding: 8, borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <strong>{c.title}</strong> — {c.category} — Apt {c.apartment}
                          {/* vendor display: object or string */}
                          {c.assignedVendor && (
                            <div style={{ color: "#9fb0d7", fontSize: 13 }}>
                              Vendor: {typeof c.assignedVendor === "string" ? c.assignedVendor : (c.assignedVendor.name || c.assignedVendor.vendorName || c.assignedVendor.vendorId)}
                              { (c.assignedVendor && (c.assignedVendor.email || c.assignedVendor.contact)) ? ` • ${c.assignedVendor.email || c.assignedVendor.contact}` : "" }
                            </div>
                          )}
                        </div>

                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <div style={{ fontSize: 13, color: "#9fb0d7" }}>{c.invoice ? `Bill: ${c.invoice.amount || "—"}` : null}</div>
                          <button className="sp-ghost" onClick={() => rateVendor(c)}>Rate</button>
                        </div>
                      </div>
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
