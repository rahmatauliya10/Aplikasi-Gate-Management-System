# 🚛 Gate Management System (GMS)

A comprehensive enterprise web application for managing vehicle logistics, warehouse operations, quality control (QC), and weighbridge tracking. Built with modern web technologies to ensure a scalable, fast, and secure operational flow.

## ✨ Features

- **RBAC (Role-Based Access Control):** Secure routing and access separation for 5 distinct roles (Admin, Security, Weighbridge Operator, Warehouse Staff, QC Inspector).
- **Gate Operations:** Check-in and check-out tracking for inbound and outbound logistics.
- **Weighbridge Integration:** Live weight tracking (Gross, Tare, Net weight calculation) with deviation validation.
- **Warehouse Operations (GBB / GBJ / GSP):** Unloading and loading checklists, delivery document validation, and stock roll weight tracking.
- **QC Verification:** Quality control sampling with reject/pass decisions and descriptive comments.
- **Real-Time Dashboards:** Aesthetic, responsive, and dynamic UI for real-time truck queue tracking.
- **Mock Fallback API:** Frontend is highly resilient, falling back to a comprehensive mock Pinia store if the backend is unavailable or during early development phases.

## 🛠️ Technology Stack

**Frontend:**
- Vue 3 (Composition API)
- Vite
- Pinia (State Management)
- TailwindCSS (Styling)
- Axios (HTTP Client)

**Backend (Planned / Integrated via API):**
- NestJS
- Prisma ORM
- PostgreSQL
- JWT Authentication

## 🔐 Seed Users

Use the following credentials to test different role permissions:

| Role | Username | Email | Password |
|---|---|---|---|
| **Admin** | `admin` | `admin@gms.local` | `admin123` |
| **Gate Security** | `security` | `security@gms.local` | `security123` |
| **Weighbridge** | `weighbridge` | `weighbridge@gms.local` | `weighbridge123` |
| **Warehouse** | `warehouse` | `warehouse@gms.local` | `warehouse123` |
| **QC Inspector** | `qc` | `qc@gms.local` | `qc123` |

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- npm or yarn

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System.git
   cd Aplikasi-Gate-Management-System
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run the development server:**
   ```bash
   npm run dev
   ```

4. **Open your browser:**
   Navigate to `http://localhost:5173/`

### Environment Variables

Create a `.env` file in the root directory if you want to override the backend API URL:

```env
VITE_API_URL=http://localhost:3000/api
```
*(If the backend is offline, the app will automatically fall back to the built-in mock stores).*

## 🧪 Testing the E2E Flow

1. Login as **Gate Security** to register a new vehicle.
2. Switch to **Weighbridge** to input the Gross weight.
3. Switch to **Warehouse** (GBB/GBJ/GSP) to process the unloading/loading checklist.
4. Switch to **QC Inspector** to pass/reject the quality sample.
5. Switch to **Weighbridge** to input the Tare weight.
6. Switch to **Gate Security** to check out the vehicle.

---
*Developed for optimal production readiness, with comprehensive UI/UX considerations and robust state concurrency management.*
