import React from "react";
import { NavLink, useNavigate } from "react-router-dom";

export default function Header() {
  const navigate = useNavigate();
  const stored = localStorage.getItem("sp_auth");
  const user = stored ? JSON.parse(stored) : null;

  return (
    <header className="sp-header">
      <div
        style={{ display: "flex", alignItems: "center", gap: 16, cursor: "pointer" }}
        onClick={() => navigate("/")}
      >
        <div className="sp-header-left">ServicePulse</div>
      </div>

      <div className="sp-header-right">
        <nav className="sp-quick-links" style={{ display: "flex", gap: 26 }}>
          <NavLink to="/auth/resident" className="sp-quick-link">Resident</NavLink>
          <NavLink to="/auth/secretary" className="sp-quick-link">Secretary</NavLink>
          <NavLink to="/vendor/login" className="sp-quick-link">Vendor</NavLink>
          <NavLink to="/analytics" className="sp-quick-link">Analytics</NavLink>

          {/* LOGIN / LOGOUT BUTTON (styled) */}
          {!user ? (
            <button
              className="nav-login-btn"
              onClick={() => navigate("/auth/resident")}
            >
              Login
            </button>
          ) : (
            <button
              className="nav-login-btn"
              onClick={() => {
                localStorage.removeItem("sp_auth");
                navigate("/");
              }}
            >
              Logout
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
