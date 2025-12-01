import React, { useEffect, useState } from "react";
import { api } from "../api/axios";
export default function Vendor() {
    const [orders, setOrders] = useState([]);
    const vendorId = 1;
    useEffect(()=> load(), []);
    const load = async () => { const r = await api.get(`/api/orders?vendorId=${vendorId}`); setOrders(r.data.data); };
    const respond = async (orderId, action) => { await api.patch(`/api/orders/${orderId}/status`, { status: action === "accept" ? "in-progress" : "declined" }); load(); };
    return (
    <div style={{ padding: 20 }}>
        <h2>Vendor Dashboard</h2>
        {orders.length === 0 ? <div>No assigned orders</div> : orders.map(o=>(
        <div key={o.id} style={{ padding:10, borderBottom:"1px solid #eee" }}>
            <div><strong>{o.title}</strong> — status: {o.status}</div>
            <div>Complaints: {o.complaint_ids}</div>
            <button onClick={()=>respond(o.id,"accept")}>Accept</button>
            <button onClick={()=>respond(o.id,"complete")}>Mark Complete</button>
        </div>
        ))}
    </div>
    );
}
