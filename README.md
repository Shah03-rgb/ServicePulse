
# ServicePulse – Smart Society Service Management Platform

ServicePulse is a full-stack MERN application designed to simplify society maintenance, vendor assignment, resident complaint tracking, and admin operations. It provides a clean, intuitive interface with automated workflows, ML-based vendor recommendation, and real-time status updates.


🚀 Features

👤 Resident Portal
Register & log complaints (plumbing, electrical, housekeeping, etc.)
Upload images and add custom notes
Track complaint status in real-time
Rate vendors after completion
View complaint history & analytics

🛠 Admin / Society Manager Panel
Approve/reject resident complaints
Auto-assign vendors using ML-based matching
Monitor vendor performance
Manage residents, vendors, and service categories
Generate monthly activity reports

🧑‍🔧 Vendor Module
Get job notifications
View assigned tasks
Update task progress & resolution notes

-----------------------------------------------------------

🧠 ML Integration
ServicePulse includes a lightweight ML pipeline for:
Vendor matching
Time prediction based on past data
Complaint category classification
Text normalization & noise removal

ML model supports:
TF-IDF vectorization
Logistic Regression baseline
Custom rule-based fallback


--------------------------------------------------------

🏗 Tech Stack

Frontend : 
React.js (Vite)
Zustand (or Context API) for state management
TailwindCSS
Axios
React Router

Backend : 
Node.js
Express.js
Multer (media uploads)
JWT Authentication
Nodemailer

Database : 
MongoDB (Atlas / Local)

Tools : 
Postman
VS Code
Git + GitHub


📁 Project Structure

ServicePulse/
│
├── client/                # React frontend
│   ├── components/
│   ├── pages/
│   ├── hooks/
│   ├── utils/
│   └── services/
│
├── server/                # Node backend
│   ├── routes/
│   ├── controllers/
│   ├── models/
│   ├── config/
│   └── middleware/
│
└── ml/                    # ML scripts (optional)
    ├── model.pkl
    └── preprocessing.py


---

⚡ Installation & Setup

⿡ Clone the repo
git clone https://github.com/YOUR-USERNAME/ServicePulse.git
cd ServicePulse

⿢ Client setup
cd client
npm install
npm run dev

⿣ Server setup
cd server
npm install
npm start

⿤ Environment Variables
Create a .env file inside /server:

MONGO_URI=
JWT_SECRET=
EMAIL_USER=
EMAIL_PASS=
CLOUDINARY_KEY=


---

📌 Key Learning & Outcomes

Full-stack application design (frontend + backend + DB)
API authentication & role-based access
ML-driven recommendation workflows
Clean component architecture & state management
Error handling, logging, and modular structure
Working with real-world features: uploads, vendor matching, email alerts

---

✅ A project description to paste directly into your resume

Want any of these?
