// client/src/api/axios.js
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";
export const api = axios.create({
    baseURL: API_BASE,
    headers: { "Content-Type": "application/json" },
});

// helper to send multipart (for file upload)
export const apiMultipart = axios.create({
    baseURL: API_BASE,
    headers: { "Content-Type": "multipart/form-data" },
});

export default api;
