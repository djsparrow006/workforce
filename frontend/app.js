// Workforce Pro App v2.1 - Emergency Navigation Fix
const BASE_URL = (window.location.hostname.includes('192.168.1.4') || window.location.protocol === 'capacitor:')
    ? 'http://192.168.1.4:5000/api'
    : '/api';

let authToken = localStorage.getItem('authToken');
let userData = null;
try {
    userData = JSON.parse(localStorage.getItem('userData'));
} catch (e) {
    console.warn("User data invalid", e);
}

let currentAssignUserId = null;
let deliveryMap = null;
let deliveryMarker = null;
let selectedUserId = null; // for admin assignment popup
let isSelectedUserOnline = false; // for online check
let selectedOrderId = null; // for employee delivery
let targetCoords = { lat: 0, lng: 0 };

// Break & Order Workflow State
let currentOrderId = null;
let currentOrderStatus = null;  // 'assigned', 'arrived_at_store', 'picked_up', 'delivered'
let isOnBreak = false;
let activeBreakStartTime = null;
let breakType = null;
let currentRequestType = 'leaves'; // 'leaves' or 'expenses'

// Theme Management
function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-theme');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeIcon(isDark);
}

function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = savedTheme === 'dark' || (!savedTheme && prefersDark);

    if (isDark) {
        document.body.classList.add('dark-theme');
    } else {
        document.body.classList.remove('dark-theme');
    }
    updateThemeIcon(isDark);
}

function updateThemeIcon(isDark) {
    const btn = safeSelect('theme-toggle');
    if (btn) {
        btn.innerHTML = isDark
            ? `<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" /></svg>`
            : `<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>`;
    }
}



// Helper to safely select elements
function safeSelect(id) {
    const el = document.getElementById(id);
    if (!el) {
        console.warn(`Element '${id}' not found`);
    }
    return el;
}





// Screen Map
const screens = {
    home: 'home-screen',
    leave: 'leave-screen',
    expense: 'expense-screen',
    salary: 'salary-screen',
    admin_orders: 'admin-orders-screen',
    admin_requests: 'admin-requests-screen',
    admin_employees: 'admin-employees-screen',
    admin_notifications: 'admin-notifications-screen',
    admin_settings: 'admin-settings-screen'
};

function switchScreen(screenKey) {
    const targetId = screens[screenKey];
    if (!targetId) {
        console.error(`No screen found for key: ${screenKey}`);
        return;
    }


    // Hide all screens
    Object.values(screens).forEach(id => {
        const el = safeSelect(id);
        if (el) el.classList.add('hidden');
    });

    // Deactivate all nav items
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));

    // Show target
    const targetEl = safeSelect(targetId);
    if (targetEl) {
        targetEl.classList.remove('hidden');
        targetEl.style.display = 'block'; // Force visibility
        const navItem = document.querySelector(`[data-screen="${screenKey}"]`);
        if (navItem) navItem.classList.add('active');
    } else {
        console.error(`Target element ${targetId} missing`);
    }


    // Refresh Data
    try {
        if (screenKey === 'home') {
            if (userData && userData.role === 'admin') fetchAdminDash();
            else {
                fetchAttendanceData();
                fetchActiveOrders();
            }
            fetchNotifications();
        }
        else if (screenKey === 'leave') fetchLeaveData();
        else if (screenKey === 'expense') fetchExpenseData();
        else if (screenKey === 'salary') fetchSalaryData();
        else if (screenKey === 'admin_orders') fetchAdminOrders();
        else if (screenKey === 'admin_requests') {
            currentRequestType = 'leaves'; // default
            fetchAdminRequests();
        }
        else if (screenKey === 'admin_employees') fetchAdminEmployees();
        else if (screenKey === 'admin_notifications') fetchNotifications();
        else if (screenKey === 'admin_settings') fetchAdminSettings();
    } catch (e) {
        console.error(`Data fetch error for ${screenKey}: ${e.message}`);
    }
}



// Ensure screens are visible even if data fails
function safeSwitch(screenKey) {
    try {
        switchScreen(screenKey);
    } catch (e) {
        console.error("Navigation error", e);
        // Emergency fallback: un-hide the screen manually
        const targetId = screens[screenKey];
        const el = safeSelect(targetId);
        if (el) el.classList.remove('hidden');
    }
}

// App Logic
function showApp() {
    const auth = safeSelect('auth-screen');
    const nav = safeSelect('nav-bar');
    if (auth) auth.classList.add('hidden');
    if (nav) nav.classList.remove('hidden');

    const nameDisplay = safeSelect('user-name');
    if (nameDisplay && userData) nameDisplay.textContent = userData.name;

    // Reset body classes
    document.body.classList.remove('user-role-admin', 'user-role-employee');

    if (userData && userData.role === 'admin') {
        document.body.classList.add('user-role-admin');

        // Hide ALL employee-only UI elements
        ['check-in-section', 'check-out-section', 'break-status-badge', 'break-controls', 'order-workflow-container'].forEach(id => {
            const el = safeSelect(id);
            if (el) el.classList.add('hidden');
        });

        // Ensure all admin items are shown
        document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
        // Ensure employee nav items are hidden
        document.querySelectorAll('.emp-only').forEach(el => el.classList.add('hidden'));

        switchScreen('home'); // Now goes to home which handles Admin Dash
        fetchAdminBadges();
    } else {
        document.body.classList.add('user-role-employee');

        requestNotificationPermission();
        updateBreakUI();
        safeSwitch('home');
    }
}


function logout() {
    localStorage.clear();
    window.location.href = '/';
}

// Global Notification Helper
let lastNotifId = localStorage.getItem('lastNotifId') || 0;

async function requestNotificationPermission() {
    if ("Notification" in window) {
        if (Notification.permission !== "granted" && Notification.permission !== "denied") {
            await Notification.requestPermission();
        }
    }
}


// Global Listeners
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => safeSwitch(item.dataset.screen));
});

// Complete Order
const btnCompleteOrder = safeSelect('btn-complete-order');
if (btnCompleteOrder) {
    btnCompleteOrder.addEventListener('click', async () => {
        btnCompleteOrder.disabled = true;
        btnCompleteOrder.textContent = 'Verifying Location...';

        navigator.geolocation.getCurrentPosition(async (pos) => {
            const body = {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                order_id: selectedOrderId
            };

            const res = await apiCall('/orders/complete', 'POST', body);
            if (res.ok) {
                const data = await res.json();
                alert(`Order Completed! Distance covered: ${data.distance} km`);
                selectedOrderId = null;
                const mapCont = safeSelect('map-container');
                if (mapCont) mapCont.classList.add('hidden');
                fetchAttendanceData();
                fetchActiveOrders();
            } else {
                const d = await res.json();
                alert(d.msg || 'Completion failed');
            }
            btnCompleteOrder.disabled = false;
            btnCompleteOrder.innerHTML = `
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                Deliver Product (Complete Order)
            `;
        }, (err) => {

            alert("Geolocation failed: " + err.message);
            btnCompleteOrder.disabled = false;
            btnCompleteOrder.textContent = 'Deliver Product (Complete Order)';
        }, { enableHighAccuracy: true });
    });
}

// Global Logout handling for new professional buttons
document.addEventListener('click', (e) => {
    if (e.target.closest('.btn-logout-header') ||
        e.target.closest('#btn-logout-footer') ||
        e.target.closest('#btn-logout-admin')) {
        logout();
    }
});


// Updated Settings logic for new ID
const btnT = safeSelect('btn-save-settings-main');
if (btnT) {
    btnT.addEventListener('click', async () => {
        const latInput = safeSelect('setting-lat-main');
        const lngInput = safeSelect('setting-long-main');

        if (!latInput || !lngInput) return;
        const lat = parseFloat(latInput.value);
        const lng = parseFloat(lngInput.value);

        if (isNaN(lat) || isNaN(lng)) {
            alert('Please enter valid coordinates');
            return;
        }

        const res = await apiCall('/admin/settings', 'POST', {
            office_lat: lat.toString(),
            office_long: lng.toString()
        });
        if (res.ok) alert('Settings saved!');
        else alert('Failed to save settings');
    });
}

async function fetchAdminSettings() {
    const res = await apiCall('/admin/settings', 'GET');
    if (res.ok) {
        const settings = await res.json();
        const latInput = safeSelect('setting-lat-main');
        const lngInput = safeSelect('setting-long-main');
        if (latInput) latInput.value = settings.office_lat || '14.5995';
        if (lngInput) lngInput.value = settings.office_long || '78.0000';
    }
}

const btnSaveSettings = safeSelect('btn-save-settings');
if (btnSaveSettings) {
    btnSaveSettings.addEventListener('click', async () => {
        const latInput = safeSelect('setting-lat');
        const lngInput = safeSelect('setting-long');

        if (!latInput || !lngInput) {
            alert('Settings inputs not found');
            return;
        }

        const lat = parseFloat(latInput.value);
        const lng = parseFloat(lngInput.value);

        if (isNaN(lat) || isNaN(lng)) {
            alert('Please enter valid latitude and longitude values');
            return;
        }

        const settings = {
            office_lat: lat.toString(),
            office_long: lng.toString()
        };

        try {
            const res = await apiCall('/admin/settings', 'POST', settings);
            if (res.ok) {
                alert('Office coordinates updated successfully!');
            } else {
                const err = await res.json();
                alert('Error updating settings: ' + (err.msg || 'Unknown error'));
            }
        } catch (error) {
            alert('Network error: ' + error.message);
        }
    });
}

// ============================================================
// ORDER WORKFLOW FUNCTIONS (NEW)
// ============================================================

async function arrivedAtStore(orderId) {
    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(async (pos) => {
            const body = {
                order_id: orderId,
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude
            };
            const res = await apiCall('/orders/arrived-at-store', 'POST', body);
            if (res.ok) {
                const data = await res.json();
                alert('✓ Checked in at store! Waiting for order.');
                currentOrderId = orderId;
                currentOrderStatus = 'arrived_at_store';
                fetchActiveOrders();
                resolve(data);
            } else {
                const err = await res.json();
                alert('Error: ' + (err.msg || 'Check-in failed'));
                resolve(null);
            }
        }, (err) => {
            alert('Geolocation failed: ' + err.message);
            resolve(null);
        }, { enableHighAccuracy: true });
    });
}

async function confirmPickup(orderId) {
    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(async (pos) => {
            const body = {
                order_id: orderId,
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude
            };
            const res = await apiCall('/orders/pickup-confirm', 'POST', body);
            if (res.ok) {
                const data = await res.json();
                alert('✓ Order picked up! Ready for delivery.');
                currentOrderStatus = 'picked_up';
                fetchActiveOrders();
                resolve(data);
            } else {
                const err = await res.json();
                alert('Error: ' + (err.msg || 'Pickup confirmation failed'));
                resolve(null);
            }
        }, (err) => {
            alert('Geolocation failed: ' + err.message);
            resolve(null);
        }, { enableHighAccuracy: true });
    });
}

async function confirmDelivery(orderId) {
    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(async (pos) => {
            const body = {
                order_id: orderId,
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude
            };
            const res = await apiCall('/orders/delivery-confirm', 'POST', body);
            if (res.ok) {
                const data = await res.json();
                alert(`✓ Delivery confirmed! Distance: ${data.distance_km}km from office. Exact location recorded: (${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)})`);
                currentOrderStatus = 'delivered';
                currentOrderId = null;
                fetchActiveOrders();
                resolve(data);
            } else {
                const err = await res.json();
                alert('Error: ' + (err.msg || 'Delivery confirmation failed'));
                resolve(null);
            }
        }, (err) => {
            alert('Geolocation failed: ' + err.message);
            resolve(null);
        }, { enableHighAccuracy: true });
    });
}

function renderOrderWorkflowUI(orders, status) {
    if (!orders || orders.length === 0) return null;

    const order = orders[0];
    const html = `
        <div class="item-card" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; margin-bottom: 1rem;">
            <h4 style="margin: 0 0 0.5rem 0; color: white;">Current Order</h4>
            <p style="margin: 0.25rem 0; font-size: 0.9rem;"><strong>${order.title}</strong></p>
            <p style="margin: 0.25rem 0; font-size: 0.8rem;">📍 ${order.address}</p>
            <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid rgba(255,255,255,0.3);">
                <p style="margin: 0; font-size: 0.75rem; text-transform: uppercase; opacity: 0.9;">Status: ${order.status.replace(/_/g, ' ')}</p>
            </div>
            <div style="margin-top: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
    `;

    if (order.status === 'assigned') {
        html += `<button onclick="arrivedAtStore(${order.id})" class="btn btn-primary" style="flex: 1; padding: 0.5rem; font-size: 0.8rem; min-width: 120px;">📍 Arrived at Store</button>`;
    } else if (order.status === 'employee_arrived_at_store') {
        html += `<button onclick="confirmPickup(${order.id})" class="btn btn-success" style="flex: 1; padding: 0.5rem; font-size: 0.8rem; min-width: 120px;">📦 Pickup Confirmed</button>`;
    } else if (order.status === 'order_picked_up') {
        html += `<button onclick="confirmDelivery(${order.id})" class="btn btn-primary" style="flex: 1; padding: 0.5rem; font-size: 0.8rem; min-width: 120px; background: #10b981;">✓ Delivery Completed</button>`;
    }
    html += `</div></div>`;

    return html;
}

// ============================================================
// BREAK MANAGEMENT FUNCTIONS (NEW)
// ============================================================

async function startBreak(breakType = 'lunch') {
    const res = await apiCall('/attendance/break-start', 'POST', { break_type: breakType });
    if (res.ok) {
        const data = await res.json();
        isOnBreak = true;
        activeBreakStartTime = new Date();
        breakType = data.break.break_type;
        updateBreakUI();
        alert(`✓ Break started: ${breakType}`);
        return data;
    } else {
        const err = await res.json();
        alert('Error: ' + (err.msg || 'Could not start break'));
        return null;
    }
}

async function endBreak() {
    const res = await apiCall('/attendance/break-end', 'POST', {});
    if (res.ok) {
        const data = await res.json();
        isOnBreak = false;
        activeBreakStartTime = null;
        alert(`✓ Break ended. Duration: ${data.break_duration_minutes} minutes`);
        updateBreakUI();
        return data;
    } else {
        const err = await res.json();
        alert('Error: ' + (err.msg || 'Could not end break'));
        return null;
    }
}

function getBreakStatusBadge() {
    if (!isOnBreak) {
        return `<span style="background: rgba(34, 197, 94, 0.2); color: #22c55e; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600;">On Clock</span>`;
    } else {
        const elapsed = Math.floor((new Date() - activeBreakStartTime) / 60000);
        return `<span style="background: rgba(251, 146, 60, 0.2); color: #fb923c; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600;">On Break (${elapsed}m)</span>`;
    }
}

function updateBreakUI() {
    const breakStatusEl = safeSelect('break-status-badge');
    if (breakStatusEl) {
        breakStatusEl.innerHTML = getBreakStatusBadge();
    }

    const breakControlsEl = safeSelect('break-controls');
    if (breakControlsEl) {
        if (isOnBreak) {
            breakControlsEl.innerHTML = `
                <button onclick="endBreak()" class="btn" style="background: #fb923c; color: white; width: 100%; padding: 0.5rem;">End Break</button>
            `;
        } else {
            breakControlsEl.innerHTML = `
                <select id="break-type-select" style="width: 100%; padding: 0.5rem; margin-bottom: 0.5rem; border: 1.5px solid var(--border-color); border-radius: var(--radius-md);">
                    <option value="lunch">🍽️ Lunch Break</option>
                    <option value="rest">😴 Rest Break</option>
                    <option value="personal">👤 Personal Break</option>
                </select>
                <button onclick="startBreakWithType()" class="btn btn-primary" style="width: 100%; padding: 0.5rem;">Start Break</button>
            `;
        }
    }
}

function startBreakWithType() {
    const selectEl = safeSelect('break-type-select');
    if (selectEl) {
        startBreak(selectEl.value);
    } else {
        startBreak('lunch');
    }
}

// API Utilities
async function apiCall(endpoint, method = 'GET', body = null) {
    const headers = { 'Authorization': `Bearer ${authToken}` };
    if (body) headers['Content-Type'] = 'application/json';
    try {
        const response = await fetch(`${BASE_URL}${endpoint}`, {
            method, headers,
            body: body ? JSON.stringify(body) : null
        });
        if (response.status === 401) logout();
        return response;
    } catch (err) {
        console.error("API failed", err);
        return { ok: false };
    }
}

// Attendance
async function fetchAttendanceData() {
    const res = await apiCall('/attendance/history');
    if (res.ok) {
        const data = await res.json();
        const latest = data[0];
        setAttendanceUI(latest && latest.check_in && !latest.check_out);
        renderAttendanceList(data);
    }
}

function setAttendanceUI(isCheckedIn) {
    const badge = safeSelect('attendance-status-badge');
    const inS = safeSelect('check-in-section');
    const outS = safeSelect('check-out-section');
    if (!badge || !inS || !outS) return;

    if (isCheckedIn) {
        badge.textContent = 'Checked In';
        badge.className = 'status-badge status-online';
        inS.classList.add('hidden');
        outS.classList.remove('hidden');
    } else {
        badge.textContent = 'Checked Out';
        badge.className = 'status-badge status-offline';
        inS.classList.remove('hidden');
        outS.classList.add('hidden');
    }
}
// Google Maps Integration
window.onGoogleMapsLoaded = () => {
    console.log("Google Maps API Loaded");
};

function initMap(lat, lng) {
    targetCoords = { lat, lng };
    const mapCont = safeSelect('map-container');
    if (mapCont) mapCont.classList.remove('hidden');

    const mapEl = safeSelect('delivery-map');
    if (!mapEl) return;

    if (!deliveryMap) {
        deliveryMap = new google.maps.Map(mapEl, {
            center: { lat, lng },
            zoom: 15,
            mapId: 'DEMO_MAP_ID', // Optional modern styling
            disableDefaultUI: true,
            zoomControl: true
        });
        deliveryMarker = new google.maps.Marker({
            position: { lat, lng },
            map: deliveryMap,
            title: "Delivery Location",
            animation: google.maps.Animation.DROP
        });
    } else {
        const newPos = { lat, lng };
        deliveryMap.setCenter(newPos);
        deliveryMarker.setPosition(newPos);
    }
}

function openGoogleNav() {
    if (targetCoords.lat && targetCoords.lng) {
        const url = `https://www.google.com/maps/dir/?api=1&destination=${targetCoords.lat},${targetCoords.lng}&travelmode=driving`;
        window.open(url, '_blank');
    }
}

const btnGNav = safeSelect('btn-google-nav');
if (btnGNav) {
    btnGNav.addEventListener('click', openGoogleNav);
}

async function fetchActiveOrders() {

    const res = await apiCall('/orders/assigned');
    if (res.ok) {
        const data = await res.json();
        renderActiveOrders(data);
    }
}

function renderActiveOrders(orders) {
    const list = safeSelect('active-orders-list');
    if (!list) return;

    if (orders.length === 0) {
        list.innerHTML = '<p style="text-align:center; padding:1rem; color:var(--text-secondary); font-size:0.8rem;">No active orders.</p>';
        return;
    }

    // Show workflow UI if there's an active order
    const workflowUI = renderOrderWorkflowUI(orders, orders[0]?.status);
    const workflowContainer = safeSelect('order-workflow-container');
    if (workflowContainer && workflowUI) {
        workflowContainer.innerHTML = workflowUI;
        workflowContainer.classList.remove('hidden');
    }

    list.innerHTML = orders.map(order => `
        <div class="active-order-card ${selectedOrderId === order.id ? 'selected' : ''}" onclick="selectOrder(${order.id}, ${order.customer_lat}, ${order.customer_long})">
            <div class="order-header">
                <strong>${order.title}</strong>
                <span class="badge badge-${order.status === 'assigned' ? 'pending' : order.status === 'order_delivered' ? 'completed' : 'progress'}">${order.status.replace(/_/g, ' ')}</span>
            </div>
            <p>${order.address || 'No address provided'}</p>
        </div>
    `).join('');
}

function selectOrder(id, lat, lng) {
    selectedOrderId = id;
    fetchActiveOrders(); // Re-render to show selection
    initMap(lat, lng);
}

window.selectOrder = selectOrder;

function renderAttendanceList(items) {
    const list = safeSelect('attendance-history-list');
    if (!list) return;
    if (!Array.isArray(items)) {
        list.innerHTML = '<p style="text-align:center; padding:1rem; color:var(--text-secondary);">No history found.</p>';
        return;
    }
    if (items.length === 0) {
        list.innerHTML = '<p style="text-align:center; padding:1rem; color:var(--text-secondary);">No history found.</p>';
        return;
    }
    list.innerHTML = items.map(item => `
        <div class="history-item">
            <div class="history-details">
                <p>${item.check_in ? new Date(item.check_in).toLocaleDateString() : 'N/A'}</p>
                <p>Status: ${item.status || 'Verified'}</p>
            </div>
            <div style="text-align: right;">
                <strong>${item.check_in ? new Date(item.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</strong>
                <p>${item.check_out ? new Date(item.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</p>
            </div>
        </div>
    `).join('');
}

// Missing fetch functions
async function fetchLeaveData() {
    const res = await apiCall('/leave/history');
    if (res.ok) {
        const data = await res.json();
        const list = safeSelect('leave-history-list');
        if (list && Array.isArray(data)) {
            list.innerHTML = data.map(item => `
                <div class="item-card">
                    <div style="display:flex; justify-content:space-between;">
                        <strong>${item.leave_type.toUpperCase()}</strong>
                        <span class="badge badge-${item.status}">${item.status}</span>
                    </div>
                    <p style="font-size:0.8rem; margin:0.4rem 0;">${new Date(item.start_date).toLocaleDateString()} to ${new Date(item.end_date).toLocaleDateString()}</p>
                    <p style="font-size:0.75rem; color:var(--text-secondary);">${item.reason}</p>
                </div>
            `).join('');
        }
    }
}

async function fetchExpenseData() {
    const res = await apiCall('/expense/history');
    if (res.ok) {
        const data = await res.json();
        const list = safeSelect('expense-history-list');
        if (list && Array.isArray(data)) {
            list.innerHTML = data.map(item => `
                <div class="item-card">
                    <div style="display:flex; justify-content:space-between;">
                        <strong>₹${item.amount}</strong>
                        <span class="badge badge-${item.status}">${item.status}</span>
                    </div>
                    <p style="font-size:0.8rem; margin:0.4rem 0;">${item.description}</p>
                    <p style="font-size:0.7rem; color:var(--text-secondary);">${new Date(item.created_at).toLocaleDateString()}</p>
                </div>
            `).join('');
        }
    }
}

async function fetchSalaryData() {
    const res = await apiCall('/salary/summary');
    if (res.ok) {
        const data = await res.json();
        const container = safeSelect('salary-details');
        if (container) {
            container.innerHTML = `
                <div class="salary-card">
                    <p>Estimated Salary (${data.month || 'Current Month'})</p>
                    <div class="salary-amount">₹${data.net_salary || 0}</div>
                    <div class="stat-grid">
                        <div class="stat-item">
                            <p>Days Worked</p>
                            <p>${data.stats ? data.stats.attendance_days : 0}</p>
                        </div>
                        <div class="stat-item">
                            <p>Incentives</p>
                            <p>₹${(data.performance_commission || 0) + (data.travel_incentive || 0)}</p>
                        </div>
                    </div>
                </div>
                <div class="item-card">
                    <div style="display:flex; justify-content:space-between; margin-bottom: 0.5rem;">
                        <span>Base Salary</span>
                        <span>₹${data.base_salary || 0}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size: 0.9rem; color: var(--text-secondary);">
                        <span>Attendance Pay</span>
                        <span>₹${data.attendance_pay || 0}</span>
                    </div>
                </div>
            `;
        }
    }
}


// Admin
// ============================================================
// ADMIN SEGREGATED FUNCTIONS (NEW)
// ============================================================

async function fetchAdminDash() {
    const adminCont = safeSelect('admin-home-content');
    const empCont = safeSelect('employee-home-content');
    if (adminCont) adminCont.classList.remove('hidden');
    if (empCont) empCont.classList.add('hidden');

    const res = await apiCall('/admin/dash-stats');
    if (res.ok) {
        const stats = await res.json();

        if (safeSelect('dash-total-payroll')) safeSelect('dash-total-payroll').textContent = `₹${stats.monthly_payroll.toLocaleString()}`;
        if (safeSelect('dash-online-count')) safeSelect('dash-online-count').textContent = stats.online_count;
        if (safeSelect('dash-deliveries-today')) safeSelect('dash-deliveries-today').textContent = `${stats.deliveries_today} Orders`;
        if (safeSelect('dash-assigned-pending')) safeSelect('dash-assigned-pending').textContent = `${stats.assigned_pending} Orders`;

        if (safeSelect('admin-dash-leaves')) safeSelect('admin-dash-leaves').textContent = stats.pending_leaves;
        if (safeSelect('admin-dash-expenses')) safeSelect('admin-dash-expenses').textContent = stats.pending_expenses;

        if (safeSelect('admin-last-sync')) {
            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            safeSelect('admin-last-sync').textContent = `Sync: ${timeStr}`;
        }
    }

    // Fetch counts for badges
    fetchAdminBadges();
}

async function fetchAdminBadges() {
    const leaveRes = await apiCall('/leave/all-pending');
    const expenseRes = await apiCall('/expense/all-pending');
    const notifRes = await apiCall('/notifications');

    let totalRequests = 0;
    if (leaveRes.ok) {
        const leaves = await leaveRes.json();
        totalRequests += leaves.length;
        if (safeSelect('admin-dash-leaves')) safeSelect('admin-dash-leaves').textContent = leaves.length;
    }
    if (expenseRes.ok) {
        const expenses = await expenseRes.json();
        totalRequests += expenses.length;
        if (safeSelect('admin-dash-expenses')) safeSelect('admin-dash-expenses').textContent = expenses.length;
    }

    updateAdminBadge('badge-admin-requests', totalRequests);

    if (notifRes.ok) {
        const notifs = await notifRes.json();
        updateAdminBadge('badge-admin-notif', notifs.length);
    }
}

function updateAdminBadge(id, count) {
    const el = safeSelect(id);
    if (el) {
        el.textContent = count;
        el.classList.toggle('hidden', count === 0);
    }
}

async function fetchAdminOrders() {
    const res = await apiCall('/admin/employee-details');
    if (res.ok) {
        const items = await res.json();
        const list = safeSelect('admin-orders-employee-list');
        if (list) {
            list.innerHTML = items.map(item => `
                <div class="item-card employee-status-card" style="border-left: 4px solid ${item.assigned_orders > 0 ? 'var(--primary-color)' : 'var(--border-color)'}; opacity: ${item.is_online ? 1 : 0.6}">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <strong style="font-size:1.1rem;">${item.name}</strong>
                            <p style="font-size:0.75rem; color:var(--text-secondary);">${item.is_online ? '🟢 Online' : '⚪ Offline'}</p>
                        </div>
                        <button onclick="openAssignModal(${item.user_id}, '${item.name}', ${item.is_online})" 
                                class="btn ${item.is_online ? 'btn-primary' : 'btn-disabled'}" 
                                style="width:auto; padding: 0.5rem 1rem; font-size: 0.75rem;"
                                ${item.is_online ? '' : 'disabled'}>+ Assign Order</button>
                    </div>
                    <div class="stat-grid" style="margin-top: 1rem; background: rgba(255,255,255,0.03); border-radius: 8px; padding: 0.5rem;">
                        <div style="text-align:center;"><p style="font-size:0.65rem; color:var(--text-secondary);">Active</p><p style="font-weight:700;">${item.assigned_orders}</p></div>
                        <div style="text-align:center;"><p style="font-size:0.65rem; color:var(--text-secondary);">Today</p><p style="font-weight:700;">${item.orders_completed}</p></div>
                    </div>
                </div>
            `).join('');
        }
    }
}

async function fetchAdminLeaves() {
    const res = await apiCall('/leave/all-pending');
    if (res.ok) {
        const items = await res.json();
        const list = safeSelect('admin-leave-list-container');
        if (list) {
            if (items.length === 0) {
                list.innerHTML = '<p style="text-align:center; padding:2rem; color:var(--text-secondary);">No pending leave requests.</p>';
            } else {
                list.innerHTML = items.map(item => `
                    <div class="item-card" style="border-left: 4px solid var(--accent-warning);">
                        <div style="display:flex; justify-content:space-between;">
                            <div>
                                <strong style="font-size: 1rem;">${item.user_name}</strong>
                                <p style="font-size: 0.75rem; color: var(--accent-warning);">Requested ${item.leave_type}</p>
                            </div>
                            <span class="badge badge-pending">Pending</span>
                        </div>
                        <div style="margin: 1rem 0; font-size: 0.85rem;">
                             <p>📅 <strong>${new Date(item.start_date).toLocaleDateString()} to ${new Date(item.end_date).toLocaleDateString()}</strong></p>
                             <p style="margin-top:0.4rem; opacity: 0.8;">"${item.reason}"</p>
                        </div>
                        <div style="display:flex; gap: 0.75rem;">
                            <button onclick="handleLeave(${item.id}, 'approved')" class="btn btn-success" style="flex:1; padding: 0.5rem; font-size: 0.8rem;">Approve</button>
                            <button onclick="handleLeave(${item.id}, 'rejected')" class="btn btn-danger" style="flex:1; padding: 0.5rem; font-size: 0.8rem;">Reject</button>
                        </div>
                    </div>
                `).join('');
            }
        }
        if (safeSelect('admin-leave-notif-count')) safeSelect('admin-leave-notif-count').textContent = `${items.length} Pending`;
    }
}

async function handleLeave(id, status) {
    if (!confirm(`Are you sure you want to ${status} this leave?`)) return;
    const res = await apiCall(`/leave/approve/${id}`, 'POST', { status });
    if (res.ok) {
        alert(`Leave ${status} successfully!`);
        fetchAdminLeaves();
        fetchAdminBadges();
    }
}

async function fetchAdminExpenses() {
    const res = await apiCall('/expense/all-pending');
    if (res.ok) {
        const items = await res.json();
        const list = safeSelect('admin-expense-list-container');
        if (list) {
            if (items.length === 0) {
                list.innerHTML = '<p style="text-align:center; padding:2rem; color:var(--text-secondary);">No pending expense claims.</p>';
            } else {
                list.innerHTML = items.map(item => `
                    <div class="item-card" style="border-left: 4px solid var(--accent-danger);">
                        <div style="display:flex; justify-content:space-between;">
                            <div>
                                <strong style="font-size: 1.1rem; color: var(--accent-success);">₹${item.amount}</strong>
                                <p style="font-size: 0.85rem; font-weight: 600;">${item.user_name}</p>
                            </div>
                            <span class="badge badge-pending">Claim</span>
                        </div>
                        <p style="margin: 0.75rem 0; font-size: 0.85rem; opacity: 0.9;">${item.description}</p>
                        <div style="display:flex; gap: 0.75rem; margin-top: 1rem;">
                            <button onclick="handleExpense(${item.id}, 'approved')" class="btn btn-success" style="flex:1; padding: 0.5rem; font-size: 0.8rem;">Approve Pay</button>
                            <button onclick="handleExpense(${item.id}, 'rejected')" class="btn btn-danger" style="flex:1; padding: 0.5rem; font-size: 0.8rem;">Reject</button>
                        </div>
                    </div>
                `).join('');
            }
        }
        if (safeSelect('admin-expense-notif-count')) safeSelect('admin-expense-notif-count').textContent = `${items.length} Pending`;
    }
}

async function handleExpense(id, status) {
    if (!confirm(`Are you sure you want to ${status} this expense?`)) return;
    const res = await apiCall(`/expense/approve/${id}`, 'POST', { status });
    if (res.ok) {
        alert(`Expense ${status} successfully!`);
        fetchAdminRequests();
        fetchAdminBadges();
    }
}

// Consolidated Requests Logic
async function fetchAdminRequests() {
    const res = await apiCall(currentRequestType === 'leaves' ? '/leave/all-pending' : '/expense/all-pending');
    if (res.ok) {
        const items = await res.json();
        const list = safeSelect('admin-requests-list-container');
        if (list) {
            if (items.length === 0) {
                list.innerHTML = `<p style="text-align:center; padding:2rem; color:var(--text-secondary);">No pending ${currentRequestType} requests.</p>`;
            } else {
                if (currentRequestType === 'leaves') {
                    list.innerHTML = items.map(item => `
                        <div class="item-card" style="border-left: 4px solid var(--accent-warning);">
                            <div style="display:flex; justify-content:space-between;">
                                <div>
                                    <strong style="font-size: 1rem;">${item.user_name}</strong>
                                    <p style="font-size: 0.75rem; color: var(--accent-warning);">Requested ${item.leave_type}</p>
                                </div>
                                <span class="badge badge-pending">Pending</span>
                            </div>
                            <div style="margin: 1rem 0; font-size: 0.85rem;">
                                 <p>📅 <strong>${new Date(item.start_date).toLocaleDateString()} to ${new Date(item.end_date).toLocaleDateString()}</strong></p>
                                 <p style="margin-top:0.4rem; opacity: 0.8;">"${item.reason}"</p>
                            </div>
                            <div style="display:flex; gap: 0.75rem;">
                                <button onclick="handleLeave(${item.id}, 'approved')" class="btn btn-success" style="flex:1; padding: 0.4rem; font-size: 0.75rem;">Approve</button>
                                <button onclick="handleLeave(${item.id}, 'rejected')" class="btn btn-danger" style="flex:1; padding: 0.4rem; font-size: 0.75rem;">Reject</button>
                            </div>
                        </div>
                    `).join('');
                } else {
                    list.innerHTML = items.map(item => `
                        <div class="item-card" style="border-left: 4px solid var(--accent-danger);">
                            <div style="display:flex; justify-content:space-between;">
                                <div>
                                    <strong style="font-size: 1.1rem; color: var(--accent-success);">₹${item.amount}</strong>
                                    <p style="font-size: 0.85rem; font-weight: 600;">${item.user_name}</p>
                                </div>
                                <span class="badge badge-pending">Claim</span>
                            </div>
                            <p style="margin: 0.75rem 0; font-size: 0.85rem; opacity: 0.9;">${item.description}</p>
                            <div style="display:flex; gap: 0.75rem;">
                                <button onclick="handleExpense(${item.id}, 'approved')" class="btn btn-success" style="flex:1; padding: 0.4rem; font-size: 0.75rem;">Approve Pay</button>
                                <button onclick="handleExpense(${item.id}, 'rejected')" class="btn btn-danger" style="flex:1; padding: 0.4rem; font-size: 0.75rem;">Reject</button>
                            </div>
                        </div>
                    `).join('');
                }
            }
        }
        fetchAdminBadges();
    }
}

// Employee Management Logic
async function fetchAdminEmployees() {
    const res = await apiCall('/admin/employee-details');
    if (res.ok) {
        const items = await res.json();
        const list = safeSelect('admin-employees-list');
        if (list) {
            list.innerHTML = items.map(item => `
                <div class="item-card" style="padding: 1rem;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div onclick="openEmployeeHistory(${item.user_id}, ${item.is_online})" style="cursor:pointer; flex: 1;">
                            <strong>${item.name}</strong>
                            <p style="font-size:0.7rem; color:var(--text-secondary);">${item.is_online ? '🟢 Online' : '⚪ Offline'}</p>
                        </div>
                        <button onclick="openEditEmployeeModal(${item.user_id}, '${item.name}', '${item.is_online}')" 
                                class="btn" style="width:auto; padding: 0.4rem 0.8rem; font-size: 0.7rem; background: var(--bg-secondary); color: var(--primary-color);">
                            Management
                        </button>
                    </div>
                </div>
            `).join('');
        }
    }
}

async function openEditEmployeeModal(userId, name, isOnline) {
    const res = await apiCall(`/admin/employee/${userId}/history`);
    if (res.ok) {
        const data = await res.json();
        const user = data.user;
        selectedUserId = userId;

        safeSelect('edit-emp-name').value = user.name;
        safeSelect('edit-emp-email').value = user.email;
        safeSelect('edit-emp-salary').value = user.salary;
        safeSelect('edit-emp-leave').value = user.leave_balance;

        safeSelect('edit-employee-modal').classList.remove('hidden');
    }
}

// Attach listeners for Edit Modal
const btnCancelEditEmp = safeSelect('btn-cancel-edit-emp');
if (btnCancelEditEmp) btnCancelEditEmp.addEventListener('click', () => {
    safeSelect('edit-employee-modal').classList.add('hidden');
});

const editForm = safeSelect('edit-employee-form');
if (editForm) editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = safeSelect('edit-emp-name').value;
    const email = safeSelect('edit-emp-email').value;
    const salary = safeSelect('edit-emp-salary').value;
    const leave_balance = safeSelect('edit-emp-leave').value;

    const res = await apiCall(`/admin/update-user/${selectedUserId}`, 'PUT', { name, email, salary, leave_balance });
    if (res.ok) {
        alert('Employee Updated Successfully!');
        safeSelect('edit-employee-modal').classList.add('hidden');
        fetchAdminEmployees();
    }
});

// Attach Request Filter listeners
const btnFilterL = safeSelect('btn-filter-leaves');
const btnFilterE = safeSelect('btn-filter-expenses');
if (btnFilterL && btnFilterE) {
    btnFilterL.addEventListener('click', () => {
        currentRequestType = 'leaves';
        btnFilterL.style.background = 'var(--primary-color)';
        btnFilterL.style.color = 'white';
        btnFilterE.style.background = 'none';
        btnFilterE.style.color = 'var(--text-secondary)';
        fetchAdminRequests();
    });
    btnFilterE.addEventListener('click', () => {
        currentRequestType = 'expenses';
        btnFilterE.style.background = 'var(--primary-color)';
        btnFilterE.style.color = 'white';
        btnFilterL.style.background = 'none';
        btnFilterL.style.color = 'var(--text-secondary)';
        fetchAdminRequests();
    });
}

// Notifications Logic
async function fetchNotifications() {
    const res = await apiCall('/notifications');
    if (res.ok) {
        const data = await res.json();

        // Admin View: Detailed List & Badge
        if (userData && userData.role === 'admin') {
            const unread = data.filter(n => !n.is_read);
            const read = data.filter(n => n.is_read);

            renderNotifications(unread, 'admin-notifications-list-main');
            renderNotifications(read, 'admin-notifications-history-list');
            fetchAdminBadges();
        }

        // Employee View: System-Level Push Notification
        else {
            if (data.length > 0) {
                const latest = data.filter(n => !n.is_read)[0];
                if (latest && latest.id > lastNotifId) {
                    if (Notification.permission === "granted") {
                        new Notification("Workforce Pro Alert", {
                            body: latest.message,
                            icon: "/app-icon.png"
                        });
                    }
                    lastNotifId = latest.id;
                    localStorage.setItem('lastNotifId', lastNotifId);
                }
            }
        }
    }
}

function renderNotifications(items, listId) {
    const list = safeSelect(listId);
    if (!list) return;

    if (items.length === 0) {
        list.innerHTML = '<p style="text-align:center; padding:1rem; color:var(--text-secondary); font-size:0.8rem;">No new alerts.</p>';
        return;
    }


    list.innerHTML = items.slice(0, 5).map(item => `
        <div class="notif-item ${item.is_read ? '' : 'unread'}">
            <p>${item.message}</p>
            <div class="time">${new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
    `).join('');
}


// Modals
function openAssignModal(id, name, isOnline) {
    if (isOnline === false) {
        alert(`${name} is currently offline and cannot be assigned new orders.`);
        return;
    }
    currentAssignUserId = id;
    const nameEl = safeSelect('assign-agent-name');
    if (nameEl) nameEl.textContent = `Assigning to: ${name}`;
    const modal = safeSelect('assign-modal');
    if (modal) modal.classList.remove('hidden');
}

const btnCancelAss = safeSelect('btn-cancel-assign');
if (btnCancelAss) btnCancelAss.addEventListener('click', () => {
    const modal = safeSelect('assign-modal');
    if (modal) modal.classList.add('hidden');
});

const assignF = safeSelect('assign-form');
if (assignF) assignF.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = safeSelect('assign-title').value;
    const address = safeSelect('assign-address').value;
    const res = await apiCall('/orders/assign', 'POST', { user_id: currentAssignUserId, title, address });
    if (res.ok) {
        alert('Order Assigned to Employee!');
        safeSelect('assign-modal').classList.add('hidden');
        assignF.reset();
        fetchAdminOrders();
        fetchAdminDash();
        fetchNotifications();
    } else {
        const data = await res.json();
        alert('Error assigning order: ' + (data.msg || 'Unknown error'));
    }


});

// Attendance Management (Restoring Missing Check-In Logic)

// 1. Camera Access
const btnShowCam = safeSelect('btn-show-camera');
const btnCancelCam = safeSelect('btn-cancel-camera');
const btnCaptureS = safeSelect('btn-capture-selfie');

if (btnShowCam) {
    btnShowCam.addEventListener('click', async () => {
        const modal = safeSelect('camera-modal');
        const video = safeSelect('camera-preview');
        if (!modal || !video) return;

        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
            video.srcObject = stream;
            modal.classList.remove('hidden');
        } catch (err) {
            console.error("Camera access failed", err);
            alert("Please allow camera access to check in.");
        }
    });
}

const stopStream = () => {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
};

if (btnCancelCam) {
    btnCancelCam.addEventListener('click', () => {
        stopStream();
        safeSelect('camera-modal').classList.add('hidden');
    });
}

// 2. Check-In Submission (Selfie + Geo)
if (btnCaptureS) {
    btnCaptureS.addEventListener('click', async () => {
        btnCaptureS.disabled = true;
        btnCaptureS.textContent = 'Processing...';

        try {
            // A. Capture Frame
            const video = safeSelect('camera-preview');
            const canvas = safeSelect('camera-canvas');
            if (!video || !canvas) throw new Error("UI elements missing");

            const context = canvas.getContext('2d');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const selfieUrl = canvas.toDataURL('image/jpeg');

            // B. Get Geolocation
            navigator.geolocation.getCurrentPosition(async (pos) => {
                const body = {
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    selfie_url: selfieUrl,
                    office_name: 'Main Office'
                };

                // C. Submit to API
                const res = await apiCall('/attendance/check-in', 'POST', body);
                if (res.ok) {
                    alert('Check-In Successful!');
                    stopStream();
                    safeSelect('camera-modal').classList.add('hidden');
                    fetchAttendanceData();
                } else {
                    const d = await res.json();
                    alert(d.msg || 'Check-In failed');
                }

                resetCaptureButton();
            }, (err) => {
                alert("Geolocation failed: " + err.message);
                resetCaptureButton();
            }, { enableHighAccuracy: true });

        } catch (err) {
            console.error("Check-in error", err);
            alert("Something went wrong");
            resetCaptureButton();
        }
    });
}

function resetCaptureButton() {
    if (btnCaptureS) {
        btnCaptureS.disabled = false;
        btnCaptureS.textContent = 'Take Photo & Check In';
    }
}

// 3. Check-Out
const btnCheckOut = safeSelect('btn-check-out');
if (btnCheckOut) {
    btnCheckOut.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to check out?')) return;

        const res = await apiCall('/attendance/check-out', 'POST');
        if (res.ok) {
            alert('Checked Out successfully!');
            fetchAttendanceData();
        }
    });
}


// Expense Claim Submission
const expenseF = safeSelect('expense-form');
if (expenseF) {
    expenseF.addEventListener('submit', async (e) => {
        e.preventDefault();
        const amount = safeSelect('expense-amount').value;
        const description = safeSelect('expense-desc').value;

        const body = { amount: parseFloat(amount), description };

        const res = await apiCall('/expense/submit', 'POST', body);
        if (res.ok) {
            alert('Expense claim submitted successfully!');
            expenseF.reset();
            fetchExpenseData(); // Refresh history
        } else {
            const data = await res.json();
            alert('Error submitting claim: ' + (data.msg || 'Unknown error'));
        }
    });
}

// User Management
// User Management Main Form
const addUserFMain = safeSelect('add-user-form-main');
if (addUserFMain) {
    addUserFMain.addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = {
            name: safeSelect('add-user-name-main').value,
            email: safeSelect('add-user-email-main').value,
            password: safeSelect('add-user-password-main').value,
            salary: safeSelect('add-user-salary-main').value || 30000
        };
        const res = await apiCall('/admin/create-user', 'POST', body);
        if (res.ok) {
            alert('Employee account created successfully!');
            addUserFMain.reset();
            fetchAdminDash();
        } else {
            const data = await res.json();
            alert(data.msg || 'Creation failed');
        }
    });
}

// Employee History Modal Logic
async function openEmployeeHistory(userId, isOnline) {
    const res = await apiCall(`/admin/employee/${userId}/history`);
    if (res.ok) {
        const data = await res.json();
        selectedUserId = userId; // for use in modal buttons
        isSelectedUserOnline = isOnline; // track for assignment check

        safeSelect('hist-emp-name').textContent = data.user.name;
        safeSelect('hist-emp-joined').textContent = `Joined: ${new Date(data.user.created_at).toLocaleDateString()}`;

        // Reconstruct Timeline
        const timeline = [];
        data.attendances.forEach(a => timeline.push({ type: 'attendance', date: a.check_in, data: a }));
        data.orders.forEach(o => timeline.push({ type: 'order', date: o.created_at, data: o }));
        data.leaves.forEach(l => timeline.push({ type: 'leave', date: l.created_at, data: l }));
        data.breaks.forEach(b => timeline.push({ type: 'break', date: b.start_time, data: b }));

        timeline.sort((a, b) => new Date(b.date) - new Date(a.date));

        const list = safeSelect('hist-timeline-list');
        if (list) {
            if (timeline.length === 0) {
                list.innerHTML = '<p style="text-align:center; padding:1rem; color:var(--text-secondary);">No activity recorded yet.</p>';
            } else {
                list.innerHTML = timeline.map(item => {
                    let icon = '📝';
                    let title = item.type.toUpperCase();
                    let desc = '';

                    if (item.type === 'attendance') {
                        icon = '🕒';
                        title = 'Attendance';
                        desc = item.data.check_out ? `Worked from ${new Date(item.data.check_in).toLocaleTimeString()} to ${new Date(item.data.check_out).toLocaleTimeString()}` : `Checked in at ${new Date(item.data.check_in).toLocaleTimeString()}`;
                    } else if (item.type === 'order') {
                        icon = '📦';
                        title = `Order: ${item.data.title}`;
                        desc = `Status: ${item.data.status.replace(/_/g, ' ')}`;
                    } else if (item.type === 'leave') {
                        icon = '📅';
                        title = `Leave: ${item.data.leave_type}`;
                        desc = `${item.data.status} - "${item.data.reason}"`;
                    } else if (item.type === 'break') {
                        icon = '☕';
                        title = 'Break';
                        desc = `${item.data.break_type} started at ${new Date(item.data.start_time).toLocaleTimeString()}`;
                    }

                    return `
                        <div class="history-item" style="display:flex; gap:1rem; align-items:start; padding:1rem; background:rgba(255,255,255,0.02); border-radius:12px; border:1px solid var(--border-color);">
                            <div style="font-size:1.5rem;">${icon}</div>
                            <div>
                                <strong style="font-size:0.9rem;">${title}</strong>
                                <p style="font-size:0.8rem; margin-top:0.25rem; opacity:0.8;">${desc}</p>
                                <p style="font-size:0.7rem; color:var(--text-secondary); margin-top:0.25rem;">${new Date(item.date).toLocaleString()}</p>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        safeSelect('employee-details-modal').classList.remove('hidden');
    }
}

// Modal Button Handlers
const btnCloseHist = safeSelect('btn-close-hist-modal');
if (btnCloseHist) btnCloseHist.addEventListener('click', () => safeSelect('employee-details-modal').classList.add('hidden'));

const btnHistAssign = safeSelect('btn-hist-assign');
if (btnHistAssign) btnHistAssign.addEventListener('click', () => {
    safeSelect('employee-details-modal').classList.add('hidden');
    openAssignModal(selectedUserId, safeSelect('hist-emp-name').textContent, isSelectedUserOnline);
});

const btnHistRemove = safeSelect('btn-hist-remove');
if (btnHistRemove) btnHistRemove.addEventListener('click', async () => {
    if (!confirm('CRITICAL: Are you sure you want to PERMANENTLY remove this employee and all their data?')) return;
    const res = await apiCall(`/admin/remove-user/${selectedUserId}`, 'DELETE');
    if (res.ok) {
        alert('Employee removed successfully.');
        safeSelect('employee-details-modal').classList.add('hidden');
        fetchAdminDash();
    } else {
        const d = await res.json();
        alert(d.msg || 'Removal failed');
    }
});

// Auth form
const loginF = safeSelect('login-form');
if (loginF) loginF.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    if (res.ok) {
        const d = await res.json();
        authToken = d.access_token;
        userData = d.user;
        localStorage.setItem('authToken', authToken);
        localStorage.setItem('userData', JSON.stringify(userData));
        showApp();
    } else {
        const err = await res.json();
        const errDiv = safeSelect('login-error');
        if (errDiv) {
            errDiv.textContent = err.msg;
            errDiv.classList.remove('hidden');
        }
    }
});

// Sign Out Logic for Admin Settings
const btnLogoutAdminS = safeSelect('btn-logout-admin-settings');
if (btnLogoutAdminS) {
    btnLogoutAdminS.addEventListener('click', () => {
        if (confirm('Are you sure you want to sign out?')) {
            localStorage.removeItem('authToken');
            localStorage.removeItem('userData');
            window.location.reload();
        }
    });
}

// Mark All Read Logic
const btnMarkRead = safeSelect('btn-mark-all-read');
if (btnMarkRead) {
    btnMarkRead.addEventListener('click', async () => {
        const res = await apiCall('/notifications/mark-read', 'POST');
        if (res.ok) {
            fetchNotifications();
            alert('All notifications marked as read.');
        }
    });
}

// Clock
setInterval(() => {
    const timeEl = safeSelect('current-time');
    if (timeEl) timeEl.textContent = new Date().toLocaleTimeString([], { hour12: false });
}, 1000);

// Set Globals
window.openAssignModal = openAssignModal;
window.handleLeave = handleLeave;
window.handleExpense = handleExpense;
window.fetchAdminDash = fetchAdminDash;
window.fetchAdminOrders = fetchAdminOrders;
window.openEmployeeHistory = openEmployeeHistory;
window.toggleTheme = toggleTheme;

// Initial Theme Check
initTheme();

console.log("Workforce Pro App v2.2 Loaded");

// Initial Navigation - Moved to end to avoid TDZ errors
if (authToken && userData) {
    showApp();
    // Start Polling for Notifications
    setInterval(fetchNotifications, 15000); // Every 15 seconds
}



