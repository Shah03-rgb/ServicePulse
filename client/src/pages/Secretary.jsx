import React, { useEffect, useState } from "react";
import { api } from "../api/axios";
import AssignModal from "../components/AssignModal";
export default function Secretary() {
    const [complaints, setComplaints] = useState([]);
    const [clusters, setClusters] = useState([]);
    const [selectedCluster, setSelectedCluster] = useState(null);
    const [showAssign, setShowAssign] = useState(false);
    useEffect(()=>{ load(); }, []);
    const load = async () => {
    const r = await api.get("/api/complaints?school=1&societyId=1");
    setComplaints(r.data.data);
    const c = await api.get("/api/complaints/clusters?societyId=1");
    setClusters(c.data.clusters);
    };
    const createOrderFromCluster = async (cluster) => { setSelectedCluster(cluster); setShowAssign(true); };
    const onOrderCreated = () => { setShowAssign(false); setSelectedCluster(null); load(); };
    return (
    <div style={{ padding: 20 }}>
        <h2>Secretary Dashboard</h2>
        <div style={{ display:"flex", gap: 20 }}>
        <div style={{ flex:1 }}>
            <h3>Complaints</h3>
            {complaints.map(c=>(
            <div key={c.id} style={{ padding:8, borderBottom:"1px solid #eee" }}>
                <strong>{c.title}</strong> — {c.category} — {c.block}-{c.apartment_no} — {c.status}
            </div>
            ))}
        </div>
        <div style={{ width: 420 }}>
            <h3>Suggested Clusters</h3>
            {clusters.length===0 ? <div>No clusters</div> : clusters.map(cl=>(
            <div key={cl.cluster_id} style={{ padding:8, border:"1px solid #ddd", marginBottom:8 }}>
                <div><strong>{cl.centroid_text}</strong></div>
                <div>Complaints: {cl.complaint_ids.join(", ")}</div>
                <div>Score: {cl.score}</div>
                <button onClick={()=>createOrderFromCluster(cl)} style={{ marginTop:8 }}>Create Bulk Order</button>
            </div>
            ))}
        </div>
        </div>
        {showAssign && <AssignModal cluster={selectedCluster} onClose={()=>setShowAssign(false)} onCreated={onOrderCreated} />}
    </div>
    );
}
