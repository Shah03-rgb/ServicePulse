// client/src/pages/Resident.jsx
import React, { useEffect, useState, useRef } from "react";
import api, { apiMultipart } from "../api/axios";

// --- helper: read file as dataURL for preview
function toDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}

// Optional: simple client-side resize (returns a Blob) to reduce upload size.
// Use it if you want compression. If not needed, submit original files.
async function resizeImage(file, maxWidth = 1200, quality = 0.8) {
  if (!file.type.startsWith("image/")) return file;
  const img = await new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = reader.result;
    };
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });

  const ratio = Math.min(1, maxWidth / img.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * ratio);
  canvas.height = Math.round(img.height * ratio);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      // keep original name but use blob type
      const newFile = new File([blob], file.name, { type: blob.type });
      resolve(newFile);
    }, file.type, quality);
  });
}


export default function Resident() {
  const raw = localStorage.getItem("sp_user");
  const user = raw ? JSON.parse(raw) : null;
  const residentId = user?.id;
  const societyId = user?.society_id ?? 1;

  const [stats, setStats] = useState({ total: 0, inProgress: 0, resolved: 0 });
  const [complaints, setComplaints] = useState([]);
  const [completedOrders, setCompletedOrders] = useState([]);

  // form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [block, setBlock] = useState("");
  const [apartmentNo, setApartmentNo] = useState("");
  const [urgency, setUrgency] = useState("Medium");
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const fileRef = useRef(null);
  const [filePreviews, setFilePreviews] = useState([]); // data URL previews


  const categories = ["Plumbing", "Electrical", "Carpentry", "Painting", "Cleaning", "Security", "Other"];

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchAll() {
    if (!residentId) return;
    try {
      // fetch complaints for this resident
      const r = await api.get(`/api/complaints?residentId=${residentId}`);
      const data = Array.isArray(r.data) ? r.data : r.data?.complaints ?? [];
      setComplaints(data);

      // compute stats
      const total = data.length;
      const inProgress = data.filter(c => {
        const s = (c.status || "").toLowerCase();
        return s && s !== "resolved" && s !== "closed" && s !== "completed";
      }).length;
      const resolved = data.filter(c => {
        const s = (c.status || "").toLowerCase();
        return s === "resolved" || s === "completed";
      }).length;
      setStats({ total, inProgress, resolved });

      // try fetch orders assigned to this resident
      try {
        const ordersResp = await api.get(`/api/orders?residentId=${residentId}`);
        const orders = Array.isArray(ordersResp.data) ? ordersResp.data : ordersResp.data?.orders ?? [];
        const completed = orders.filter(o => (o.status ?? "").toLowerCase() === "complete" || (o.status ?? "").toLowerCase() === "completed");
        setCompletedOrders(completed);
      } catch (e) {
        setCompletedOrders(data.filter(c => (c.status ?? "").toLowerCase() === "resolved" || (c.status ?? "").toLowerCase() === "completed"));
      }
    } catch (err) {
      console.error("fetchAll error", err);
    }
  }

  async function onFilesChange(e) {
  const chosen = Array.from(e.target.files || []);
  const allowed = chosen.filter(f => /\.(jpe?g|png)$/i.test(f.name));
  const tooBig = allowed.filter(f => f.size > 5 * 1024 * 1024);
  if (tooBig.length) {
    setMessage("Each image must be ≤ 5 MB. Remove large files.");
    // remove large files
    allowed = allowed.filter(f => f.size <= 5 * 1024 * 1024);
  }

  // keep at most 3
  const selected = allowed.slice(0, 3);

  // Optional resize step (comment out if you don't want resizing)
  // const processed = await Promise.all(selected.map(f => resizeImage(f, 1200, 0.8)));
  // setFiles(processed);

  setFiles(selected);

  // create previews
  const previews = await Promise.all(selected.map(f => toDataURL(f)));
  setFilePreviews(previews); // you need a new state: filePreviews
}


  async function submitComplaint(e) {
    e.preventDefault();
    setMessage("");
    if (!title || !description || !category || !block || !apartmentNo) {
      setMessage("Please fill title, description, category, block and apartment number.");
      return;
    }
    if (!/^\d{3}$/.test(apartmentNo)) {
      setMessage("Apartment No must be a 3-digit number (100-999).");
      return;
    }

    setLoading(true);
    try {
      const form = new FormData();
      form.append("title", title);
      form.append("description", description);
      form.append("category", category);
      form.append("block", block);
      form.append("apartmentNo", apartmentNo);
      form.append("urgency", urgency);
      form.append("residentId", residentId);
      form.append("societyId", societyId);

      for (let i = 0; i < files.length; i++) {
        form.append("images", files[i]);
      }

      await apiMultipart.post("/api/complaints", form);

      setTitle(""); setDescription(""); setCategory(""); setBlock(""); setApartmentNo(""); setUrgency("Medium");
      setFiles([]);
      if (fileRef.current) fileRef.current.value = null;
      setMessage("Complaint submitted successfully.");
      await fetchAll();
    } catch (err) {
      console.error(err);
      setMessage(err?.response?.data?.error || "Failed to submit complaint.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0 }}>Resident Dashboard</h1>
        <p style={{ color: "#cbd7ef", marginTop: 8 }}>Submit and track your complaints</p>
      </div>

      {/* KPI cards */}
      <div className="resident-stats-row">
        <div className="stat-card glass highlight">
          <div className="stat-label">Total Complaints</div>
          <div className="stat-value">{stats.total}</div>
        </div>

        <div className="stat-card glass highlight">
          <div className="stat-label">In Progress</div>
          <div className="stat-value">{stats.inProgress}</div>
        </div>

        <div className="stat-card glass highlight">
          <div className="stat-label">Resolved</div>
          <div className="stat-value">{stats.resolved}</div>
        </div>
      </div>

      {/* Main grid: expanded submit form (full width) */}
      <div className="resident-main-grid">
        <div className="complaint-panel glass highlight">
          <h1>Submit New Complaint</h1>
          <p style={{ color: "#bfcff0" }}>Describe your issue and we'll help categorize it</p>

          <form onSubmit={submitComplaint} style={{ marginTop: 18 }}>
            <label className="form-label">Complaint Title</label>
            <input className="form-input" value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="Brief description of the issue" />

            <label className="form-label">Description</label>
            <textarea className="form-input" rows={5} value={description} onChange={(e)=>setDescription(e.target.value)} placeholder="Describe your issue in detail..." />

            <label className="form-label">Category</label>
            <select className="form-input" value={category} onChange={(e)=>setCategory(e.target.value)}>
              <option value="">Select category</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
              <div style={{ flex:1 }}>
                <label className="form-label">Block</label>
                <input className="form-input" value={block} onChange={(e)=>setBlock(e.target.value)} placeholder="e.g., A, B, C" />
              </div>

              <div style={{ flex:1 }}>
                <label className="form-label">Apartment No</label>
                <input className="form-input" value={apartmentNo} onChange={(e)=>setApartmentNo(e.target.value)} placeholder="e.g., 101" />
              </div>
            </div>

            <label className="form-label" style={{ marginTop: 12 }}>Urgency</label>
            <select className="form-input" value={urgency} onChange={(e)=>setUrgency(e.target.value)}>
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
            </select>

            <label className="form-label" style={{ marginTop: 12 }}>Images (Optional, max 3)</label>
<input ref={fileRef} className="form-input" type="file" accept=".png,.jpg,.jpeg" multiple onChange={onFilesChange} />

{/* Previews */}
{filePreviews && filePreviews.length > 0 && (
  <div style={{ display: "flex", gap: 12, marginTop: 12, alignItems: "center" }}>
    {filePreviews.map((src, idx) => (
      <div key={idx} style={{ width: 96, height: 72, borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
        <img src={src} alt={`preview-${idx}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    ))}
    <button type="button" className="sp-ghost" onClick={() => { setFiles([]); setFilePreviews([]); if(fileRef.current) fileRef.current.value = null; }}>Clear</button>
  </div>
)}


            {message && <div style={{ marginTop: 12, color: message.includes("success") ? "#BFF1C0" : "#ffccd5" }}>{message}</div>}
          </form>
        </div>
      </div>

      {/* Recent Complaints and Completed Orders under the form */}
      <div className="two-panels" style={{ marginTop: 22 }}>
        <div className="glass panel highlight">
          <h3 style={{ marginTop: 0 }}>Recent Complaints</h3>
          <p style={{ color: "#c9d7f0", marginTop: 6 }}>Your complaint history</p>

          {complaints.length === 0 ? (
            <div style={{ padding: 36, color: "#9fb0d7" }}>No complaints yet</div>
          ) : (
            <div style={{ overflowX: "auto", marginTop: 12 }}>
              <table className="sp-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Desc</th>
                    <th>Category</th>
                    <th>Block</th>
                    <th>Apartment</th>
                    <th>Urgency</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {complaints.map(c => (
                    <tr key={c.id}>
                      <td>{c.title}</td>
                      <td style={{ maxWidth: 420 }}>{c.description?.slice(0, 120)}{c.description?.length > 120 ? "…" : ""}</td>
                      <td>{c.category}</td>
                      <td>{c.block}</td>
                      <td>{c.apartment_no ?? c.apartmentNo ?? c.apartmentNo}</td>
                      <td>{c.urgency}</td>
                      <td>{c.status ?? "open"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="glass panel highlight">
          <h3 style={{ marginTop: 0 }}>Completed Orders</h3>
          <p style={{ color: "#c9d7f0", marginTop: 6 }}>Resolved problems for your account</p>

          {completedOrders.length === 0 ? (
            <div style={{ padding: 36, color: "#9fb0d7" }}>No completed orders awaiting rating</div>
          ) : (
            <div style={{ marginTop: 12 }}>
              <ul>
                {completedOrders.map(o => (
                  <li key={o.id} style={{ padding: 12, borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                    <div style={{ fontWeight:700 }}>{o.title || `Order #${o.id}`}</div>
                    <div style={{ color:"#bfcff0" }}>{o.status}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
