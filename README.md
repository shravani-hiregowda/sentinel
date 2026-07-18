🛡 Sentinel — Task Governance & Accountability Platform

Sentinel is a backend-first task governance platform designed to enforce accountability, ownership, and SLA-driven workflows inside an organization.
It enables administrators to create tasks, assign owners, track state transitions, and audit every action — ensuring no task silently fails.

Built with a strong focus on engineering discipline, role-based access control, and real-world operational workflows.

## 🌐 Live Demo
* **Frontend (Vercel):** *[Deploying...]*
* **Backend API (Render):** *[Deploying...]*

---

🚀 Key Features
🔐 Authentication & Authorization

JWT-based authentication

Role-based access control (ADMIN / MEMBER)

Secure session handling

Forced password change support (first login)

👥 Role-Based System

Admins

Create and manage tasks

Assign task owners

View organization-wide dashboards

Monitor SLA breaches and escalations

Members

View assigned tasks

Acknowledge, start, and complete tasks

Track SLA deadlines

📋 Task Lifecycle Management

Tasks follow a strict state machine:

OPEN → ACKNOWLEDGED → IN_PROGRESS → CLOSED
            ↘
           ESCALATED


Each transition is:

Validated

Logged

Audited

⏱ SLA Enforcement

Separate ACK and Action deadlines

Real-time SLA countdowns

Automatic escalation logic

Visual indicators for breached SLAs

🧾 Audit Trail (Critical Feature)

Every task transition is recorded with:

From state → To state

Triggered action

Actor (user/system)

Timestamp

This creates a complete accountability log for every task.

📊 Admin Dashboard

Task summary by state

Live activity feed

Board (Kanban) and Table views

Search, sort, and filter capabilities

📱 Responsive UI

Sidebar-based layout

Mobile-safe scrolling

Horizontal overflow control

Adaptive task board

🏗 Architecture Overview
Backend (Node.js / Express)

RESTful API design

Middleware-based authorization

Centralized error handling

Modular route separation

Database (MongoDB)

Normalized schemas

Indexed task queries

Audit log collections

Secure password storage (bcrypt)

Frontend (React)

Context-based authentication

Protected routing

Reusable layout system

Component-driven UI

🧠 Engineering Decisions
Decision	Reason
JWT Authentication	Stateless, scalable, backend-friendly
Role-Based Access Control	Clear separation of admin/member responsibilities
Explicit Task State Machine	Prevents invalid transitions
Audit Logs	Real-world accountability requirement
SLA Timers	Reflects enterprise operational needs
Single-Organization Scope	Focused MVP with clear boundaries
📂 Project Structure
sentinel/
├── backend/
│   ├── controllers/
│   ├── models/
│   ├── routes/
│   ├── middlewares/
│   └── server.js
│
├── frontend/
│   ├── components/
│   ├── pages/
│   ├── context/
│   ├── api/
│   └── App.jsx

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm

### Installation & Run

1. **Clone the repository** (if not already done).
2. **Environment Variables**:
   - Create a `.env` file in the `backend/` directory based on the `.env.example` file (or use the configured values in `sentinel/.env`).
3. **Database Seeding**:
   - Run the following commands to connect to MongoDB and seed the initial organization and users:
     ```bash
     cd backend
     npm run seed
     ```
4. **Start the Backend Server**:
   ```bash
   cd backend
   npm run dev
   ```
   The backend will run on `http://localhost:5000`.

5. **Start the Frontend Client**:
   ```bash
   cd frontend
   npm run dev
   ```
   The frontend will run on `http://localhost:5173`.

---

## 🔑 Seeded Credentials

Use the following credentials to log in:

### 👤 Admin User
- **Email**: `admin@sentinel.dev`
- **Password**: `Admin@123`

### 👥 Member User (Arjun)
- **Email**: `arjun@sentinel.dev`
- **Password**: `Member@123`

---

## ⚙️ Tech Stack

Backend

Node.js

Express.js

MongoDB

Mongoose

JWT

bcrypt

Frontend

React

React Router

Context API

Vanilla CSS (Inter font)

🧪 Current Status

✅ Core functionality complete

✅ Production-ready architecture

✅ Suitable for real-world task workflows

🔒 Single-organization (by design)

🔮 Future Enhancements (Out of Scope for MVP)

Multi-organization (multi-tenant) support

Super-admin roles

Task templates

Notifications (Email / Push)

Advanced analytics

🎯 Why This Project Matters

Sentinel was built to demonstrate:

Backend-first thinking

Real-world system design

Ownership of a complete product lifecycle

Engineering tradeoff awareness

This is not a tutorial project — it is a production-style system built with intent.

📄 License

MIT