const BASE_URL = (window.location.hostname.includes('192.168.1.4') || window.location.protocol === 'capacitor:') 
    ? 'http://192.168.1.4:5000/api' 
    : '/api';
let authToken = localStorage.getItem('authToken');
let userData = JSON.parse(localStorage.getItem('userData'));
let stream = null;
let currentProofPhoto = null;

// UI Elements
const authScreen = document.getElementById('auth-screen');
const navBar = document.getElementById('nav-bar');
const screens = {
    home: document.getElementById('home-screen'),
    leave: document.getElementById('leave-screen'),
    expense: document.getElementById('expense-screen'),
    salary: document.getElementById('salary-screen'),
    admin: document.getElementById('admin-screen')
};

const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const userNameDisplay = document.getElementById('user-name');
const statusBadge = document.getElementById('attendance-status-badge');
const btnShowCamera = document.getElementById('btn-show-camera');
const btnCheckOut = document.getElementById('btn-check-out');
const btnCompleteOrder = document.getElementById('btn-complete-order');
const ordersDisplay = document.getElementById('total-orders-display');
const checkInSection = document.getElementById('check-in-section');
const checkOutSection = document.getElementById('check-out-section');
const cameraModal = document.getElementById('camera-modal');
const video = document.getElementById('camera-preview');
const canvas = document.getElementById('camera-canvas');
const btnCaptureSelfie = document.getElementById('btn-capture-selfie');
const btnCancelCamera = document.getElementById('btn-cancel-camera');

// Admin Elements
const btnAdminLogout = document.getElementById('btn-admin-logout');
const btnToggleSettings = document.getElementById('btn-toggle-settings');
const settingsContainer = document.getElementById('settings-container');
const assignModal = document.getElementById('assign-modal');
const assignForm = document.getElementById('assign-form');
const assignAgentName = document.getElementById('assign-agent-name');
const btnCancelAssign = document.getElementById('btn-cancel-assign');
let currentAssignUserId = null;

// Leave & Expense
const leaveForm = document.getElementById('leave-form');
const leaveBalanceDisplay = document.getElementById('leave-balance-display');
const leaveHistoryList = document.getElementById('leave-history-list');
const expenseForm = document.getElementById('expense-form');
const expenseHistoryList = document.getElementById('expense-history-list');
const btnCaptureProof = document.getElementById('btn-capture-proof');
const proofPreview = document.getElementById('expense-proof-preview');
const proofContainer = document.getElementById('proof-container');

// Initial Setup
if (authToken && userData) {
    showApp();
}

// Tab Navigation
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        const screenKey = item.dataset.screen;
        switchScreen(screenKey);
    });
});

function switchScreen(screenKey) {
    Object.keys(screens).forEach(key => {
        screens[key].classList.add('hidden');
        document.querySelector(`[data-screen="${key}"]`).classList.remove('active');
    });
    screens[screenKey].classList.remove('hidden');
    document.querySelector(`[data-screen="${screenKey}"]`).classList.add('active');
    
    // Auto-fetch data for the screen
    if (screenKey === 'leave') fetchLeaveData();
    if (screenKey === 'expense') fetchExpenseData();
    if (screenKey === 'salary') fetchSalaryData();
    if (screenKey === 'home') fetchAttendanceData();
    if (screenKey === 'admin') fetchAdminData();
}

// Clock logic
setInterval(() => {
    const timeDisplay = document.getElementById('current-time');
    const dateDisplay = document.getElementById('current-date');
    if (timeDisplay) {
        const now = new Date();
        timeDisplay.textContent = now.toLocaleTimeString([], { hour12: false });
        dateDisplay.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    }
}, 1000);

// App Flow
function showApp() {
    authScreen.classList.add('hidden');
    navBar.classList.remove('hidden');
    userNameDisplay.textContent = userData.name;
    
    // Role-based visibility
    if (userData.role === 'admin') {
        document.getElementById('nav-admin').classList.remove('hidden');
        document.getElementById('nav-expense').classList.add('hidden');
        document.getElementById('nav-leave').classList.add('hidden');
        document.getElementById('nav-salary').classList.add('hidden');
        // Hide Employee action buttons for Admin
        checkInSection.classList.add('hidden');
        checkOutSection.classList.add('hidden');
        switchScreen('admin');
    } else {
        document.getElementById('nav-admin').classList.add('hidden');
        document.getElementById('nav-expense').classList.remove('hidden');
        document.getElementById('nav-leave').classList.remove('hidden');
        document.getElementById('nav-salary').classList.remove('hidden');
        switchScreen('home');
    }
}

function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
    authToken = null;
    userData = null;
    window.location.reload();
}

if (btnLogout) btnLogout.addEventListener('click', logout);
if (btnAdminLogout) btnAdminLogout.addEventListener('click', logout);

if (btnToggleSettings) {
    btnToggleSettings.addEventListener('click', () => {
        settingsContainer.classList.toggle('hidden');
        btnToggleSettings.textContent = settingsContainer.classList.contains('hidden') ? 'Show Settings' : 'Hide Settings';
    });
}

// --- Camera Logic ---
async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        video.srcObject = stream;
        cameraModal.classList.remove('hidden');
    } catch (err) {
        alert('Camera access denied or not available.');
        console.error(err);
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        cameraModal.classList.add('hidden');
    }
}

btnShowCamera.addEventListener('click', startCamera);
btnCancelCamera.addEventListener('click', stopCamera);

btnCaptureSelfie.addEventListener('click', async () => {
    // Capture from video to canvas
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const selfieBase64 = canvas.toDataURL('image/jpeg', 0.7);
    
    stopCamera();
    performCheckIn(selfieBase64);
});

// --- API Functions ---
async function apiCall(endpoint, method = 'GET', body = null) {
    const headers = { 'Authorization': `Bearer ${authToken}` };
    if (body) headers['Content-Type'] = 'application/json';
    
    const response = await fetch(`${BASE_URL}${endpoint}`, {
        method, headers,
        body: body ? JSON.stringify(body) : null
    });
    
    if (response.status === 401) logout();
    return response;
}

async function performCheckIn(selfie) {
    let location = { latitude: null, longitude: null };
    try {
        const pos = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject);
        });
        location.latitude = pos.coords.latitude;
        location.longitude = pos.coords.longitude;
    } catch (e) {
        console.warn('GPS failed', e);
    }

    const response = await apiCall('/attendance/check-in', 'POST', {
        ...location,
        selfie_url: selfie
    });
    
    const data = await response.json();
    if (response.ok) {
        setAttendanceUI(true);
        fetchAttendanceData();
    } else {
        alert(data.msg || 'Check-in failed');
    }
}

async function performCheckOut() {
    const response = await apiCall('/attendance/check-out', 'POST');
    if (response.status === 200) {
        setAttendanceUI(false);
        fetchAttendanceData();
    }
}

async function performOrderComplete() {
    let location = { latitude: null, longitude: null };
    try {
        const pos = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject);
        });
        location.latitude = pos.coords.latitude;
        location.longitude = pos.coords.longitude;
    } catch (e) {}

    const settingsRes = await apiCall('/admin/settings');
    let custLat = 14.6000;
    let custLong = 78.0010;
    if (settingsRes.ok) {
        const s = await settingsRes.json();
        custLat = parseFloat(s.customer_lat || s.office_lat); 
        custLong = parseFloat(s.customer_long || s.office_long);
    }

    const res = await apiCall('/orders/complete', 'POST', {
        latitude: location.latitude,
        longitude: location.longitude,
        customer_lat: custLat,
        customer_long: custLong
    });
    
    if (res.ok) {
        const data = await res.json();
        alert(`Order Delivered! Distance: ${data.distance}KM`);
        fetchAttendanceData(); // Refresh counts
    } else {
        const err = await res.json();
        alert(err.msg || 'Delivery failed');
    }
}

btnCheckOut.addEventListener('click', performCheckOut);
btnCompleteOrder.addEventListener('click', performOrderComplete);

function setAttendanceUI(isCheckedIn) {
    if (isCheckedIn) {
        statusBadge.textContent = 'Checked In';
        statusBadge.className = 'status-badge status-online';
        checkInSection.classList.add('hidden');
        checkOutSection.classList.remove('hidden');
    } else {
        statusBadge.textContent = 'Checked Out';
        statusBadge.className = 'status-badge status-offline';
        checkInSection.classList.remove('hidden');
        checkOutSection.classList.add('hidden');
    }
}

// --- Attendance Data ---
async function fetchAttendanceData() {
    const response = await apiCall('/attendance/history');
    if (response.ok) {
        const data = await response.json();
        const latest = data[0];
        setAttendanceUI(latest && latest.check_in && !latest.check_out);
        renderAttendanceList(data);
    }
    
    // Fetch today's orders
    const orderRes = await apiCall('/orders/stats');
    if (orderRes.ok) {
        const orderData = await orderRes.json();
        ordersDisplay.textContent = `Orders Completed: ${orderData.completed_orders}`;
    }
}

function renderAttendanceList(items) {
    const list = document.getElementById('attendance-history-list');
    list.innerHTML = items.map(item => `
        <div class="history-item">
            <div class="history-details">
                <p>${new Date(item.check_in).toLocaleDateString()}</p>
                <p>Status: ${item.status || 'Verified'}</p>
            </div>
            <div style="text-align: right;">
                <p style="font-weight: 600; color: var(--accent-success);">${new Date(item.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                <p style="color: var(--text-secondary);">${item.check_out ? new Date(item.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</p>
            </div>
        </div>
    `).join('');
}

// --- Leave Data ---
async function fetchLeaveData() {
    const res = await apiCall('/leave/history');
    if (res.ok) {
        const history = await res.json();
        renderLeaveList(history);
    }
    // Update balance
    const meRes = await apiCall('/auth/me');
    if (meRes.ok) {
        const me = await meRes.json();
        leaveBalanceDisplay.textContent = `${me.leave_balance} Days`;
    }
}

function renderLeaveList(items) {
    leaveHistoryList.innerHTML = items.map(item => `
        <div class="item-card">
            <div style="display:flex; justify-content:space-between;">
                <strong>${item.leave_type.toUpperCase()}</strong>
                <span class="badge badge-${item.status}">${item.status}</span>
            </div>
            <p style="font-size:0.8rem; margin: 0.5rem 0;">${item.start_date} to ${item.end_date}</p>
            <p style="color:var(--text-secondary); font-size:0.75rem;">${item.reason}</p>
        </div>
    `).join('');
}

leaveForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
        leave_type: document.getElementById('leave-type').value,
        start_date: document.getElementById('leave-start').value,
        end_date: document.getElementById('leave-end').value,
        reason: document.getElementById('leave-reason').value
    };
    const res = await apiCall('/leave/apply', 'POST', body);
    if (res.ok) {
        leaveForm.reset();
        fetchLeaveData();
    }
});

// --- Expense Logic ---
async function fetchExpenseData() {
    const res = await apiCall('/expense/history');
    if (res.ok) {
        const history = await res.json();
        expenseHistoryList.innerHTML = history.map(item => `
            <div class="item-card">
                <div style="display:flex; justify-content:space-between;">
                    <strong>₹${item.amount}</strong>
                    <span class="badge badge-${item.status}">${item.status}</span>
                </div>
                <p style="color:var(--text-secondary); font-size:0.8rem; margin-top:0.5rem;">${item.description}</p>
            </div>
        `).join('');
    }
}

btnCaptureProof.addEventListener('click', async () => {
    try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        // Simplified for web: In a real app we'd show a modal here too.
        // For this demo, we'll just stop it immediately after getting a frame or use a file input.
        alert('Proof capture active (Simulated).');
        currentProofPhoto = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="; // Placeholder
        proofPreview.src = currentProofPhoto;
        proofContainer.classList.remove('hidden');
        tempStream.getTracks().forEach(t => t.stop());
    } catch(e) {
        alert('Could not access camera for proof.');
    }
});

expenseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
        amount: parseFloat(document.getElementById('expense-amount').value),
        description: document.getElementById('expense-desc').value,
        proof_url: currentProofPhoto
    };
    const res = await apiCall('/expense/submit', 'POST', body);
    if (res.ok) {
        expenseForm.reset();
        proofContainer.classList.add('hidden');
        currentProofPhoto = null;
        fetchExpenseData();
    }
});

// --- Salary Logic ---
async function fetchSalaryData() {
    const res = await apiCall('/salary/summary');
    if (res.ok) {
        const data = await res.json();
        document.getElementById('salary-details').innerHTML = `
            <div class="salary-card">
                <p>${data.month} - Net Payout</p>
                <div class="salary-amount">₹${data.net_salary}</div>
                <div class="stat-grid">
                    <div class="stat-item"><p>Base (Pro-rated)</p><p>₹${data.attendance_pay}</p></div>
                    <div class="stat-item"><p>Commisions</p><p>₹${data.performance_commission}</p></div>
                </div>
            </div>
            <div class="item-card">
                <h3>Earnings Breakdown</h3>
                <div class="stat-grid" style="color:var(--text-primary);">
                    <div class="stat-item" style="background:var(--primary-light);"><p>Travel Bonus</p><p>₹${data.travel_incentive}</p></div>
                    <div class="stat-item" style="background:var(--primary-light);"><p>Orders</p><p>${data.stats.orders_completed}</p></div>
                </div>
                <div class="stat-grid" style="margin-top:0.5rem;">
                    <div class="stat-item" style="background:var(--bg-color);"><p>Work Days</p><p>${data.stats.attendance_days}</p></div>
                    <div class="stat-item" style="background:var(--bg-color);"><p>Total KM</p><p>${data.stats.total_km}KM</p></div>
                </div>
            </div>
        `;
    }
}

// --- Admin Logic ---
async function fetchAdminData() {
    // Advanced Analytics
    const analyticsRes = await apiCall('/admin/employee-details');
    if (analyticsRes.ok) renderAdminEmployeeStats(await analyticsRes.json());

    // Fetch pending leaves
    const leaveRes = await apiCall('/leave/all-pending');
    if (leaveRes.ok) renderAdminLeaves(await leaveRes.json());
    
    // Fetch pending expenses
    const expRes = await apiCall('/expense/all-pending');
    if (expRes.ok) renderAdminExpenses(await expRes.json());

    // Fetch System Settings
    const settingsRes = await apiCall('/admin/settings');
    if (settingsRes.ok) {
        const settings = await settingsRes.json();
        document.getElementById('setting-lat').value = settings.office_lat || '';
        document.getElementById('setting-long').value = settings.office_long || '';
        document.getElementById('setting-radius').value = settings.office_radius_meters || '';
        document.getElementById('setting-cust-lat').value = settings.customer_lat || '';
        document.getElementById('setting-cust-long').value = settings.customer_long || '';
    }
}

document.getElementById('btn-save-cust-settings').addEventListener('click', async () => {
    const body = {
        customer_lat: document.getElementById('setting-cust-lat').value,
        customer_long: document.getElementById('setting-cust-long').value
    };
    const res = await apiCall('/admin/settings', 'POST', body);
    if (res.ok) {
        alert('Customer location updated successfully!');
        fetchAdminData();
    }
});

document.getElementById('btn-save-settings').addEventListener('click', async () => {
    const body = {
        office_lat: document.getElementById('setting-lat').value,
        office_long: document.getElementById('setting-long').value,
        office_radius_meters: document.getElementById('setting-radius').value
    };
    const res = await apiCall('/admin/settings', 'POST', body);
    if (res.ok) {
        alert('Office location updated successfully!');
        fetchAdminData();
    } else {
        alert('Failed to update settings. Admin access required.');
    }
});

function renderAdminEmployeeStats(items) {
    const list = document.getElementById('admin-employee-stats-list');
    let totalOrders = 0;
    let activeCount = 0;

    list.innerHTML = items.map(item => {
        if (item.is_online) activeCount++;
        totalOrders += item.orders_completed;
        
        const loginStr = item.login_time ? new Date(item.login_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Not Logged In';
        const mapsLink = item.last_lat ? `<a href="https://www.google.com/maps?q=${item.last_lat},${item.last_long}" target="_blank" class="badge badge-approved" style="text-decoration:none;">📍 Map</a>` : '';
        const onlineStatus = item.is_online ? '<span class="status-dot online" title="Online"></span>' : '<span class="status-dot offline" title="Offline"></span>';
        
        return `
            <div class="item-card employee-status-card">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:0.5rem;">
                        ${onlineStatus}
                        <strong>${item.name}</strong>
                    </div>
                    <div style="display:flex; gap:0.4rem;">
                        ${mapsLink}
                        <button onclick="openAssignModal(${item.user_id}, '${item.name}')" class="badge badge-pending" style="border:none; cursor:pointer;">+ Assign</button>
                    </div>
                </div>
                <div class="stat-grid" style="margin-top:0.5rem; gap:0.5rem;">
                    <div class="stat-item" style="padding:0.4rem; background:var(--primary-light);">
                        <p>Login</p><p style="font-size:0.75rem;">${loginStr}</p>
                    </div>
                    <div class="stat-item" style="padding:0.4rem; background:var(--primary-light);">
                        <p>Done/Pending</p><p style="font-size:0.75rem;">${item.orders_completed} / ${item.assigned_orders || 0}</p>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    document.getElementById('admin-active-count').textContent = activeCount;
    document.getElementById('admin-total-orders').textContent = totalOrders;
}

function renderAdminLeaves(items) {
    const list = document.getElementById('admin-leave-list');
    list.innerHTML = items.map(item => `
        <div class="item-card">
            <div style="display:flex; justify-content:space-between;">
                <strong>${item.user_name}</strong>
                <span class="badge badge-pending">${item.leave_type}</span>
            </div>
            <p style="font-size:0.8rem; margin:0.5rem 0;">${item.start_date} to ${item.end_date}</p>
            <div style="display:flex; gap:0.5rem;">
                <button onclick="updateStatus('/leave/approve/${item.id}', 'approved', 'admin')" class="btn btn-success" style="padding:0.5rem; font-size:0.75rem;">Approve</button>
                <button onclick="updateStatus('/leave/approve/${item.id}', 'rejected', 'admin')" class="btn btn-danger" style="padding:0.5rem; font-size:0.75rem;">Reject</button>
            </div>
        </div>
    `).join('') || '<p style="color:var(--text-secondary); text-align:center;">No pending leaves</p>';
}

function renderAdminExpenses(items) {
    const list = document.getElementById('admin-expense-list');
    list.innerHTML = items.map(item => `
        <div class="item-card">
            <div style="display:flex; justify-content:space-between;">
                <strong>${item.user_name}</strong>
                <span class="badge badge-pending">₹${item.amount}</span>
            </div>
            <p style="font-size:0.8rem; margin:0.5rem 0;">${item.description}</p>
            <div style="display:flex; gap:0.5rem;">
                <button onclick="updateStatus('/expense/approve/${item.id}', 'approved', 'admin')" class="btn btn-success" style="padding:0.5rem; font-size:0.75rem;">Approve</button>
                <button onclick="updateStatus('/expense/approve/${item.id}', 'rejected', 'admin')" class="btn btn-danger" style="padding:0.5rem; font-size:0.75rem;">Reject</button>
            </div>
        </div>
    `).join('') || '<p style="color:var(--text-secondary); text-align:center;">No pending expenses</p>';
}

async function updateStatus(endpoint, status, refreshScreen) {
    const res = await apiCall(endpoint, 'POST', { status });
    if (res.ok) {
        if (refreshScreen === 'admin') fetchAdminData();
        else window.location.reload();
    }
}

// --- Assignment Logic ---
function openAssignModal(userId, userName) {
    currentAssignUserId = userId;
    assignAgentName.textContent = `Assigning to: ${userName}`;
    assignModal.classList.remove('hidden');
}

btnCancelAssign.addEventListener('click', () => {
    assignModal.classList.add('hidden');
    assignForm.reset();
});

assignForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('assign-title').value;
    const res = await apiCall('/orders/assign', 'POST', { user_id: currentAssignUserId, title });
    if (res.ok) {
        alert('Order assigned successfully!');
        assignModal.classList.add('hidden');
        assignForm.reset();
        fetchAdminData();
    } else {
        const err = await res.json();
        alert(err.msg || 'Assignment failed');
    }
});

// Attach to window so onclick works
window.updateStatus = updateStatus;
window.openAssignModal = openAssignModal;

// --- Login Login ---
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    const response = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    if (response.ok) {
        authToken = data.access_token;
        userData = data.user;
        localStorage.setItem('authToken', authToken);
        localStorage.setItem('userData', JSON.stringify(userData));
        showApp();
    } else {
        loginError.textContent = data.msg;
        loginError.classList.remove('hidden');
    }
});
