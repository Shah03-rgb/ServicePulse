// client/src/pages/Dashboard.jsx
import React from "react";
import { useNavigate } from "react-router-dom";

const IconContacts = ({ color = "currentColor" }) => (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M12 12a3 3 0 100-6 3 3 0 000 6z" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 20v-1a4 4 0 014-4h8a4 4 0 014 4v1" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const IconClipboard = ({ color = "currentColor" }) => (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
    <rect x="9" y="2" width="6" height="4" rx="1" stroke={color} strokeWidth="1.4" fill="none" />
    <rect x="3" y="6" width="18" height="16" rx="2" stroke={color} strokeWidth="1.2" fill="none" />
    <path d="M8 12h8M8 16h8" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
);

const IconSettings = ({ color = "currentColor" }) => (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z" stroke={color} strokeWidth="1.4" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.15a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.15a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82L4.27 4.46A2 2 0 116.9 1.63l.06.06a1.65 1.65 0 001.82.33h.09A1.65 1.65 0 0011 1.81V1a2 2 0 114 0v.81c.15.06.3.14.44.24.58.39 1.31.13 1.64-.44L18 1.63a2 2 0 112.62 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.09c.07.52.3 1.02.7 1.44.47.47.71 1.1.63 1.77" stroke={color} strokeWidth="1.0" fill="none"/>
    </svg>
);

export default function Dashboard() {
    const navigate = useNavigate();

    return (
    <div className="dashboard-wrap">
        <div className="panel-outer glass-panel">
        <div className="panel-inner">
            <div className="panel-title">
            <h1>ServicePulse Prototype Dashboard</h1>
            <p className="panel-sub">
                The complete solution for society complaint management with AI-powered features
            </p>
            </div>

            <div className="portal-row">
            <div
                className="portal-card portal-card--lavender"
                onClick={() => navigate("/auth/resident")}
            >
                <IconContacts color="#6b4cff" />
                <div className="portal-heading">Resident Portal</div>
                <div className="portal-text">
                Submit complaints, track resolution, and chat with AI assistant
                </div>
            </div>

            <div
                className="portal-card portal-card--mint"
                onClick={() => navigate("/auth/secretary")}
            >
                <IconClipboard color="#0aa07a" />
                <div className="portal-heading">Secretary View</div>
                <div className="portal-text">
                Manage complaints, create bulk orders, and assign vendors
                </div>
            </div>

            <div
                className="portal-card portal-card--lavender"
                onClick={() => navigate("/auth/vendor")}
            >
                <IconSettings color="#493a9b" />
                <div className="portal-heading">Vendor Portal</div>
                <div className="portal-text">
                View assigned orders, update status, and submit invoices
                </div>
            </div>
            </div>
        </div>
        </div>
    </div>
    );
}
