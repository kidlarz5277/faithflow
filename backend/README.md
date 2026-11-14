# Faithflow Backend (PostgreSQL)

This backend now uses PostgreSQL instead of local JSON files, and runs as two backend services.

## Setup

1. Create two PostgreSQL databases (example: `faithflow` and `faithflow_admin`).
2. Copy `.env.example` to `.env` and set credentials for both database connections.
3. Install dependencies:
   - `npm install`
4. Start backend:
   - `npm run dev`

## Notes

- Two servers are started:
  - User server: `http://localhost:3001` (main app API)
  - Admin server: `http://localhost:3002` (single fixed-admin API)
- Each server has its own PostgreSQL database.
- Tables are created automatically on startup.
- Seed data for announcements and activities is inserted only when those tables are empty.
- Admin registration endpoints are disabled by design. Only one configured admin account is allowed.
- Authentication endpoints used by the frontend:
  - `POST /register`
  - `POST /login`
