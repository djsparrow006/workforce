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
let selectedOrderId = null; // for employee delivery
let targetCoords = { lat: 0, lng: 0 };



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
            fetchAttendanceData();
            fetchNotifications();
            fetchActiveOrders();
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
        // Also hide employee actions
        ['check-in-section', 'check-out-section'].forEach(id => {
            const el = safeSelect(id);
            if (el) el.classList.add('hidden');
        });
        switchScreen('admin');
    } else {

        const navAdmin = safeSelect('nav-admin');
        if (navAdmin) navAdmin.classList.add('hidden');
        ['nav-expense', 'nav-leave', 'nav-salary'].forEach(id => {
            const el = safeSelect(id);
            if (el) el.classList.remove('hidden');
        });
        requestNotificationPermission(); // Ask employee for mobile notifications
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

// Class-based logout for all header buttons
document.addEventListener('click', (e) => {
    if (e.target.closest('.btn-logout-header')) {
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

    list.innerHTML = orders.map(order => `
        <div class="active-order-card ${selectedOrderId === order.id ? 'selected' : ''}" onclick="selectOrder(${order.id}, ${order.customer_lat}, ${order.customer_long})">
            <div class="order-header">
                <strong>${order.title}</strong>
                <span class="badge badge-pending">${selectedOrderId === order.id ? 'Selected' : 'Pending'}</span>
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
                <strong>${item.check_in ? new Date(item.check_in).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--:--'}</strong>
                <p>${item.check_out ? new Date(item.check_out).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--:--'}</p>
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
    const analytics = await apiCall('/admin/employee-details');
    if (analytics.ok) {
        const items = await analytics.json();
        const list = safeSelect('admin-employee-stats-list');
        if (list) {
            list.innerHTML = items.map(item => {
                const onlineStatus = item.is_online ? '<span class="status-dot online"></span>' : '<span class="status-dot offline"></span>';
                return `
                    <div class="item-card employee-status-card">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div>${onlineStatus} <strong>${item.name}</strong></div>
                            <button onclick="openAssignModal(${item.user_id}, '${item.name}')" class="badge badge-pending">+ Assign</button>
                        </div>
                        <div class="stat-grid" style="margin-top:0.5rem">
                            <div class="stat-item"><p>Completed</p><p>${item.orders_completed}</p></div>
                            <div class="stat-item"><p>Active</p><p style="color:var(--primary-color)">${item.assigned_orders || 0}</p></div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
    // ...
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
            <div class="time">${new Date(item.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
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
    if (timeEl) timeEl.textContent = new Date().toLocaleTimeString([], {hour12: false});
}, 1000);

// Set Globals
window.openAssignModal = openAssignModal;

console.log("Workforce Pro App v2.1 Loaded");

// Initial Navigation - Moved to end to avoid TDZ errors
if (authToken && userData) {
    showApp();
    // Start Polling for Notifications
    setInterval(fetchNotifications, 15000); // Every 15 seconds
}



