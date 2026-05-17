// ============================================================
//  app.js — Hospital Dashboard Frontend
//  Connects to your Express/MongoDB backend at localhost:5000
// ============================================================

const API = 'http://localhost:5000/api'; // <-- change this if your server runs on a different port

// -------------------------------------------------------
// UTILITY HELPERS
// -------------------------------------------------------

/** Format a number as Kenya Shillings */
function ksh(n) {
  return 'KSh ' + Number(n).toLocaleString('en-KE', { minimumFractionDigits: 0 });
}

/** Pick a colour from our palette by index */
const PALETTE = ['#2dd4bf', '#fb7185', '#fbbf24', '#a78bfa', '#60a5fa', '#34d399', '#f472b6', '#f97316'];
const color = i => PALETTE[i % PALETTE.length];

// Chart.js global defaults (dark theme)
Chart.defaults.color = '#6b7280';
Chart.defaults.borderColor = 'rgba(255,255,255,0.07)';
Chart.defaults.font.family = "'DM Sans', sans-serif";

// -------------------------------------------------------
// STATE — patients array stored in memory
// -------------------------------------------------------
let allPatients = [];   // full list fetched from API
let chartInstances = {}; // keep track of Chart objects so we can destroy/recreate

// -------------------------------------------------------
// NAVIGATION
// -------------------------------------------------------
const navItems = document.querySelectorAll('.nav-item');
const pages   = document.querySelectorAll('.page');
const pageTitleEl = document.getElementById('page-title');
const pageSubEl   = document.getElementById('page-sub');

const PAGE_META = {
  dashboard:   { title: 'Dashboard',   sub: 'Overview & analytics' },
  patients:    { title: 'Patients',     sub: 'All patient records' },
  'add-patient': { title: 'Add Patient', sub: 'Register a new patient' },
  analytics:   { title: 'Analytics',   sub: 'Detailed charts' },
};

function showPage(pageId) {
  pages.forEach(p => p.classList.remove('active'));
  navItems.forEach(n => n.classList.remove('active'));

  const targetPage = document.getElementById('page-' + pageId);
  const targetNav  = document.querySelector(`.nav-item[data-page="${pageId}"]`);

  if (targetPage) targetPage.classList.add('active');
  if (targetNav)  targetNav.classList.add('active');

  const meta = PAGE_META[pageId] || { title: pageId, sub: '' };
  pageTitleEl.textContent = meta.title;
  pageSubEl.textContent   = meta.sub;

  // Render charts only when the relevant page is shown
  if (pageId === 'dashboard') renderDashboard();
  if (pageId === 'analytics') renderAnalytics();
}

navItems.forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    showPage(item.dataset.page);
  });
});

// -------------------------------------------------------
// API CALLS
// -------------------------------------------------------

/** Fetch all patients from backend */
async function fetchPatients() {
  try {
    const res = await fetch(`${API}/patients`);
    if (!res.ok) throw new Error('Network response was not ok');
    const data = await res.json();
    // Support both { patients: [...] } and plain array responses
    allPatients = Array.isArray(data) ? data : (data.patients || []);
  } catch (err) {
    console.warn('Could not reach API — using demo data.', err.message);
    allPatients = DEMO_PATIENTS; // fallback so UI still looks good
  }

  // Apply date filter
  applyFilter();
}

/** POST a new patient */
async function addPatient(payload) {
  const res = await fetch(`${API}/patients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to add patient');
  }
  return res.json();
}

/** DELETE a patient */
async function deletePatient(id) {
  const res = await fetch(`${API}/patients/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Delete failed');
}

// -------------------------------------------------------
// DATE FILTER
// -------------------------------------------------------
let filteredPatients = [];

document.getElementById('filter-period').addEventListener('change', applyFilter);

function applyFilter() {
  const period = document.getElementById('filter-period').value;
  const now = new Date();

  filteredPatients = allPatients.filter(p => {
    if (!p.visitDate && !p.visit_date) return true; // no date → include
    const d = new Date(p.visitDate || p.visit_date);
    if (period === 'today') {
      return d.toDateString() === now.toDateString();
    }
    if (period === 'month') {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    return true; // 'all'
  });

  renderStatCards();
  renderPatientTable(filteredPatients);
  if (document.getElementById('page-dashboard').classList.contains('active')) renderDashboard();
  if (document.getElementById('page-analytics').classList.contains('active')) renderAnalytics();
}

// -------------------------------------------------------
// ANALYTICS HELPERS
// -------------------------------------------------------

function computeStats(patients) {
  if (!patients.length) return null;

  const bills = patients.map(p => Number(p.billAmount || p.bill_amount || 0));
  const total  = bills.reduce((a, b) => a + b, 0);
  const avg    = total / bills.length;
  const highest = Math.max(...bills);
  const lowest  = Math.min(...bills);

  // most common disease
  const diseaseCounts = {};
  patients.forEach(p => {
    const d = (p.disease || 'Unknown').trim();
    diseaseCounts[d] = (diseaseCounts[d] || 0) + 1;
  });
  const topDisease = Object.entries(diseaseCounts).sort((a,b) => b[1]-a[1])[0];

  // most visited doctor
  const doctorCounts = {};
  patients.forEach(p => {
    const d = (p.doctorName || p.doctor_name || 'Unknown').trim();
    doctorCounts[d] = (doctorCounts[d] || 0) + 1;
  });
  const topDoctor = Object.entries(doctorCounts).sort((a,b) => b[1]-a[1])[0];

  return { total: patients.length, revenue: total, avg, highest, lowest, topDisease, topDoctor, diseaseCounts, doctorCounts };
}

// -------------------------------------------------------
// STAT CARDS
// -------------------------------------------------------
function renderStatCards() {
  const stats = computeStats(filteredPatients);
  if (!stats) {
    ['stat-total','stat-revenue','stat-avg','stat-doctor'].forEach(id => {
      document.getElementById(id).textContent = '0';
    });
    return;
  }
  document.getElementById('stat-total').textContent   = stats.total;
  document.getElementById('stat-revenue').textContent = ksh(stats.revenue);
  document.getElementById('stat-avg').textContent     = ksh(Math.round(stats.avg));
  document.getElementById('stat-doctor').textContent  = stats.topDoctor ? stats.topDoctor[0] : '—';
  document.getElementById('hl-highest').textContent   = ksh(stats.highest);
  document.getElementById('hl-lowest').textContent    = ksh(stats.lowest);
  document.getElementById('hl-disease').textContent   = stats.topDisease ? stats.topDisease[0] : '—';
}

// -------------------------------------------------------
// DASHBOARD CHARTS
// -------------------------------------------------------
function renderDashboard() {
  renderStatCards();
  renderRevenueChart();
  renderDiseaseChart();
}

function destroyChart(key) {
  if (chartInstances[key]) {
    chartInstances[key].destroy();
    delete chartInstances[key];
  }
}

function renderRevenueChart() {
  destroyChart('revenue');
  const ctx = document.getElementById('chart-revenue').getContext('2d');

  // Group by month
  const monthly = {};
  filteredPatients.forEach(p => {
    const d = new Date(p.visitDate || p.visit_date || Date.now());
    const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    monthly[key] = (monthly[key] || 0) + Number(p.billAmount || p.bill_amount || 0);
  });

  const labels = Object.keys(monthly);
  const values = Object.values(monthly);

  chartInstances.revenue = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Revenue (KSh)',
        data: values,
        borderColor: '#2dd4bf',
        backgroundColor: 'rgba(45,212,191,0.08)',
        borderWidth: 2,
        pointBackgroundColor: '#2dd4bf',
        pointRadius: 4,
        tension: 0.4,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => 'KSh ' + v.toLocaleString() } }
      }
    }
  });
}

function renderDiseaseChart() {
  destroyChart('disease');
  const ctx = document.getElementById('chart-disease').getContext('2d');
  const stats = computeStats(filteredPatients);
  if (!stats) return;

  const entries = Object.entries(stats.diseaseCounts).sort((a,b) => b[1]-a[1]).slice(0, 7);

  chartInstances.disease = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: entries.map(e => e[0]),
      datasets: [{
        data: entries.map(e => e[1]),
        backgroundColor: entries.map((_, i) => color(i)),
        borderWidth: 0,
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true,
      cutout: '65%',
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, padding: 12 } }
      }
    }
  });
}

// -------------------------------------------------------
// ANALYTICS CHARTS
// -------------------------------------------------------
function renderAnalytics() {
  renderDoctorChart();
  renderAgeChart();
  renderMonthlyChart();
}

function renderDoctorChart() {
  destroyChart('doctor');
  const ctx = document.getElementById('chart-doctor').getContext('2d');
  const stats = computeStats(filteredPatients);
  if (!stats) return;

  const entries = Object.entries(stats.doctorCounts).sort((a,b) => b[1]-a[1]).slice(0, 8);

  chartInstances.doctor = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: entries.map(e => e[0]),
      datasets: [{
        label: 'Patients',
        data: entries.map(e => e[1]),
        backgroundColor: entries.map((_, i) => color(i)),
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } }
    }
  });
}

function renderAgeChart() {
  destroyChart('age');
  const ctx = document.getElementById('chart-age').getContext('2d');

  // Age buckets
  const buckets = { '0-17': 0, '18-30': 0, '31-45': 0, '46-60': 0, '61+': 0 };
  filteredPatients.forEach(p => {
    const age = Number(p.age || 0);
    if (age <= 17)      buckets['0-17']++;
    else if (age <= 30) buckets['18-30']++;
    else if (age <= 45) buckets['31-45']++;
    else if (age <= 60) buckets['46-60']++;
    else                buckets['61+']++;
  });

  chartInstances.age = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Object.keys(buckets),
      datasets: [{
        label: 'Patients',
        data: Object.values(buckets),
        backgroundColor: PALETTE,
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
    }
  });
}

function renderMonthlyChart() {
  destroyChart('monthly');
  const ctx = document.getElementById('chart-monthly').getContext('2d');

  const monthly = {};
  filteredPatients.forEach(p => {
    const d = new Date(p.visitDate || p.visit_date || Date.now());
    const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    monthly[key] = (monthly[key] || 0) + 1;
  });

  chartInstances.monthly = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Object.keys(monthly),
      datasets: [{
        label: 'Patients',
        data: Object.values(monthly),
        backgroundColor: 'rgba(167,139,250,0.7)',
        borderColor: '#a78bfa',
        borderWidth: 1,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
    }
  });
}

// -------------------------------------------------------
// PATIENT TABLE
// -------------------------------------------------------
function renderPatientTable(patients) {
  const tbody = document.getElementById('patient-tbody');
  if (!patients.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-row">No patients found.</td></tr>';
    return;
  }

  tbody.innerHTML = patients.map((p, i) => {
    const name     = p.name || '—';
    const age      = p.age || '—';
    const disease  = p.disease || '—';
    const doctor   = p.doctorName || p.doctor_name || '—';
    const dateStr  = p.visitDate || p.visit_date
                     ? new Date(p.visitDate || p.visit_date).toLocaleDateString('en-KE')
                     : '—';
    const bill     = ksh(p.billAmount || p.bill_amount || 0);
    const id       = p._id || p.id || i;

    return `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${name}</strong></td>
        <td>${age}</td>
        <td><span class="badge badge-teal">${disease}</span></td>
        <td>${doctor}</td>
        <td>${dateStr}</td>
        <td>${bill}</td>
        <td>
          <button class="btn-delete" title="Delete" onclick="handleDelete('${id}')">✕</button>
        </td>
      </tr>`;
  }).join('');
}

// Search / filter table
document.getElementById('search-input').addEventListener('input', function() {
  const q = this.value.toLowerCase();
  const results = filteredPatients.filter(p =>
    (p.name || '').toLowerCase().includes(q) ||
    (p.disease || '').toLowerCase().includes(q) ||
    (p.doctorName || p.doctor_name || '').toLowerCase().includes(q)
  );
  renderPatientTable(results);
});

// Delete handler
async function handleDelete(id) {
  if (!confirm('Delete this patient record?')) return;
  try {
    await deletePatient(id);
    await fetchPatients();
  } catch (err) {
    // In demo mode, just remove locally
    allPatients = allPatients.filter(p => (p._id || p.id) != id);
    applyFilter();
  }
}

// -------------------------------------------------------
// ADD PATIENT FORM
// -------------------------------------------------------
document.getElementById('btn-submit').addEventListener('click', async () => {
  const name    = document.getElementById('f-name').value.trim();
  const age     = document.getElementById('f-age').value.trim();
  const disease = document.getElementById('f-disease').value.trim();
  const doctor  = document.getElementById('f-doctor').value.trim();
  const date    = document.getElementById('f-date').value;
  const bill    = document.getElementById('f-bill').value.trim();

  // Basic validation
  if (!name || !age || !disease || !doctor || !date || !bill) {
    showToast('Please fill in all fields.', 'error');
    return;
  }

  const payload = {
    name,
    age: Number(age),
    disease,
    doctorName: doctor,
    visitDate: date,
    billAmount: Number(bill),
  };

  try {
    await addPatient(payload);
    showToast('Patient added successfully!', 'success');
    clearForm();
    await fetchPatients();
  } catch (err) {
    // In demo mode, add locally
    allPatients.unshift({ ...payload, _id: Date.now().toString() });
    applyFilter();
    showToast('Patient added (demo mode — no backend).', 'success');
    clearForm();
  }
});

function clearForm() {
  ['f-name','f-age','f-disease','f-doctor','f-date','f-bill'].forEach(id => {
    document.getElementById(id).value = '';
  });
}

function showToast(msg, type) {
  const t = document.getElementById('form-toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  setTimeout(() => { t.className = 'toast hidden'; }, 3500);
}

// -------------------------------------------------------
// DEMO DATA (shown when no backend is connected)
// -------------------------------------------------------
const DEMO_PATIENTS = [
  { _id:'1', name:'Aisha Kamau',    age:28, disease:'Malaria',    doctorName:'Dr. Otieno',  visitDate:'2024-05-12', billAmount:4500 },
  { _id:'2', name:'Brian Mwangi',   age:45, disease:'Diabetes',   doctorName:'Dr. Wanjiku', visitDate:'2024-05-13', billAmount:12000 },
  { _id:'3', name:'Cynthia Odhiambo',age:34,disease:'Malaria',   doctorName:'Dr. Otieno',  visitDate:'2024-05-14', billAmount:5200 },
  { _id:'4', name:'David Njoroge',  age:60, disease:'Hypertension',doctorName:'Dr. Maina',  visitDate:'2024-04-20', billAmount:8700 },
  { _id:'5', name:'Esther Wanjiku', age:22, disease:'Typhoid',    doctorName:'Dr. Wanjiku', visitDate:'2024-04-22', billAmount:3100 },
  { _id:'6', name:'Felix Kiptoo',   age:38, disease:'Diabetes',   doctorName:'Dr. Maina',  visitDate:'2024-03-15', billAmount:11500 },
  { _id:'7', name:'Grace Achieng',  age:55, disease:'Asthma',     doctorName:'Dr. Otieno',  visitDate:'2024-03-18', billAmount:6800 },
  { _id:'8', name:'Hassan Abdi',    age:30, disease:'Malaria',    doctorName:'Dr. Barasa',  visitDate:'2024-02-10', billAmount:4000 },
  { _id:'9', name:'Irene Chebet',   age:47, disease:'Hypertension',doctorName:'Dr. Maina',  visitDate:'2024-02-14', billAmount:9300 },
  { _id:'10',name:'James Ouma',     age:19, disease:'Typhoid',    doctorName:'Dr. Barasa',  visitDate:'2024-01-05', billAmount:2800 },
];

// -------------------------------------------------------
// BOOT
// -------------------------------------------------------
(async () => {
  await fetchPatients();
  renderDashboard();  // start on dashboard
})();
