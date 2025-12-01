import React, { useEffect, useState } from "react";
import { api } from "../api/axios";
export default function AssignModal({ cluster, onClose, onCreated }) {
    const [recommend, setRecommend] = useState([]);
    const [creating, setCreating] = useState(false);
    useEffect(() => { if (cluster) load(); }, [cluster]);
    const load = async () => {
    const title = `Bulk: ${cluster.centroid_text.slice(0,50)}`;
    const r = await api.post("/api/orders", { title, complaintIds: cluster.complaint_ids, createdById: 1, societyId: 1 });
    const order = r.data.order;
    const rec = await api.get(`/api/vendors/recommend?orderId=${order.id}`);
    setRecommend(rec.data.recommendations || []);
    setCreating(order.id);
    };
    const assign = async (vendorId) => { if (!creating) return; await api.patch(`/api/orders/${creating}/assign`, { vendorId }); onCreated && onCreated(); };
    if (!cluster) return null;
    return (
    <div style={{ position:"fixed", left:0, top:0, right:0, bottom:0, background:"rgba(0,0,0,0.3)" }}>
        <div style={{ width:600, margin:"80px auto", background:"#fff", padding:20 }}>
        <h3>Assign vendor for cluster</h3>
        <div><strong>{cluster.centroid_text}</strong></div>
        <div style={{ marginTop: 10 }}>
            <h4>Recommended vendors</h4>
            {recommend.length === 0 ? <div>Loading...</div> : recommend.map(v=>(
            <div key={v.vendor_id} style={{ border:"1px solid #ddd", padding:8, marginBottom:6 }}>
                <div><strong>{v.name || v.vendor_id}</strong> — score {v.score}</div>
                <div>{v.reasons.join(", ")}</div>
                <button onClick={()=>assign(v.vendor_id)}>Assign</button>
            </div>
            ))}
        </div>
        <div style={{ marginTop: 12 }}><button onClick={onClose}>Close</button></div>
        </div>
    </div>
    );
}
