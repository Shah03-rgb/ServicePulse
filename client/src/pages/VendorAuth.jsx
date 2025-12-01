// client/src/pages/VendorAuth.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = "http://localhost:4000";

/* Categories must match Resident complaint categories */
const CATEGORY_OPTIONS = [
  "Plumbing",
  "Electrical",
  "Carpentry",
  "Painting",
  "Cleaning",
  "Security",
  "Other",
];

function validatePassword(pw) {
  if (!pw || pw.length < 6) return "Password must be at least 6 characters.";
  if (!/[A-Z]/.test(pw)) return "Password must include at least one uppercase letter.";
  if (!/[a-z]/.test(pw)) return "Password must include at least one lowercase letter.";
  if (!/[0-9]/.test(pw)) return "Password must include at least one number.";
  if (!/[!@#$%^&*()_+\-=[\]{};':\"\\|,.<>/?]/.test(pw)) return "Password must include at least one special character.";
  return "";
}

/* Broadcast helper so other dashboards refresh */
function notifyAllChannels(type = "vendors_updated") {
  try {
    const bc = new BroadcastChannel("servicepulse_channel");
    bc.postMessage({ type });
    bc.close();
  } catch (e) {
    // ignore if not supported
  }
  try {
    // rewrite vendors to trigger storage event
    const cur = JSON.parse(localStorage.getItem("sp_vendors") || "[]");
    localStorage.setItem("sp_vendors", JSON.stringify(cur));
  } catch (e) {}
}

/* Upsert user store (sp_users) */
function upsertUser(user) {
  const users = JSON.parse(localStorage.getItem("sp_users") || "[]");
  users.push(user);
  localStorage.setItem("sp_users", JSON.stringify(users));
}

/* Upsert local vendor store (sp_vendors) */
function upsertLocalVendor(vendor) {
  const vendors = JSON.parse(localStorage.getItem("sp_vendors") || "[]");
  vendors.push(vendor);
  localStorage.setItem("sp_vendors", JSON.stringify(vendors));
  notifyAllChannels("vendors_updated");
}

export default function VendorAuth() {
  const nav = useNavigate();
  const [tab, setTab] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0]);
  const [pwErr, setPwErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function tryRegisterVendorToServer(payload) {
    try {
      const resp = await fetch(`${API_BASE}/api/vendors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        console.warn("Server vendor create failed:", resp.status, txt);
        return null;
      }
      const json = await resp.json();
      return json;
    } catch (err) {
      console.warn("Vendor server create error:", err);
      return null;
    }
  }

  async function handleSignup(e) {
    e.preventDefault();
    setPwErr("");
    if (!name || !email || !password || !category) return alert("Please fill all fields.");

    const err = validatePassword(password);
    if (err) { setPwErr(err); return; }

    // prevent duplicate emails in users
    const users = JSON.parse(localStorage.getItem("sp_users") || "[]");
    const exists = users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
    if (exists) return alert("An account with this email already exists. Please log in.");

    setLoading(true);

    const vendorId = `v_${Date.now()}`;
    const user = { id: Date.now(), role: "vendor", name, email, password, vendorId };

    // attempt to create vendor on server (best-effort). If server responds with vendor object, use it.
    const vendorPayload = {
      vendorId,
      name,
      email,
      speciality: [category],
      rating: 4.0,
      available: true,
    };

    let serverVendor = null;
    try {
      serverVendor = await tryRegisterVendorToServer(vendorPayload);
    } catch (e) {
      console.error("Server vendor create exception:", e);
    }

    try {
      // always persist user locally for demo auth/login
      upsertUser(user);

      if (serverVendor && serverVendor.vendorId) {
        // server created vendor — persist server vendor into local cache so dashboards see it
        upsertLocalVendor(serverVendor);
        // set auth (reflect server returned vendor if it contains more authoritative fields)
        localStorage.setItem(
          "sp_auth",
          JSON.stringify({
            id: user.id,
            role: "vendor",
            name: serverVendor.name || user.name,
            email: serverVendor.email || user.email,
            vendorId: serverVendor.vendorId || vendorId,
          })
        );
      } else {
        // fallback: persist vendor in localStorage
        const fallbackVendor = {
          vendorId,
          name,
          email,
          speciality: [category],
          rating: 4.0,
          available: true,
        };
        upsertLocalVendor(fallbackVendor);
        localStorage.setItem(
          "sp_auth",
          JSON.stringify({
            id: user.id,
            role: "vendor",
            name: user.name,
            email: user.email,
            vendorId,
          })
        );
      }

      // notify other dashboards
      notifyAllChannels("vendors_updated");

      // navigate to vendor dashboard
      nav("/vendor/dashboard");
    } catch (err) {
      console.error("Could not create vendor (see console). error:", err);
      alert("Could not create vendor (see console).");
    } finally {
      setLoading(false);
    }
  }

  function handleLogin(e) {
    e.preventDefault();
    if (!email || !password) return alert("Please enter email and password.");
    const users = JSON.parse(localStorage.getItem("sp_users") || "[]");
    const found = users.find(u => u.email === email && u.password === password && u.role === "vendor");
    if (!found) return alert("Vendor not found or wrong credentials. Please sign up.");
    localStorage.setItem("sp_auth", JSON.stringify({ id: found.id, role: "vendor", name: found.name, email: found.email, vendorId: found.vendorId }));
    nav("/vendor/dashboard");
  }

  return (
    <div id="auth-page">
      <div className="auth-card" role="main" aria-labelledby="vendor-auth">
        <div className="auth-back" onClick={() => window.history.back()} style={{ cursor: "pointer" }}>
          <span style={{ fontWeight: 700, color: "#cfe1ff" }}>Back</span>
        </div>

        <h1 id="vendor-auth" className="auth-brand">Vendor Login / Signup</h1>
        <div className="auth-sub">Create a vendor account or log in to manage assigned orders.</div>

        <div className="auth-tabs" role="tablist" aria-label="vendor auth tabs" style={{ marginTop: 10 }}>
          <div role="tab" tabIndex={0} className={`auth-tab ${tab === "login" ? "active" : ""}`} onClick={() => setTab("login")}>Login</div>
          <div role="tab" tabIndex={0} className={`auth-tab ${tab === "signup" ? "active" : ""}`} onClick={() => setTab("signup")}>Sign Up</div>
        </div>

        <form className="auth-form" onSubmit={tab === "login" ? handleLogin : handleSignup} style={{ marginTop: 8 }}>
          {tab === "signup" && (
            <>
              <label className="form-label" htmlFor="vendor-name">Full Name</label>
              <input id="vendor-name" className="form-input" placeholder="Vendor name" value={name} onChange={e => setName(e.target.value)} />
            </>
          )}

          <label className="form-label" htmlFor="vendor-email">Email</label>
          <input id="vendor-email" className="form-input" placeholder="you@vendor.com" type="email" value={email} onChange={e => setEmail(e.target.value)} />

          <label className="form-label" htmlFor="vendor-password">Password</label>
          <input id="vendor-password" className="form-input" placeholder="••••••••" type="password" value={password} onChange={e => { setPassword(e.target.value); setPwErr(""); }} />

          {tab === "signup" && (
            <>
              <label className="form-label" htmlFor="vendor-category">Category</label>
              <select id="vendor-category" className="form-input" value={category} onChange={e => setCategory(e.target.value)}>
                {CATEGORY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </>
          )}

          {pwErr && <div style={{ color: "#ffb4b4", marginTop: 8 }}>{pwErr}</div>}

          <button type="submit" className="auth-btn" style={{ marginTop: 12 }} disabled={loading}>
            {loading ? "Working..." : (tab === "login" ? "Log In" : "Sign Up (create vendor)")}
          </button>

          <div className="auth-helpers" style={{ marginTop: 10 }}>
            <div style={{ color: "#9fb0d7", fontSize: 13 }}>
              {tab === "login" ? "Don't have an account?" : "Already have an account?"}
            </div>
            <div className="auth-link" onClick={() => setTab(tab === "login" ? "signup" : "login")} style={{ cursor: "pointer" }}>
              {tab === "login" ? "Create vendor account" : "Sign in"}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
