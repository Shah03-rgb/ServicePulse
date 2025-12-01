import React, { useState } from "react";
import { ml } from "../api/axios";
export default function ChatWidget({ onPrefill }) {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const send = async () => {
    if (!input) return;
    setMessages(m => [...m, { from: "user", text: input }]);
    try {
        const r = await ml.post("/ml/chat", { session_id: "demo", message: input });
        const bot = r.data;
        setMessages(m => [...m, { from: "bot", text: bot.reply }]);
        if (bot.prefill && onPrefill) onPrefill({ ...bot.prefill, suggested_category: bot.suggested_category, urgency: bot.urgency });
    } catch (e) {
        setMessages(m => [...m, { from: "bot", text: "Sorry, chatbot unavailable." }]);
    }
    setInput("");
    };
    return (
    <div style={{ position:"fixed", right:20, bottom:20, width:320, zIndex:1000 }}>
        <div style={{ background:"#003A47", color:"#fff", padding:8, cursor:"pointer" }} onClick={()=>setOpen(o=>!o)}>Chat triage</div>
        {open && <div style={{ border:"1px solid #ccc", background:"#fff", padding:8 }}>
        <div style={{ height:200, overflow:"auto" }}>{messages.map((m,i)=> <div key={i} style={{ textAlign: m.from === "user" ? "right" : "left", padding:4 }}>{m.text}</div>)}</div>
        <div style={{ marginTop:8 }}><input value={input} onChange={e=>setInput(e.target.value)} style={{ width:"80%" }} /><button onClick={send}>Send</button></div>
        </div>}
    </div>
    );
}
