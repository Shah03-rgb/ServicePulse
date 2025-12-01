import React, { useState } from "react";
import { api } from "../api/axios";
import { useNavigate } from "react-router-dom";
export default function Login({ onLogin }) {
    const [email, setEmail] = useState("bob@meadows.test");
    const [error, setError] = useState("");
    const navigate = useNavigate();
    const submit = async (e) => {
    e.preventDefault();
    try {
        const r = await api.post("/api/auth/login", { email });
        onLogin(r.data.user);
        navigate("/");
    } catch (err) {
        setError(err.response?.data?.error || "Login failed");
    }
    };
    return (
    <div style={{ padding: 20 }}>
        <h2>Login (mock)</h2>
        <form onSubmit={submit}>
        <div><label>Email: </label><input value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: 300 }} /></div>
        <div style={{ marginTop: 8 }}><button type="submit">Login</button></div>
        {error && <div style={{ color: "red" }}>{error}</div>}
        </form>
        <p>Try seeded users: alice@meadows.test (secretary), bob@meadows.test, charlie@meadows.test (resident)</p>
    </div>
    );
}
