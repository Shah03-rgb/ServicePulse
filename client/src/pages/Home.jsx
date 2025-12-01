// client/src/pages/Home.jsx
import React from "react";
import { useNavigate } from "react-router-dom";

export default function Home() {
  const navigate = useNavigate();

  const cards = [
    {
      key: "resident",
      title: "Resident Portal",
      subtitle: "Submit complaints, track resolution, and chat with AI assistant",
      icon: "👤",
      to: "/auth/resident",
    },
    {
      key: "secretary",
      title: "Secretary View",
      subtitle: "Manage complaints, create bulk orders, and assign vendors",
      icon: "📁",
      to: "/auth/secretary",
    },
    {
      key: "vendor",
      title: "Vendor Portal",
      subtitle: "View assigned orders, update status, and submit invoices",
      icon: "🔧",
      to: "/vendor/login",
    },
  ];

  function onCardClick(path) {
    // if already logged in, redirect to dashboard
    try {
      const stored = JSON.parse(localStorage.getItem("sp_auth") || "{}");
      if (stored && stored.role) {
        if (stored.role === "resident" && path.includes("resident")) return navigate("/resident/dashboard");
        if (stored.role === "secretary" && path.includes("secretary")) return navigate("/secretary/dashboard");
        if (stored.role === "vendor" && path.includes("vendor")) return navigate("/vendor/dashboard");
      }
    } catch {}

    navigate(path);
  }

  return (
    <div>
      <div className="hero-wrap">
        <div className="hero-inner">
          <h1 className="hero-title">ServicePulse Prototype Dashboard</h1>
          <p className="hero-sub">
            The complete solution for society complaint management with AI-powered features
          </p>

          <div className="portal-row" role="list">
            {cards.map(card => (
              <article
                key={card.key}
                role="listitem"
                className="portal-card"
                tabIndex={0}
                onClick={() => onCardClick(card.to)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onCardClick(card.to)}
                style={{ cursor: "pointer" }}
              >
                <div className="icon-left">
                  <div
                    style={{
                      width: 86,
                      height: 86,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 18,
                      background: "rgba(255,255,255,0.02)",
                      color: "#b7a9ff",
                      fontSize: 28,
                    }}
                  >
                    {card.icon}
                  </div>
                </div>

                <div style={{ marginTop: 6, width: "100%" }}>
                  <div className="portal-heading">{card.title}</div>
                  <div className="portal-text">{card.subtitle}</div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
