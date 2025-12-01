import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Header from "./components/Header";
import Home from "./pages/Home";
import ResidentDashboard from "./pages/ResidentDashboard";
import SecretaryDashboard from "./pages/SecretaryDashboard";

// --- added imports for vendor & role-specific auth pages
import VendorAuth from "./pages/VendorAuth";
import VendorDashboard from "./pages/VendorDashboard";
import ResidentAuth from "./pages/ResidentAuth";
import SecretaryAuth from "./pages/SecretaryAuth";
import Analytics from "./pages/Analytics"; 

/* Simple protected route using localStorage demo auth */
function ProtectedRoute({ children, role }) {
  const stored = localStorage.getItem("sp_auth");
  if (!stored) {
    // route the user to the appropriate auth page depending on role
    if (role === "vendor") return <Navigate to="/vendor/login" replace />;
    if (role === "resident") return <Navigate to="/auth/resident" replace />;
    if (role === "secretary") return <Navigate to="/auth/secretary" replace />;
    // fallback (shouldn't reach)
    return <Navigate to="/" replace />;
  }
  const user = JSON.parse(stored);
  if (role && user?.role !== role) {
    // if they are logged in but with a different role, send to that role's auth page
    if (role === "vendor") return <Navigate to="/vendor/login" replace />;
    if (role === "resident") return <Navigate to="/auth/resident" replace />;
    if (role === "secretary") return <Navigate to="/auth/secretary" replace />;
    return <Navigate to="/" replace />;
  }
  return children;
}

export default function App() {
  return (
    <div className="app-root">
      <Header />
      <main className="sp-main">
        <Routes>
          <Route path="/" element={<Home />} />

          {/* Explicit role-specific auth pages */}
          <Route path="/auth/resident" element={<ResidentAuth />} />
          <Route path="/auth/secretary" element={<SecretaryAuth />} />
          <Route path="/vendor/login" element={<VendorAuth />} />

          {/* Resident dashboard (protected) */}
          <Route
            path="/resident/dashboard"
            element={
              <ProtectedRoute role="resident">
                <ResidentDashboard />
              </ProtectedRoute>
            }
          />

          {/* Secretary dashboard (protected) */}
          <Route
            path="/secretary/dashboard"
            element={
              <ProtectedRoute role="secretary">
                <SecretaryDashboard />
              </ProtectedRoute>
            }
          />

          {/* Vendor dashboard (protected) */}
          <Route
            path="/vendor/dashboard"
            element={
              <ProtectedRoute role="vendor">
                <VendorDashboard />
              </ProtectedRoute>
            }
          />

          {/* Analytics placeholder */}
          <Route path="/analytics" element={<Analytics />} />


          {/* fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
