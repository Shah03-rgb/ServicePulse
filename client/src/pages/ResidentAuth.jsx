import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

function validatePassword(pw) {
  if (!pw || pw.length < 6) return "Password must be at least 6 characters.";
  if (!/[A-Z]/.test(pw)) return "Password must include at least one uppercase letter.";
  if (!/[a-z]/.test(pw)) return "Password must include at least one lowercase letter.";
  if (!/[0-9]/.test(pw)) return "Password must include at least one number.";
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pw)) return "Password must include at least one special character.";
  return "";
}

export default function ResidentAuth() {
  const nav = useNavigate();
  const [tab, setTab] = useState("login"); // 'login' | 'signup'
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pwErr, setPwErr] = useState("");

  function upsertUser(user) {
    const users = JSON.parse(localStorage.getItem("sp_users") || "[]");
    users.push(user);
    localStorage.setItem("sp_users", JSON.stringify(users));
  }

  function handleSignup(e) {
    e.preventDefault();
    setPwErr("");
    if (!name || !email || !password) return alert("Please fill all fields.");
    const err = validatePassword(password);
    if (err) {
      setPwErr(err);
      return;
    }
    // create resident user
    const id = `r_${Date.now()}`;
    const user = { id, role: "resident", name, email, password };
    upsertUser(user);
    localStorage.setItem("sp_auth", JSON.stringify({ id, role: "resident", name, email }));
    nav("/resident/dashboard");
  }

  function handleLogin(e) {
    e.preventDefault();
    if (!email || !password) return alert("Please enter email and password.");
    const users = JSON.parse(localStorage.getItem("sp_users") || "[]");
    const found = users.find(u => u.email === email && u.password === password && u.role === "resident");
    if (!found) return alert("Account not found or wrong credentials. Please sign up.");
    localStorage.setItem("sp_auth", JSON.stringify({ id: found.id, role: "resident", name: found.name, email: found.email }));
    nav("/resident/dashboard");
  }

  return (
    <div id="auth-page">
      <div className="auth-card" role="main" aria-labelledby="resident-auth">
        <div className="auth-back" onClick={() => window.history.back()} style={{ cursor: "pointer" }}>
          <span style={{ fontWeight: 700, color: "#cfe1ff" }}>Back</span>
        </div>

        <h1 id="resident-auth" className="auth-brand">Resident Login / Signup</h1>
        <div className="auth-sub">Create a resident account or log in to submit complaints.</div>

        <div className="auth-tabs" role="tablist" aria-label="resident auth tabs" style={{ marginTop: 10 }}>
          <div role="tab" tabIndex={0} className={`auth-tab ${tab === "login" ? "active" : ""}`} onClick={() => setTab("login")}>Login</div>
          <div role="tab" tabIndex={0} className={`auth-tab ${tab === "signup" ? "active" : ""}`} onClick={() => setTab("signup")}>Sign Up</div>
        </div>

        <form className="auth-form" onSubmit={tab === "login" ? handleLogin : handleSignup} style={{ marginTop: 8 }}>
          {tab === "signup" && (
            <>
              <label className="form-label" htmlFor="resident-name">Full Name</label>
              <input id="resident-name" className="form-input" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} />
            </>
          )}

          <label className="form-label" htmlFor="resident-email">Email</label>
          <input id="resident-email" className="form-input" placeholder="you@example.com" type="email" value={email} onChange={e => setEmail(e.target.value)} />

          <label className="form-label" htmlFor="resident-password">Password</label>
          <input id="resident-password" className="form-input" placeholder="••••••••" type="password" value={password} onChange={e => { setPassword(e.target.value); setPwErr(""); }} />

          {pwErr && <div style={{ color: "#ffb4b4", marginTop: 8 }}>{pwErr}</div>}

          <button type="submit" className="auth-btn" style={{ marginTop: 12 }}>
            {tab === "login" ? "Log In" : "Sign Up"}
          </button>

          <div className="auth-helpers" style={{ marginTop: 10 }}>
            <div style={{ color: "#9fb0d7", fontSize: 13 }}>
              {tab === "login" ? "Don't have an account?" : "Already have an account?"}
            </div>
            <div className="auth-link" onClick={() => setTab(tab === "login" ? "signup" : "login")} style={{ cursor: "pointer" }}>
              {tab === "login" ? "Create account" : "Sign in"}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
