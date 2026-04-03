# Testing & Deployment Guide

## Phase 4: Validation & Testing

### Pre-Flight Checklist

**✅ Database Models Updated**
- [x] Order model: Added store_arrival, pickup, and delivery workflow fields
- [x] Attendance model: Added break tracking fields (is_on_break, break_duration_minutes)
- [x] Break model: New model for break tracking
- [x] User model: Added breaks relationship

**✅ Backend APIs Implemented**
- [x] `/api/orders/arrived-at-store` - POST
- [x] `/api/orders/pickup-confirm` - POST  
- [x] `/api/orders/delivery-confirm` - POST
- [x] `/api/attendance/break-start` - POST
- [x] `/api/attendance/break-end` - POST
- [x] `/api/attendance/breaks-today` - GET
- [x] `/api/attendance/status` - GET (current status)
- [x] `/api/orders/history` - GET (delivery history)

**✅ Frontend UI Enhanced**
- [x] Break status badge + controls (start/end buttons)
- [x] Order workflow UI (4-step process)
- [x] Workflow buttons: Arrived at Store → Pickup Confirmed → Delivery Completed
- [x] GPS capture for all workflow steps
- [x] Order history rendering with improved status badges

---

## Quick Start Testing

### 1. Database Reset (Fresh Start)

```bash
# Navigate to workspace
cd /home/sakthivel/workforce

# Remove old database (if needed)
rm -f workforce.db

# Start Python
python app.py
```

The app will auto-create and seed:
- Admin: `admin@workforce.com` / `admin123`
- Employee: `employee@workforce.com` / `emp123`

### 2. Test the Order Workflow (Employee Flow)

**Login as Employee**
- Email: `employee@workforce.com`
- Password: `emp123`

**Test Steps:**
1. ✅ Navigate to Home screen
2. ✅ Check break status shows "On Clock"
3. ✅ Start Break
   - Click "Start Break"
   - Select "Lunch Break" from dropdown
   - Verify status changes to "On Break (0m)"
   - Wait 30 seconds
   - Verify timer increments
4. ✅ End Break
   - Click "End Break"
   - Verify status returns to "On Clock"
   - Confirm duration was recorded

**Test Order Workflow (after admin assigns order):**
1. ✅ View assigned order in "Your Active Orders"
2. ✅ Click "📍 Arrived at Store"
   - GPS location captured
   - Status updates to "employee_arrived_at_store"
   - Button changes to "📦 Pickup Confirmed"
3. ✅ Click "📦 Pickup Confirmed"
   - GPS location captured
   - Status updates to "order_picked_up"
   - Button changes to "✓ Delivery Completed"
4. ✅ Click "✓ Delivery Completed"
   - GPS location captured (delivery location)
   - Success alert with distance traveled
   - Order removed from active list (moved to delivered)
5. ✅ Verify data in backend:
   - store_arrival_lat/lng populated
   - pickup_lat/lng populated
   - delivery_lat/lng populated (exact location)
   - delivery_time recorded
   - distance_km calculated

### 3. Test the Admin Flow

**Login as Admin**
- Email: `admin@workforce.com`
- Password: `admin123`

**Test Steps:**
1. ✅ Navigate to Admin screen
2. ✅ Create new employee
   - Name: "Test Driver"
   - Email: "driver@test.com"
   - Password: "test123"
   - Salary: "25000"
3. ✅ Assign Order
   - Select "Test Driver"
   - Title: "Deliver Monitor"
   - Address: "123 Main Street"
   - Submit
4. ✅ Verify notification appears for employee
5. ✅ Monitor order progress via dashboard
   - See order status updates in real-time
   - View delivery location data when completed

### 4. API Testing (Using curl or Postman)

**Test Break endpoints:**
```bash
# Get authorization token first
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "employee@workforce.com",
    "password": "emp123"
  }'

# Extract access_token from response

# Start break
curl -X POST http://localhost:4000/api/attendance/break-start \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "break_type": "lunch"
  }'

# End break
curl -X POST http://localhost:4000/api/attendance/break-end \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json"

# Get today's breaks
curl -X GET http://localhost:4000/api/attendance/breaks-today \
  -H "Authorization: Bearer <TOKEN>"

# Get current status
curl -X GET http://localhost:4000/api/attendance/status \
  -H "Authorization: Bearer <TOKEN>"
```

**Test Order endpoints:**
```bash
# Arrived at store
curl -X POST http://localhost:4000/api/orders/arrived-at-store \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": 1,
    "latitude": 14.5995,
    "longitude": 78.0000
  }'

# Pickup confirm
curl -X POST http://localhost:4000/api/orders/pickup-confirm \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": 1,
    "latitude": 14.5995,
    "longitude": 78.0000
  }'

# Delivery confirm
curl -X POST http://localhost:4000/api/orders/delivery-confirm \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": 1,
    "latitude": 14.6050,
    "longitude": 78.0100
  }'
```

---

## Data Verification

### Check Database After Tests

```bash
# Open SQLite shell
sqlite3 workforce.db

# Verify Break records
sqlite> SELECT * FROM breaks;

# Verify Order workflow fields
sqlite> SELECT id, status, store_arrival_time, pickup_time, delivery_time, delivery_lat, delivery_lng, distance_km FROM orders;

# Verify Attendance break tracking
sqlite> SELECT id, is_on_break, break_duration_minutes FROM attendances;
```

---

## Known Limitations & Future Enhancements

**Current Implementation:**
- ✅ 4-stage order workflow with exact GPS location recording
- ✅ Break start/end with duration calculation
- ✅ Status transitions with validation
- ✅ Delivery location accuracy (captured at confirmation)
- ✅ Distance calculation from office to delivery point

**Not Yet Implemented (Post-MVP):**
- ⏳ Real-time map tracking during delivery
- ⏳ Geofencing violation alerts
- ⏳ Automatic photo capture for delivery proof
- ⏳ Batch order assignments
- ⏳ Customer signature capture
- ⏳ Advanced analytics (heatmaps, delivery time trends)

---

## Troubleshooting

**Q: Geolocation not working?**
- A: App requires HTTPS or localhost for geolocation (browser security)
- Use `http://localhost:4000` for testing
- On mobile, ensure location permission is granted

**Q: Order status not updating?**
- A: Verify JWT token is valid (not expired)
- Check browser console for API errors
- Ensure order ID matches an existing order

**Q: Break duration shows 0?**
- A: Break needs at least 1 minute to record duration
- Ensure you waited before clicking "End Break"

**Q: GPS coordinates incorrect?**
- A: Use `{ enableHighAccuracy: true }` for better accuracy
- Coordinates stored as DECIMAL(9,6) for ~0.1m precision

---

## Deployment Notes

**For Production:**
1. Set `DATABASE_URL` environment variable for PostgreSQL
2. Set `JWT_SECRET_KEY` to a secure random value
3. Enable HTTPS for geolocation
4. Set proper CORS origins in Flask
5. Use gunicorn/uWSGI server (not Flask dev server)
6. Add rate limiting on auth/assignment endpoints
7. Implement audit logging for order changes

**Scaling Considerations:**
- Current: SQLite works fine for <50 concurrent users
- Beyond 50: Migrate to PostgreSQL
- Add Redis for break status caching
- Implement background jobs for notifications (Celery)

