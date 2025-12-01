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

export default function SecretaryAuth() {
  const nav = useNavigate();
  const [tab, setTab] = useState("login");
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
    if (err) { setPwErr(err); return; }
    const id = `s_${Date.now()}`;
    const user = { id, role: "secretary", name, email, password };
    upsertUser(user);
    localStorage.setItem("sp_auth", JSON.stringify({ id, role: "secretary", name, email }));
    nav("/secretary/dashboard");
  }

  function handleLogin(e) {
    e.preventDefault();
    if (!email || !password) return alert("Please enter email and password.");
    const users = JSON.parse(localStorage.getItem("sp_users") || "[]");
    const found = users.find(u => u.email === email && u.password === password && u.role === "secretary");
    if (!found) return alert("Account not found or wrong credentials. Please sign up.");
    localStorage.setItem("sp_auth", JSON.stringify({ id: found.id, role: "secretary", name: found.name, email: found.email }));
    nav("/secretary/dashboard");
  }

  return (
    <div id="auth-page">
      <div className="auth-card" role="main" aria-labelledby="secretary-auth">
        <div className="auth-back" onClick={() => window.history.back()} style={{ cursor: "pointer" }}>
          <span style={{ fontWeight: 700, color: "#cfe1ff" }}>Back</span>
        </div>

        <h1 id="secretary-auth" className="auth-brand">Secretary Login / Signup</h1>
        <div className="auth-sub">Manage society complaints and vendor assignment.</div>

        <div className="auth-tabs" role="tablist" aria-label="secretary auth tabs" style={{ marginTop: 10 }}>
          <div role="tab" tabIndex={0} className={`auth-tab ${tab === "login" ? "active" : ""}`} onClick={() => setTab("login")}>Login</div>
          <div role="tab" tabIndex={0} className={`auth-tab ${tab === "signup" ? "active" : ""}`} onClick={() => setTab("signup")}>Sign Up</div>
        </div>

        <form className="auth-form" onSubmit={tab === "login" ? handleLogin : handleSignup} style={{ marginTop: 8 }}>
          {tab === "signup" && (
            <>
              <label className="form-label" htmlFor="sec-name">Full Name</label>
              <input id="sec-name" className="form-input" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} />
            </>
          )}

          <label className="form-label" htmlFor="sec-email">Email</label>
          <input id="sec-email" className="form-input" placeholder="you@example.com" type="email" value={email} onChange={e => setEmail(e.target.value)} />

          <label className="form-label" htmlFor="sec-password">Password</label>
          <input id="sec-password" className="form-input" placeholder="••••••••" type="password" value={password} onChange={e => { setPassword(e.target.value); setPwErr(""); }} />

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
