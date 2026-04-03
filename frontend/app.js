const BASE_URL = (window.location.protocol === 'capacitor:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? (window.location.protocol === 'capacitor:' ? 'http://localhost:5000/api' : '/api')
    : '/api';

let authToken = localStorage.getItem('authToken');
let userData = null;
try {
    userData = JSON.parse(localStorage.getItem('userData'));
} catch (e) {
    // Silent fail if no data
}

let currentAssignUserId = null;
let deliveryMap = null;
let deliveryMarker = null;
let selectedUserId = null; // for admin assignment popup
let selectedOrderId = null; // for employee delivery
let targetCoords = { lat: 0, lng: 0 };

// Break & Order Workflow State
let currentOrderId = null;
let currentOrderStatus = null;  // 'assigned', 'arrived_at_store', 'picked_up', 'delivered'
let isOnBreak = false;
let activeBreakStartTime = null;
let breakType = null;



// Helper to safely select elements
function safeSelect(id) {
    const el = document.getElementById(id);
    if (!el) {
    }
    return el;
}





// Screen Map
const screens = {
    home: 'home-screen',
    leave: 'leave-screen',
    expense: 'expense-screen',
    salary: 'salary-screen',
    admin: 'admin-screen'
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
            if (userData && userData.role === 'admin') {
                fetchAdminData();
            } else {
                fetchAttendanceData();
                fetchActiveOrders();
            }
            fetchNotifications();
        }

        else if (screenKey === 'leave') fetchLeaveData();
        else if (screenKey === 'expense') fetchExpenseData();
        else if (screenKey === 'salary') fetchSalaryData();
        else if (screenKey === 'admin') {
            fetchAdminData();
            fetchNotifications();
        }
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

    if (userData && userData.role === 'admin') {

        const navAdmin = safeSelect('nav-admin');
        if (navAdmin) navAdmin.classList.remove('hidden');
        ['nav-expense', 'nav-leave', 'nav-salary'].forEach(id => {
            const el = safeSelect(id);
            if (el) el.classList.add('hidden');
        });

        // Admin Home vs Employee Home
        const empHome = safeSelect('emp-home-content');
        const adminHome = safeSelect('admin-home-content');
        if (empHome) empHome.classList.add('hidden');
        if (adminHome) adminHome.classList.remove('hidden');

        switchScreen('home');
    } else {

        const navAdmin = safeSelect('nav-admin');
        if (navAdmin) navAdmin.classList.add('hidden');
        ['nav-expense', 'nav-leave', 'nav-salary'].forEach(id => {
            const el = safeSelect(id);
            if (el) el.classList.remove('hidden');
        });

        // Admin Home vs Employee Home
        const empHome = safeSelect('emp-home-content');
        const adminHome = safeSelect('admin-home-content');
        if (empHome) empHome.classList.remove('hidden');
        if (adminHome) adminHome.classList.add('hidden');

        requestNotificationPermission(); // Ask employee for mobile notifications
        // Initialize break UI for employees only
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


const btnT = safeSelect('btn-toggle-settings');
if (btnT) {
    btnT.addEventListener('click', () => {
        const cont = safeSelect('settings-container');
        if (cont) {
            cont.classList.toggle('hidden');
            btnT.textContent = cont.classList.contains('hidden') ? 'Show Settings' : 'Hide Settings';
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
    let html = `
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
    // Map Loaded
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
async function fetchAdminData() {
    // We stick to /admin/employee-details for now as it contains necessary stats.
    const resEmp = await apiCall('/admin/employee-details');
    if (resEmp.ok) {
        const items = await resEmp.json();

        // Update Stats (Active Now, Orders Today)
        const activeCount = items.filter(i => i.is_online).length;
        const totalOrdersToday = items.reduce((sum, i) => sum + (i.orders_completed || 0), 0);

        const activeEl = safeSelect('admin-home-active-count');
        const totalEl = safeSelect('admin-home-total-orders');
        if (activeEl) activeEl.textContent = activeCount;
        if (totalEl) totalEl.textContent = totalOrdersToday;

        const list = safeSelect('admin-home-employee-list');
        if (list) {
            // Group by online status
            const sortedItems = items.sort((a, b) => (b.is_online === a.is_online) ? 0 : b.is_online ? 1 : -1);

            list.innerHTML = sortedItems.map(item => {
                const onlineStatus = item.is_online ? '<span class="status-dot online"></span>' : '<span class="status-dot offline"></span>';
                const statusText = item.is_online ? '<span style="color:#22c55e; font-size: 0.75rem;">Online</span>' : '<span style="color:#ef4444; font-size: 0.75rem;">Offline</span>';

                return `
                    <div class="item-card employee-status-card" style="cursor: pointer; border-left: 4px solid ${item.is_online ? '#22c55e' : '#ef4444'};" onclick="viewEmployeeHistory(${item.user_id}, '${item.name}')">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div>${onlineStatus} <strong>${item.name}</strong> <span style="margin-left:0.5rem;">${statusText}</span></div>
                            <button onclick="event.stopPropagation(); openAssignModal(${item.user_id}, '${item.name}')" class="badge badge-pending">+ Assign Order</button>
                        </div>
                        <div class="stat-grid" style="margin-top:0.5rem">
                            <div class="stat-item"><p>Completed</p><p>${item.orders_completed || 0}</p></div>
                            <div class="stat-item"><p>Active</p><p style="color:var(--primary-color)">${item.assigned_orders || 0}</p></div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        const updateTimeEl = safeSelect('last-update-time');
        if (updateTimeEl) updateTimeEl.textContent = 'Updated at ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // Fetch Pending Leaves for Admin
    const leavesRes = await apiCall('/leave/all-pending');
    if (leavesRes.ok) {
        const leaves = await leavesRes.json();

        const badge = safeSelect('admin-leave-badge');
        if (badge) {
            badge.textContent = leaves.length;
            badge.classList.toggle('hidden', leaves.length === 0);
        }

        const list = safeSelect('admin-leave-approval-list');
        if (list) {
            if (leaves.length === 0) {
                list.innerHTML = '<p class="text-center" style="font-size:0.8rem; color:var(--text-secondary);">No pending leaves</p>';
            } else {
                list.innerHTML = leaves.map(val => `
                    <div class="item-card">
                        <div style="display:flex; justify-content:space-between;">
                            <strong>${val.user_name}</strong>
                            <span class="badge badge-pending">${val.leave_type}</span>
                        </div>
                        <p style="font-size:0.8rem; margin:0.4rem 0;">${new Date(val.start_date).toLocaleDateString()} to ${new Date(val.end_date).toLocaleDateString()}</p>
                        <p style="font-size:0.75rem; color:var(--text-secondary); margin-bottom: 0.5rem;">${val.reason}</p>
                        <div style="display:flex; gap: 0.5rem;">
                            <button onclick="approveLeave(${val.id}, 'approved')" class="btn btn-success" style="flex:1; padding:0.4rem; font-size:0.75rem;">Approve</button>
                            <button onclick="approveLeave(${val.id}, 'rejected')" class="btn btn-danger" style="flex:1; padding:0.4rem; font-size:0.75rem;">Reject</button>
                        </div>
                    </div>
                `).join('');
            }
        }
    }

    // Fetch Pending Expenses for Admin
    const expensesRes = await apiCall('/expense/all-pending');
    if (expensesRes.ok) {
        const expenses = await expensesRes.json();

        const badge = safeSelect('admin-expense-badge');
        if (badge) {
            badge.textContent = expenses.length;
            badge.classList.toggle('hidden', expenses.length === 0);
        }

        const list = safeSelect('admin-expense-list');
        if (list) {
            if (expenses.length === 0) {
                list.innerHTML = '<p class="text-center" style="font-size:0.8rem; color:var(--text-secondary);">No pending expenses</p>';
            } else {
                list.innerHTML = expenses.map(val => `
                    <div class="item-card">
                        <div style="display:flex; justify-content:space-between;">
                            <strong>${val.user_name}</strong>
                            <strong>₹${val.amount}</strong>
                        </div>
                        <p style="font-size:0.8rem; margin:0.4rem 0;">${val.description}</p>
                        <div style="display:flex; gap: 0.5rem;">
                            <button onclick="approveExpense(${val.id}, 'approved')" class="btn btn-success" style="flex:1; padding:0.4rem; font-size:0.75rem;">Approve</button>
                            <button onclick="approveExpense(${val.id}, 'rejected')" class="btn btn-danger" style="flex:1; padding:0.4rem; font-size:0.75rem;">Reject</button>
                        </div>
                    </div>
                `).join('');
            }
        }
    }
}

// Global variable for tracking the modal's employee ID
let currentHistUserId = null;

async function approveLeave(id, status) {
    if (!confirm(`Are you sure you want to ${status} this leave?`)) return;
    const res = await apiCall(`/leave/approve/${id}`, 'POST', { status });
    if (res.ok) {
        alert(`Leave ${status} successfully.`);
        fetchAdminData();
    } else {
        alert('Failed to update leave request.');
    }
}

async function approveExpense(id, status) {
    if (!confirm(`Are you sure you want to ${status} this expense?`)) return;
    const res = await apiCall(`/expense/approve/${id}`, 'POST', { status });
    if (res.ok) {
        alert(`Expense ${status} successfully.`);
        fetchAdminData();
    } else {
        alert('Failed to update expense claim.');
    }
}

async function viewEmployeeHistory(id, name) {
    currentHistUserId = id;
    const res = await apiCall(`/admin/employee/${id}/history`);
    if (res.ok) {
        const data = await res.json();
        const modal = safeSelect('employee-details-modal');
        const nameEl = safeSelect('hist-emp-name');
        const joinedEl = safeSelect('hist-emp-joined');
        const timeline = safeSelect('hist-timeline-list');

        nameEl.textContent = name;
        joinedEl.textContent = `Joined: ${new Date(data.user.created_at).toLocaleDateString()}`;

        // Build timeline
        let events = [];

        data.attendances.forEach(a => {
            events.push({ time: new Date(a.check_in), label: 'Checked In', type: 'attendance', detail: a.office_name });
            if (a.check_out) events.push({ time: new Date(a.check_out), label: 'Checked Out', type: 'attendance', detail: '' });
        });

        data.breaks.forEach(b => {
            events.push({ time: new Date(b.start_time), label: `Started Break (${b.break_type})`, type: 'break', detail: '' });
            if (b.end_time) events.push({ time: new Date(b.end_time), label: `Ended Break`, type: 'break', detail: `${b.duration_minutes} min` });
        });

        data.orders.forEach(o => {
            if (o.assigned_at) events.push({ time: new Date(o.assigned_at), label: 'Order Assigned', type: 'order', detail: o.title });
            if (o.completed_at) events.push({ time: new Date(o.completed_at), label: 'Order Delivered', type: 'order', detail: `Dist: ${o.distance_km}km` });
        });

        // Sort descending
        events.sort((a, b) => b.time - a.time);

        if (events.length === 0) {
            timeline.innerHTML = '<p style="text-align:center; font-size:0.8rem; color:var(--text-secondary);">No activity found</p>';
        } else {
            timeline.innerHTML = events.map(e => `
                <div style="padding-left: 1rem; border-left: 2px solid var(--border-color); position: relative;">
                    <div style="position: absolute; left: -5px; top: 0; width: 8px; height: 8px; border-radius: 50%; background: var(--primary-color);"></div>
                    <p style="margin: 0; font-size: 0.75rem; color: var(--text-secondary);">${e.time.toLocaleDateString()} ${e.time.toLocaleTimeString()}</p>
                    <p style="margin: 0.2rem 0; font-weight: 500;">${e.label}</p>
                    <p style="margin: 0; font-size: 0.8rem; color: var(--text-secondary);">${e.detail}</p>
                </div>
            `).join('');
        }

        modal.classList.remove('hidden');
    } else {
        alert("Failed to load employee history.");
    }
}

const btnCloseHist = safeSelect('btn-close-hist-modal');
if (btnCloseHist) {
    btnCloseHist.addEventListener('click', () => {
        safeSelect('employee-details-modal').classList.add('hidden');
    });
}

const btnHistAssign = safeSelect('btn-hist-assign');
if (btnHistAssign) {
    btnHistAssign.addEventListener('click', () => {
        safeSelect('employee-details-modal').classList.add('hidden');
        openAssignModal(currentHistUserId, safeSelect('hist-emp-name').textContent);
    });
}

const btnHistRemove = safeSelect('btn-hist-remove');
if (btnHistRemove) {
    btnHistRemove.addEventListener('click', async () => {
        if (!confirm("Are you absolutely sure you want to remove this employee? This action cannot be undone.")) return;

        const res = await apiCall(`/admin/remove-user/${currentHistUserId}`, 'DELETE');
        if (res.ok) {
            alert('Employee removed permanently.');
            safeSelect('employee-details-modal').classList.add('hidden');
            fetchAdminData();
        } else {
            const d = await res.json();
            alert(d.msg || 'Removal failed');
        }
    });
}


// Notifications Logic
async function fetchNotifications() {
    const res = await apiCall('/notifications');
    if (res.ok) {
        const data = await res.json();

        // Admin View: Detailed List & Badge
        if (userData && userData.role === 'admin') {
            renderNotifications(data, 'notifications-list-admin');
            const badge = safeSelect('admin-notif-badge');
            if (badge) {
                badge.textContent = data.length;
                badge.classList.toggle('hidden', data.length === 0);
            }
        }

        // Employee View: System-Level Push Notification
        else {
            if (data.length > 0) {
                const latest = data[0];
                if (latest.id > lastNotifId) {
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
function openAssignModal(id, name) {
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
        fetchAdminData();
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


// Leave Submission Logic
const leaveF = safeSelect('leave-form');
if (leaveF) {
    leaveF.addEventListener('submit', async (e) => {
        e.preventDefault();
        const leave_type = safeSelect('leave-type').value;
        const start_date = safeSelect('leave-start').value;
        const end_date = safeSelect('leave-end').value;
        const reason = safeSelect('leave-reason').value;

        const body = { leave_type, start_date, end_date, reason };
        const res = await apiCall('/leave/apply', 'POST', body);

        if (res.ok) {
            alert('Leave application submitted successfully!');
            leaveF.reset();
            fetchLeaveData(); // Refresh history
        } else {
            const data = await res.json();
            alert('Error submitting leave: ' + (data.msg || 'Unknown error'));
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
const addUserF = safeSelect('add-user-form');
if (addUserF) {
    addUserF.addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = {
            name: safeSelect('add-user-name').value,
            email: safeSelect('add-user-email').value,
            password: safeSelect('add-user-password').value,
            salary: safeSelect('add-user-salary').value || 30000
        };
        const res = await apiCall('/admin/create-user', 'POST', body);
        if (res.ok) {
            alert('Employee account created successfully!');
            addUserF.reset();
            fetchAdminData();
        } else {
            const data = await res.json();
            alert(data.msg || 'Creation failed');
        }
    });
}

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

// Clock
setInterval(() => {
    const timeEl = safeSelect('current-time');
    if (timeEl) timeEl.textContent = new Date().toLocaleTimeString([], { hour12: false });
}, 1000);

// Set Globals
window.openAssignModal = openAssignModal;

// Workforce Pro App Ready

// Initial Navigation - Moved to end to avoid TDZ errors
if (authToken && userData) {
    showApp();
    // Fast Polling for Data Sync
    setInterval(() => {
        fetchNotifications();
        if (userData && userData.role === 'admin') {
            const adminScreen = safeSelect('admin-screen');
            if (adminScreen && !adminScreen.classList.contains('hidden')) {
                fetchAdminData(); // Keep admin dashboard actively synced
            }
        } else {
            const homeScreen = safeSelect('home-screen');
            if (homeScreen && !homeScreen.classList.contains('hidden')) {
                fetchActiveOrders(); // Keep employee workspace actively synced
            }

            // Poll active extraneous screens for dynamic approval updates
            const leaveScreen = safeSelect('leave-screen');
            if (leaveScreen && !leaveScreen.classList.contains('hidden')) {
                fetchLeaveData();
            }

            const expenseScreen = safeSelect('expense-screen');
            if (expenseScreen && !expenseScreen.classList.contains('hidden')) {
                fetchExpenseData();
            }
        }
    }, 5000); // Poll every 5 seconds for responsive sync
}



