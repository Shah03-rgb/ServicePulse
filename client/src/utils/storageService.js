// client/src/utils/storageService.js
/**
 * storageService.js
 * - getComplaints(userEmail) => returns complaints relevant to a resident (tries server then localStorage)
 * - addComplaint(payload) => POST to /api/complaints or store locally in sp_complaints
 * - updateComplaint(id, patch) => tries server then updates localStorage and broadcasts
 * - getVendors(), addVendor(vendorObj) => maintain sp_vendors
 * - updateVendorRating(vendorIdOrName, rating) => update local vendor aggregate (simple average)
 *
 * Broadcasts "complaints_updated" and "vendors_updated" to keep dashboards in sync.
 *
 * NOTE: This is demo-friendly: server calls attempted but localStorage fallback is used to keep behavior consistent.
 */

const API_BASE = "http://localhost:4000";

function notify(type = "complaints_updated") {
  try {
    const bc = new BroadcastChannel("servicepulse_channel");
    bc.postMessage({ type });
    bc.close();
  } catch (e) {}
  // ensure storage events fire
  try {
    const cur = JSON.parse(localStorage.getItem("sp_complaints") || "[]");
    localStorage.setItem("sp_complaints", JSON.stringify(cur));
  } catch (e) {}
  try {
    const curV = JSON.parse(localStorage.getItem("sp_vendors") || "[]");
    localStorage.setItem("sp_vendors", JSON.stringify(curV));
  } catch (e) {}
}

export async function getComplaints(userEmail = null) {
  // try server (if userEmail provided we request resident's complaints)
  try {
    const q = userEmail ? `?residentEmail=${encodeURIComponent(userEmail)}` : "";
    const resp = await fetch(`${API_BASE}/api/complaints${q}`);
    if (resp.ok) {
      const json = await resp.json();
      return json;
    }
  } catch (e) {
    // server unreachable
  }
  // fallback localStorage
  const all = JSON.parse(localStorage.getItem("sp_complaints") || "[]");
  if (!userEmail) return all;
  return all.filter(c => c.userEmail === userEmail || c.residentEmail === userEmail);
}

export async function addComplaint(payload) {
  // try server POST
  try {
    const resp = await fetch(`${API_BASE}/api/complaints`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (resp.ok) {
      const saved = await resp.json();
      notify("complaints_updated");
      return saved;
    }
  } catch (e) {
    // fallback
  }
  // fallback local
  const all = JSON.parse(localStorage.getItem("sp_complaints") || "[]");
  const newComplaint = {
    id: Date.now(),
    userEmail: payload.residentEmail || payload.userEmail || "demo@local",
    title: payload.title,
    description: payload.description,
    category: payload.category || "",
    block: payload.block || "",
    apartment: payload.apartment || "",
    urgency: payload.urgency || "Medium",
    images: payload.images || [],
    status: "open",
    createdAt: new Date().toISOString(),
    predictedByML: payload.predictedByML || false,
    predicted: payload.predicted || null,
  };
  all.unshift(newComplaint);
  localStorage.setItem("sp_complaints", JSON.stringify(all));
  notify("complaints_updated");
  return newComplaint;
}

export async function updateComplaint(id, patch = {}) {
  // try server update route
  try {
    const resp = await fetch(`${API_BASE}/api/complaints/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (resp.ok) {
      const updated = await resp.json();
      // update local copy if present
      const all = JSON.parse(localStorage.getItem("sp_complaints") || "[]");
      const idx = all.findIndex(c => String(c.id) === String(updated.id));
      if (idx >= 0) { all[idx] = updated; localStorage.setItem("sp_complaints", JSON.stringify(all)); }
      notify("complaints_updated");
      return updated;
    }
  } catch (e) {
    // fallback
  }

  // fallback local update: apply patch to item with id
  try {
    const all = JSON.parse(localStorage.getItem("sp_complaints") || "[]");
    const idx = all.findIndex(c => String(c.id) === String(id));
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...patch };
    localStorage.setItem("sp_complaints", JSON.stringify(all));
    notify("complaints_updated");
    return all[idx];
  } catch (err) {
    console.error("updateComplaint fallback error", err);
    return null;
  }
}

// Vendors
export function getVendors() {
  // try server would be better; demo returns local
  try {
    const arr = JSON.parse(localStorage.getItem("sp_vendors") || "[]");
    return arr;
  } catch (e) {
    return [];
  }
}

export async function addVendor(vendor) {
  // try server create endpoint
  try {
    const resp = await fetch(`${API_BASE}/api/vendors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(vendor),
    });
    if (resp.ok) {
      const saved = await resp.json();
      // also add to local cache
      const local = JSON.parse(localStorage.getItem("sp_vendors") || "[]");
      local.unshift(saved);
      localStorage.setItem("sp_vendors", JSON.stringify(local));
      notify("vendors_updated");
      return saved;
    }
  } catch (e) {
    // fallback
  }
  // fallback local insertion
  const local = JSON.parse(localStorage.getItem("sp_vendors") || "[]");
  const vendorId = vendor.vendorId || vendor.id || ("v_" + Date.now());
  const vobj = { vendorId, name: vendor.name, email: vendor.email, speciality: vendor.speciality || [vendor.category || "Other"], rating: vendor.rating || 4.0, available: true };
  local.unshift(vobj);
  localStorage.setItem("sp_vendors", JSON.stringify(local));
  notify("vendors_updated");
  return vobj;
}

export function updateVendorRating(vendorIdOrName, newRating) {
  try {
    const local = JSON.parse(localStorage.getItem("sp_vendors") || "[]");
    const idx = local.findIndex(v => (v.vendorId && String(v.vendorId) === String(vendorIdOrName)) || (v.id && String(v.id) === String(vendorIdOrName)) || (v.name && v.name === vendorIdOrName));
    if (idx >= 0) {
      const v = local[idx];
      // naive aggregate: average of previous (if rating exists) and new
      const prev = Number(v.rating) || 4.0;
      v.rating = Math.round(((prev + Number(newRating)) / 2) * 10) / 10;
      local[idx] = v;
      localStorage.setItem("sp_vendors", JSON.stringify(local));
      notify("vendors_updated");
    }
  } catch (e) {
    console.error("updateVendorRating error", e);
  }
}
