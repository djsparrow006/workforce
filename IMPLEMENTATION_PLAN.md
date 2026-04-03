# Workforce App - Enhanced Implementation Plan

## Overview
Update order management workflow to include: task assignment → store check-in → order pickup confirmation → delivery confirmation with exact location recording. Add break tracking feature for attendance management.

---

## 1) Order Workflow States (Updated)

Current → **New Flow**:

```
assigned 
  ↓
employee_arrived_at_store (checked in at store, waiting for order)
  ↓
order_picked_up (order received, departure location recorded)
  ↓
order_delivered (delivery location recorded with GPS)
```

### New Database Fields (Order Model)

- `status`: Enum ['assigned', 'employee_arrived_at_store', 'order_picked_up', 'order_delivered']
- `store_arrival_time`: DateTime (when employee checks in at store)
- `store_arrival_lat`, `store_arrival_lng`: Float (store check-in location)
- `pickup_time`: DateTime (when order is picked up)
- `pickup_lat`, `pickup_lng`: Float (pickup location - usually same as store)
- `delivery_time`: DateTime (when delivery confirmed)
- `delivery_lat`, `delivery_lng`: Float (exact delivery location - GPS recorded)
- `delivery_proof_url`: Text (optional photo/signature proof, base64)

---

## 2) Break Feature (New)

Employees can mark themselves as "on break" to pause real-time tracking.

### New Database Model: Break

```python
class Break(db.Model):
    __tablename__ = 'breaks'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    start_time = db.Column(db.DateTime, default=datetime.utcnow)
    end_time = db.Column(db.DateTime, nullable=True)  # None if ongoing
    duration_minutes = db.Column(db.Integer, nullable=True)  # Calculated on end
    break_type = db.Column(db.String(50), default='lunch')  # 'lunch', 'rest', 'personal'
    is_active = db.Column(db.Boolean, default=True)
```

### Attendance Model Update

- `break_duration_minutes`: Integer (total break time in a shift, auto-calculated from Break records)
- `is_on_break`: Boolean (current status, for quick queries)

---

## 3) Backend API Endpoints (New/Updated)

### Order Management

| Endpoint | Method | Purpose | Payload |
|----------|--------|---------|---------|
| `/api/orders/assign` | POST | Admin assigns task to employee | `{ employee_id, title, address, customer_lat, customer_lng }` |
| `/api/orders/arrived-at-store` | POST | Employee checks in at store | `{ order_id, latitude, longitude }` |
| `/api/orders/pickup-confirm` | POST | Employee confirms order pickup | `{ order_id, latitude, longitude }` |
| `/api/orders/delivery-confirm` | POST | Employee confirms delivery | `{ order_id, latitude, longitude, proof_photo (optional) }` |
| `/api/orders/assigned` | GET | Get assigned tasks for employee | - |
| `/api/orders/history` | GET | Employee delivery history | - |

### Break Management

| Endpoint | Method | Purpose | Payload |
|----------|--------|---------|---------|
| `/api/attendance/break-start` | POST | Start a break | `{ break_type: 'lunch'\|'rest'\|'personal' }` |
| `/api/attendance/break-end` | POST | End ongoing break | - |
| `/api/attendance/breaks-today` | GET | Get today's breaks | - |

---

## 4) Frontend UI Updates

### Employee View - Home Screen Enhancements

**Order Assignment Panel**:
- List of assigned orders (new status: "Pending")
- Order details: Title, destination address, assignment time
- Button: "Check In at Store" → triggers geolocation capture

**Order Workflow UI**:
- After check-in: Show "Order Picked Up" button (captures GPS)
- During delivery: Show "Delivery Completed" button (captures exact location)
- Delivery screen: Map (optional for reference), location coordinates, optional upload field for photo proof

**Break Feature UI** (on home screen):
- Current status: "On Clock" / "On Break"
- Button: "Start Break" (shows dropdown: Lunch, Rest, Personal)
- While on break: "End Break" button, timer showing break duration
- Break history summary: Total break time today

### Admin View - Analytics Dashboard Update

**Order Tracking**:
- List of all assigned orders with status badges
- Map view showing order locations (pickup, delivery)
- Employee availability filter (show "available now" vs "on task" vs "on break")
- Delivery routes: From store → delivery point with travel time estimate

---

## 5) Implementation Steps

### Phase 1: Database & Models (Backend)
- [ ] Update `Order` model with new fields (status, times, coordinates, proof_url)
- [ ] Create new `Break` model
- [ ] Update `Attendance` model (add break_duration_minutes, is_on_break)
- [ ] Create database migration (add new columns, alter status enum)

### Phase 2: Backend API (orders.py, attendance.py)
- [ ] Implement `/orders/arrived-at-store` endpoint
- [ ] Implement `/orders/pickup-confirm` endpoint
- [ ] Implement `/orders/delivery-confirm` endpoint (with GPS validation, location recording)
- [ ] Implement `/attendance/break-start` endpoint
- [ ] Implement `/attendance/break-end` endpoint
- [ ] Add status validation logic (e.g., can't confirm pickup without store arrival)

### Phase 3: Frontend UI (app.js, index.html, style.css)
- [ ] Add order workflow UI components (buttons, status indicators)
- [ ] Add break feature UI (toggle, timer, history)
- [ ] Update navigation to show break status
- [ ] Add GPS capture for all workflow steps
- [ ] Add location display (coordinates, map preview)
- [ ] Add error handling for geolocation failures

### Phase 4: Testing & Validation
- [ ] Test order workflow end-to-end
- [ ] Test GPS accuracy and edge cases
- [ ] Test break timing and calculations
- [ ] Validate data storage (location coordinates precision)

---

## 6) Key Technical Details

### GPS Accuracy & Location Recording
- Use `navigator.geolocation.getCurrentPosition()` (already in app)
- Capture latitude, longitude with ~5-10m accuracy
- Store as DECIMAL(9,6) in DB (sufficient for coordinates)
- Optional: Validate delivery location is within X meters of destination address

### Break Time Calculation
- Start: Record `start_time`
- End: Calculate `duration_minutes = (end_time - start_time) / 60`
- Auto-update `Attendance.break_duration_minutes` on break end
- Display: "Total break time: 45 mins" on dashboard

### Order Status Transitions
```
assigned 
  → (employee_arrived_at_store) [validation: GPS within office area or general location]
  → (order_picked_up) [validation: must have arrived first]
  → (order_delivered) [validation: GPS at delivery destination, proof optional]
```

### Data Persistence
- All GPS coordinates stored with timestamp
- Full audit trail: who did what, when, where
- Admin can export delivery history with locations

---

## 7) Free Libraries/Tools Needed

- **reportlab** (PDF salary slip generation) - FREE, already Python standard
- **geopy** (optional, for distance calculation) - FREE
- **Google Maps API** (free tier for embedded maps) - Already in use
- No new paid dependencies required; all free/open-source

---

## 8) Estimated Effort

- Phase 1 (DB): 4-6 hours
- Phase 2 (API): 6-8 hours
- Phase 3 (Frontend): 8-10 hours
- Phase 4 (Testing): 4-6 hours
- **Total**: ~24-30 hours (~3-4 days solo development)

---

## 9) Future Enhancements (Post-MVP)

- Real-time map tracking of employee during delivery
- Automatic geofencing violations alert (admin notified if employee outside delivery radius)
- Batch order assignments (assign multiple orders at once)
- Customer signature capture on delivery
- Time analytics: Average delivery time, idle time, etc.

