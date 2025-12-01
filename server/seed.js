// server/seed.js
const { db, init } = require("./db");
init();

const insert = (sql, params) => db.prepare(sql).run(...params);

insert("INSERT OR IGNORE INTO societies (id, name, address, secretary_user_id) VALUES (?, ?, ?, ?)", [1, "Green Meadows", "Sector 12", 1]);

insert("INSERT OR IGNORE INTO users (id, name, email, role, apartment, society_id) VALUES (?, ?, ?, ?, ?, ?)", [1, "Alice Secretary", "alice@meadows.test", "secretary", null, 1]);
insert("INSERT OR IGNORE INTO users (id, name, email, role, apartment, society_id) VALUES (?, ?, ?, ?, ?, ?)", [2, "Bob Resident", "bob@meadows.test", "resident", "A-101", 1]);
insert("INSERT OR IGNORE INTO users (id, name, email, role, apartment, society_id) VALUES (?, ?, ?, ?, ?, ?)", [3, "Charlie Resident", "charlie@meadows.test", "resident", "A-204", 1]);

insert("INSERT OR IGNORE INTO vendors (id, name, categories, avg_response_mins, avg_cost, rating, availability) VALUES (?,?,?,?,?,?,?)", [1, "QuickPlumb", JSON.stringify(["plumbing"]), 120, 1500, 4.5, 1]);
insert("INSERT OR IGNORE INTO vendors (id, name, categories, avg_response_mins, avg_cost, rating, availability) VALUES (?,?,?,?,?,?,?)", [2, "EasyElectro", JSON.stringify(["electrical"]), 90, 1200, 4.2, 1]);

insert(`INSERT OR IGNORE INTO complaints (id, resident_id, society_id, block, apartment_no, title, description, category, urgency, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [1,2,1,"A","101","Kitchen ceiling leak","Water leaking from kitchen ceiling when I run the tap. Appears to be from pipe.","plumbing","high","2025-10-25T09:30:00Z"]);

console.log("Seed complete.");
