# Workforce App - Project Overview

## 1) Project Layout

- `app.py`: root Flask app loader, calls `backend.app.create_app()`.
- `backend/`: Flask backend.
  - `app.py`: app factory, SQLAlchemy setup, CORS, JWT, route registration, DB seed.
  - `auth.py`: /api/auth endpoints (`/register`, `/login`, `/me`).
  - `attendance.py`, `leave_management.py`, `expense_management.py`, `salary_engine.py`, `admin_analytics.py`, `orders.py`, `notifications.py`: functional APIs.
  - `models.py`: DB models (User, Attendance, Leave, Expense, Settings, Order, Notification), password hashing and to_dict methods.
- `frontend/`: UI shell and JS.
  - `index.html`: UI structure (login page and protected screens for employee/admin).
  - `app.js`: all client state, screen switching, API calls, token management, full feature flows (check-in/check-out, leave/expense, salary, admin assignment, orders, map navigation, notifications).
  - `style.css`: look/feel.

## 2) Backend runtime config

- Database: `SQLALCHEMY_DATABASE_URI` from `DATABASE_URL` env or default `sqlite:///workforce.db`.
- JWT secret: `JWT_SECRET_KEY` env or default `'workforce-management-super-secret-key-2026'`.
- Default server in `backend/app.py` when run as script: `0.0.0.0:4000`.
- Flask blueprint URL prefixes:
  - `/api/auth`
  - `/api/attendance`
  - `/api/leave`
  - `/api/expense`
  - `/api/salary`
  - `/api/admin`
  - `/api/orders`
  - `/api/notifications`

## 3) Seeded default users (credentials for login)

- Admin user:
  - email: `admin@workforce.com`
  - password: `admin123`
  - role: `admin`

- Employee user:
  - email: `employee@workforce.com`
  - password: `emp123`
  - role: `employee`

> These are created automatically on startup if not present in DB.

## 4) Frontend-to-backend auth flow

- On login, frontend `app.js` calls POST `${BASE_URL}/auth/login` with email/password.
- On success, receives `{ access_token, user }`; stores token in `localStorage` as `authToken` and user info as `userData`.
- All further calls include `Authorization: Bearer <token>`.
- `{{BASE_URL}}` expands to `/api` in production or `http://192.168.1.4:5000/api` for some local mobile emulator mode.

## 5) Features in UI

- Employee user:
  - Attendance check-in/check-out + geolocation + optional selfie.
  - Leave management (submit, view history).
  - Expense management (upload and status).
  - Salary summary.
  - Delivery order list and completion with map route.

- Admin user:
  - Dashboard analytics + settings.
  - Manage employees (users listing, role-based UI).
  - Assign and track orders.
  - Approve/reject leave and expense.

## 6) Quick test startup

1. `pip install -r requirements.txt`
2. `python app.py` (or `python -m backend.app` if needed; local port 4000)
3. Open browser: `http://localhost:4000/` (or `http://localhost:5000` depending on Flask env)
4. Login with seeded accounts above.

## 7) Notes & useful paths

- Data file: `workforce.db` (on disk for SQLite default).
- If using PostgreSQL, set `DATABASE_URL` to `postgresql://...`.
- JWT validation is in every blueprint via `@jwt_required()` around protected endpoints.
- There is no user registration console required to test login, thanks to auto-seeded accounts.

---

### 8) Immediate next checks (if you want me to continue)

- `README` creation with API docs + payload examples.
- Add Postman collection for all major endpoints.
- Add script to reset DB and reseed account credentials.
