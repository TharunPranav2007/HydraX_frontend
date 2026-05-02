const API_BASE = 'https://hydrax-backend.onrender.com'; // Assuming standard Flask port based on user's python file

const getHeaders = () => ({
    'ngrok-skip-browser-warning': 'true',
    'Content-Type': 'application/json'
});

// DOM Elements
const navBtns = document.querySelectorAll('.nav-btn');
const tabPanes = document.querySelectorAll('.tab-pane');
const modeRadios = document.querySelectorAll('input[name="mode"]');
const manualSelectors = document.getElementById('manual-selectors');
const pincodeSelectors = document.getElementById('pincode-selectors');
const headerLocPath = document.getElementById('header-location-path');

const stateSelect = document.getElementById('stateSelect');
const districtSelect = document.getElementById('districtSelect');
const blockSelect = document.getElementById('blockSelect');
const villageSelect = document.getElementById('villageSelect');

// State
let currentTab = 'home';
let locationState = {
    state: '',
    district: '',
    block: '',
    village: ''
};
let overallChartInstance = null;
let preChartInstance = null;
let postChartInstance = null;
let rainfallChartInstance = null;
let efficiencyChartInstance = null;
let forecastChartInstance = null;
let mapInstance = null;
let markersLayer = null;
let allIndiaMapCache = null; // Cache for All India load only
let currentMapData = []; // Store fetched map data globally

// Init
async function init() {
    setupNavigation();
    setupLocationSelectors();

    // Background initial map fetch
    fetchMapData();

    // Load states instantly
    loadStates();
}

function setupNavigation() {
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');

            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            tabPanes.forEach(pane => {
                pane.classList.remove('active');
                if (pane.id === `${tabId}-tab`) pane.classList.add('active');
            });

            currentTab = tabId;

            if (currentTab === 'map') {
                if (mapInstance) setTimeout(() => {
                    mapInstance.invalidateSize();
                    if (currentMapData.length > 0) renderMapPoints(currentMapData);
                }, 100);
            }
        });
    });

    document.getElementById('run-crop-btn').addEventListener('click', loadCropData);
    
    const downloadBtn = document.getElementById('btn-download-report');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            const temp = document.getElementById('kpi-temp') ? document.getElementById('kpi-temp').textContent : '--';
            const hum = document.getElementById('kpi-humidity') ? document.getElementById('kpi-humidity').textContent : '--';
            const rain = document.getElementById('rain-avg') ? document.getElementById('rain-avg').textContent : '--';
            const currentDtwl = document.getElementById('kpi-current-dtwl') ? document.getElementById('kpi-current-dtwl').textContent : '--';
            const avgDtwl = document.getElementById('kpi-overall-dtwl') ? document.getElementById('kpi-overall-dtwl').textContent : '--';
            
            let qs = `state=${encodeURIComponent(locationState.state || 'All India')}`;
            if (locationState.district) qs += `&district=${encodeURIComponent(locationState.district)}`;
            if (locationState.block) qs += `&block=${encodeURIComponent(locationState.block)}`;
            if (locationState.village) qs += `&village=${encodeURIComponent(locationState.village)}`;
            qs += `&temp=${encodeURIComponent(temp)}&humidity=${encodeURIComponent(hum)}&rainfall=${encodeURIComponent(rain)}&dtwl=${encodeURIComponent(currentDtwl)}&avg_dtwl=${encodeURIComponent(avgDtwl)}`;
            const url = `${API_BASE}/api/report?${qs}`;
            window.open(url, '_blank');
        });
    }
}

function setupLocationSelectors() {
    if (modeRadios.length) {
        modeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.value === 'pincode') {
                    pincodeSelectors.classList.remove('hidden');
                    manualSelectors.classList.add('hidden');
                } else {
                    pincodeSelectors.classList.add('hidden');
                    manualSelectors.classList.remove('hidden');
                }
            });
        });
    }

    const searchBtn = document.getElementById('pincodeSearchBtn');
    const pinInput = document.getElementById('pincodeInput');
    if (searchBtn) searchBtn.addEventListener('click', handlePincodeSearch);
    if (pinInput) {
        pinInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handlePincodeSearch();
        });
    }

    stateSelect.addEventListener('change', async (e) => {
        locationState.state = e.target.value;
        locationState.district = '';
        locationState.block = '';
        locationState.village = '';
        updateLocationPath();

        resetDropdown(districtSelect, 'Loading districts...');
        resetDropdown(blockSelect, 'Select District First');
        resetDropdown(villageSelect, 'Select Block First');

        await loadDistricts(locationState.state);
        loadAllData();
    });

    districtSelect.addEventListener('change', async (e) => {
        locationState.district = e.target.value;
        locationState.block = '';
        locationState.village = '';
        updateLocationPath();

        resetDropdown(blockSelect, 'Loading blocks...');
        resetDropdown(villageSelect, 'Select Block First');

        await loadBlocks(locationState.state, locationState.district);
        loadAllData();
    });

    blockSelect.addEventListener('change', async (e) => {
        locationState.block = e.target.value;
        locationState.village = '';
        updateLocationPath();

        resetDropdown(villageSelect, 'Loading villages...');

        await loadVillages(locationState.state, locationState.district, locationState.block);
        loadAllData();
    });

    villageSelect.addEventListener('change', (e) => {
        locationState.village = e.target.value;
        updateLocationPath();
        loadAllData();
    });
}

function resetDropdown(element, placeholderText) {
    element.innerHTML = `<option value="" disabled selected>${placeholderText}</option>`;
    element.disabled = true;
}

function updateLocationPath() {
    const parts = [];
    if (locationState.state) parts.push(locationState.state);
    if (locationState.district) parts.push(locationState.district);
    if (locationState.block) parts.push(locationState.block);
    if (locationState.village) parts.push(locationState.village);

    if (parts.length > 0) {
        headerLocPath.textContent = parts.join(' → ');
    } else {
        headerLocPath.textContent = 'All India';
    }
}

async function handlePincodeSearch() {
    const pincode = document.getElementById('pincodeInput').value;
    if (!pincode || pincode.length < 6) return;

    const loading = document.getElementById('pincode-loading');
    const error = document.getElementById('pincode-error');
    loading.classList.remove('hidden');
    error.classList.add('hidden');

    try {
        const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
        const data = await response.json();

        if (data && data[0].Status === 'Success') {
            const postOffice = data[0].PostOffice[0];
            locationState.state = postOffice.State;
            locationState.district = postOffice.District;
            locationState.block = postOffice.Block || '';
            locationState.village = postOffice.Name || '';

            updateLocationPath();

            const stateOpts = Array.from(stateSelect.options);
            const stateMatch = stateOpts.find(opt => opt.value.toLowerCase() === locationState.state.toLowerCase());
            if (stateMatch) {
                stateSelect.value = stateMatch.value;
                await loadDistricts(stateMatch.value);
                const distOpts = Array.from(districtSelect.options);
                const distMatch = distOpts.find(opt => opt.value.toLowerCase() === locationState.district.toLowerCase());
                if (distMatch) {
                    districtSelect.value = distMatch.value;
                    await loadBlocks(stateMatch.value, distMatch.value);
                }
            }

            loadAllData();
        } else {
            throw new Error('Invalid Pincode');
        }
    } catch (err) {
        error.classList.remove('hidden');
    } finally {
        loading.classList.add('hidden');
    }
}

// Data Fetchers
async function loadStates() {
    try {
        const response = await fetch(`${API_BASE}/states`, { headers: getHeaders() });
        const data = await response.json();

        resetDropdown(stateSelect, 'Select a State');

        if (Array.isArray(data)) {
            data.forEach(stateStr => {
                if (stateStr) {
                    const option = document.createElement('option');
                    option.value = stateStr;
                    option.textContent = stateStr;
                    stateSelect.appendChild(option);
                }
            });
            stateSelect.disabled = false;
        }
    } catch (error) {
        console.error("Failed to load states", error);
        resetDropdown(stateSelect, 'Error loading data');
    }
}

async function loadDistricts(stateName) {
    if (!stateName) return;
    try {
        const response = await fetch(`${API_BASE}/districts?state=${encodeURIComponent(stateName)}`, { headers: getHeaders() });
        const data = await response.json();

        resetDropdown(districtSelect, 'Select a District');

        if (Array.isArray(data) && data.length > 0) {
            data.forEach(districtStr => {
                if (districtStr) {
                    const option = document.createElement('option');
                    option.value = districtStr;
                    option.textContent = districtStr;
                    districtSelect.appendChild(option);
                }
            });
            districtSelect.disabled = false;
        }
    } catch (error) {
        console.error("Failed to load districts", error);
        resetDropdown(districtSelect, 'No Data Available');
    }
}

async function loadBlocks(stateName, districtName) {
    if (!stateName || !districtName) return;
    try {
        const response = await fetch(`${API_BASE}/blocks?state=${encodeURIComponent(stateName)}&district=${encodeURIComponent(districtName)}`, { headers: getHeaders() });
        const data = await response.json();

        resetDropdown(blockSelect, 'Select a Block');

        if (Array.isArray(data) && data.length > 0) {
            data.forEach(blockStr => {
                if (blockStr) {
                    const option = document.createElement('option');
                    option.value = blockStr;
                    option.textContent = blockStr;
                    blockSelect.appendChild(option);
                }
            });
            blockSelect.disabled = false;
        }
    } catch (error) {
        console.error("Failed to load blocks", error);
        resetDropdown(blockSelect, 'No Data Available');
    }
}

async function loadVillages(stateName, districtName, blockName) {
    if (!stateName || !districtName || !blockName) return;
    try {
        const response = await fetch(`${API_BASE}/villages?state=${encodeURIComponent(stateName)}&district=${encodeURIComponent(districtName)}&block=${encodeURIComponent(blockName)}`, { headers: getHeaders() });
        const data = await response.json();

        resetDropdown(villageSelect, 'Select a Village');

        if (Array.isArray(data) && data.length > 0) {
            data.forEach(villageStr => {
                if (villageStr) {
                    const option = document.createElement('option');
                    option.value = villageStr;
                    option.textContent = villageStr;
                    villageSelect.appendChild(option);
                }
            });
            villageSelect.disabled = false;
        }
    } catch (error) {
        console.error("Failed to load villages", error);
        resetDropdown(villageSelect, 'No Data Available');
    }
}

function loadAllData() {
    if (!locationState.state && currentTab !== 'map' && currentTab !== 'advanced' && currentTab !== 'alerts') return;
    loadHomeData();
    loadAnalysisData();
    loadRainfallData();
    fetchMapData();
    loadAdvancedData();
}

// --- HOME TAB ---
async function loadHomeData() {
    const loading = document.getElementById('home-loading');
    const error = document.getElementById('home-error');

    loading.classList.remove('hidden');
    error.classList.add('hidden');    try {
        let url = `${API_BASE}/kpi?`;
        if (locationState.state) url += `state=${encodeURIComponent(locationState.state)}&`;
        if (locationState.district) url += `district=${encodeURIComponent(locationState.district)}&`;
        if (locationState.block) url += `block=${encodeURIComponent(locationState.block)}&`;
        if (locationState.village) url += `village=${encodeURIComponent(locationState.village)}&`;

        const response = await fetch(url, { headers: getHeaders() });
        if (!response.ok) throw new Error('KPI Failed');
        const data = await response.json();
        
        if (!data) throw new Error('No Data');

        const homeContent = document.getElementById('home-content');
        if (homeContent) {
            homeContent.classList.remove('fade-update');
            void homeContent.offsetWidth; // trigger reflow
            homeContent.classList.add('fade-update');
        }

        const overall = data.overall_dtwl != null ? data.overall_dtwl : '--';
        const current = data.current_dtwl != null ? data.current_dtwl : '--';
        const currentDate = data.current_date;
        const pre = data.premonsoon != null ? data.premonsoon : '--';
        const post = data.postmonsoon != null ? data.postmonsoon : '--';

        document.getElementById('kpi-overall-dtwl').textContent = overall;
        document.getElementById('kpi-current-dtwl').textContent = current;
        
        const dateEl = document.getElementById('kpi-current-date');
        if (currentDate && currentDate !== '--') {
            dateEl.textContent = `(as of ${currentDate})`;
            dateEl.style.display = 'block';
        } else {
            dateEl.style.display = 'none';
        }

        document.getElementById('kpi-premonsoon').textContent = pre;
        document.getElementById('kpi-postmonsoon').textContent = post;

        document.getElementById('cropDtwlInput').value = overall !== '--' ? overall : '';

        // Derive approx center coords from map data API
        const coords = await getApproximateCoords();
        try {
            const wUrl = `${API_BASE}/weather?lat=${coords.lat}&lon=${coords.lon}&state=${encodeURIComponent(locationState.state)}&district=${encodeURIComponent(locationState.district)}&block=${encodeURIComponent(locationState.block)}&village=${encodeURIComponent(locationState.village)}`;
            const wRes = await fetch(wUrl, { headers: getHeaders() });
            const wData = await wRes.json();
            if (wData) {
                const temp = wData.temperature != null ? Math.round(wData.temperature) : '--';
                const hum = wData.humidity != null ? Math.round(wData.humidity) : '--';
                document.getElementById('kpi-temp').textContent = temp;
                document.getElementById('kpi-humidity').textContent = hum;
                if (temp !== '--') document.getElementById('cropTempInput').value = temp;
            }
        } catch (e) {
            console.warn("Weather API failed", e);
            document.getElementById('kpi-temp').textContent = "N/A";
            document.getElementById('kpi-humidity').textContent = "N/A";
        }
    } catch (err) {
        error.classList.remove('hidden');
        document.getElementById('kpi-overall-dtwl').textContent = '--';
        document.getElementById('kpi-current-dtwl').textContent = '--';
    } finally {
        loading.classList.add('hidden');
    }
}

async function getApproximateCoords() {
    let url = `${API_BASE}/map-data?`;
    if (locationState.state) url += `state=${encodeURIComponent(locationState.state)}&`;
    if (locationState.district) url += `district=${encodeURIComponent(locationState.district)}&`;
    if (locationState.block) url += `block=${encodeURIComponent(locationState.block)}&`;
    if (locationState.village) url += `village=${encodeURIComponent(locationState.village)}&`;
    
    try {
        const response = await fetch(url, { headers: getHeaders() });
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0 && data[0].lat && data[0].lon) {
            return { lat: data[0].lat, lon: data[0].lon };
        }
    } catch(e) {}
    
    return { lat: 20.5937, lon: 78.9629 };
}

// --- ANALYSIS TAB ---
async function loadAnalysisData() {
    const loading = document.getElementById('analysis-loading');
    const error = document.getElementById('analysis-error');
    
    document.getElementById('overallChart').style.display = 'none';
    document.getElementById('preChart').style.display = 'none';
    document.getElementById('postChart').style.display = 'none';

    loading.classList.remove('hidden');
    error.classList.add('hidden');

    try {
        let url = `${API_BASE}/trend-data?`;
        if (locationState.state) url += `state=${encodeURIComponent(locationState.state)}&`;
        if (locationState.district) url += `district=${encodeURIComponent(locationState.district)}&`;
        if (locationState.block) url += `block=${encodeURIComponent(locationState.block)}&`;
        if (locationState.village) url += `village=${encodeURIComponent(locationState.village)}&`;

        const response = await fetch(url, { headers: getHeaders() });
        const data = await response.json();

        const validData = Array.isArray(data) ? data : [];

        const years = validData.map(d => d.year);
        const overall = validData.map(d => d.overall);
        const pre = validData.map(d => d.premonsoon ?? null);
        const post = validData.map(d => d.postmonsoon ?? null);

        renderAnalysisChart(years, overall, pre, post);
        document.getElementById('overallChart').style.display = 'block';
        document.getElementById('preChart').style.display = 'block';
        document.getElementById('postChart').style.display = 'block';
    } catch (err) {
        console.warn('Failed to load trend data:', err);
    } finally {
        loading.classList.add('hidden');
    }
}

function renderAnalysisChart(labels, overall, pre, post) {
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { labels: { color: '#f8fafc' } },
            tooltip: { mode: 'index', intersect: false }
        },
        scales: {
            x: { grid: { color: '#334155' }, ticks: { color: '#94a3b8' } },
            y: { grid: { color: '#334155' }, ticks: { color: '#94a3b8' }, reverse: true, title: { display: true, text: 'Depth (m)', color: '#94a3b8' } }
        }
    };

    if (overallChartInstance) overallChartInstance.destroy();
    overallChartInstance = new Chart(document.getElementById('overallChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Overall DTWL',
                data: overall,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                spanGaps: true
            }]
        },
        options: commonOptions
    });

    if (preChartInstance) preChartInstance.destroy();
    preChartInstance = new Chart(document.getElementById('preChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Premonsoon DTWL',
                data: pre,
                borderColor: '#f59e0b',
                borderDash: [5, 5],
                borderWidth: 2,
                tension: 0.4,
                spanGaps: true
            }]
        },
        options: commonOptions
    });

    if (postChartInstance) postChartInstance.destroy();
    postChartInstance = new Chart(document.getElementById('postChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Postmonsoon DTWL',
                data: post,
                borderColor: '#10b981',
                borderDash: [2, 2],
                borderWidth: 2,
                tension: 0.4,
                spanGaps: true
            }]
        },
        options: commonOptions
    });
}

// --- RAINFALL TAB ---
async function loadRainfallData() {
    const loading = document.getElementById('rainfall-loading');
    const error = document.getElementById('rainfall-error');
    const canvas = document.getElementById('rainfallChart');

    loading.classList.remove('hidden');
    canvas.style.display = 'none';
    error.classList.add('hidden');

    try {
        let url = `${API_BASE}/rainfall-correlation?`;
        if (locationState.state) url += `state=${encodeURIComponent(locationState.state)}&`;
        if (locationState.district) url += `district=${encodeURIComponent(locationState.district)}&`;
        if (locationState.block) url += `block=${encodeURIComponent(locationState.block)}&`;
        if (locationState.village) url += `village=${encodeURIComponent(locationState.village)}&`;

        const response = await fetch(url, { headers: getHeaders() });
        const data = await response.json();

        const years = data.years || [];
        const rainfall = data.rainfall || [];
        const groundwater = data.groundwater || [];

        let highest = 0, lowest = 0, avg = 0;
        if (rainfall.length > 0) {
            highest = Math.max(...rainfall);
            lowest = Math.min(...rainfall);
            avg = Math.round(rainfall.reduce((a, b) => a + b, 0) / rainfall.length);
        }

        document.getElementById('rain-high').textContent = highest;
        document.getElementById('rain-low').textContent = lowest;
        document.getElementById('rain-avg').textContent = avg;
        document.getElementById('cropRainInput').value = avg;

        renderRainfallChart(years, groundwater, rainfall);
        canvas.style.display = 'block';
    } catch (err) {
        console.warn('Failed to load correlation data:', err);
        canvas.style.display = 'block';
    } finally {
        loading.classList.add('hidden');
    }
}

function renderRainfallChart(labels, dtwl, rainData) {
    const ctx = document.getElementById('rainfallChart').getContext('2d');
    if (rainfallChartInstance) rainfallChartInstance.destroy();

    rainfallChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    type: 'bar',
                    label: 'Annual Rainfall (mm)',
                    data: rainData,
                    backgroundColor: 'rgba(139, 92, 246, 0.6)',
                    borderColor: '#8b5cf6',
                    borderWidth: 1,
                    yAxisID: 'y1'
                },
                {
                    type: 'line',
                    label: 'Groundwater DTWL (m)',
                    data: dtwl,
                    borderColor: '#3b82f6',
                    backgroundColor: '#fff',
                    borderWidth: 3,
                    tension: 0.3,
                    yAxisID: 'y2'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                tooltip: { mode: 'index', intersect: false },
                legend: { labels: { color: '#f8fafc' } }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
                y1: {
                    type: 'linear',
                    position: 'left',
                    grid: { color: '#334155' },
                    ticks: { color: '#8b5cf6' },
                    title: { display: true, text: 'Rainfall (mm)', color: '#8b5cf6' }
                },
                y2: {
                    type: 'linear',
                    position: 'right',
                    reverse: true,
                    grid: { display: false },
                    ticks: { color: '#3b82f6' },
                    title: { display: true, text: 'DTWL (m)', color: '#3b82f6' }
                }
            }
        }
    });
}

// --- MAP TAB ---
async function fetchMapData() {
    if (!mapInstance) initMap();

    const loading = document.getElementById('map-loading');
    if (currentTab === 'map') loading.classList.remove('hidden');

    let url = `${API_BASE}/map-data?`;
    if (locationState.state) url += `state=${encodeURIComponent(locationState.state)}&`;
    if (locationState.district) url += `district=${encodeURIComponent(locationState.district)}&`;
    if (locationState.block) url += `block=${encodeURIComponent(locationState.block)}&`;
    if (locationState.village) url += `village=${encodeURIComponent(locationState.village)}&`;

    try {
        const response = await fetch(url, { headers: getHeaders() });
        const data = await response.json();

        const validData = Array.isArray(data) ? data : [];
        currentMapData = validData;

        if (!locationState.state && validData.length > 0) {
            allIndiaMapCache = validData; // Cache global set for weather coordinates inference
        }

        if (currentTab === 'map') {
            renderMapPoints(currentMapData);
        }
    } catch (e) {
        console.error("Map fetch failed", e);
    } finally {
        if (currentTab === 'map') loading.classList.add('hidden');
    }
}

function renderMapPoints(dataList) {
    const mapCard = document.querySelector('.map-card');
    if (mapCard) {
        mapCard.classList.remove('fade-update');
        void mapCard.offsetWidth;
        mapCard.classList.add('fade-update');
    }

    setTimeout(() => {
        const limitedLocations = dataList.slice(0, 5000);
        markersLayer.clearLayers();
        let bounds = [];

        limitedLocations.forEach(loc => {
            if (loc.lat && loc.lon) {
                let color = "#eab308"; // moderate
                if (loc.dtwl < 5) color = "#10b981"; // safe
                else if (loc.dtwl > 15) color = "#ef4444"; // risky

                const marker = L.circleMarker([loc.lat, loc.lon], {
                    radius: 6,
                    fillColor: color,
                    color: "#fff",
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8
                });

                marker.bindPopup(`
                    <div style="color: #0f172a;">
                        <strong>Level (DTWL):</strong> ${loc.dtwl != null ? loc.dtwl + 'm' : 'N/A'}
                    </div>
                `);
                markersLayer.addLayer(marker);
                bounds.push([loc.lat, loc.lon]);
            }
        });

        if (bounds.length > 0) {
            mapInstance.fitBounds(bounds, { padding: [50, 50] });
        } else {
            mapInstance.setView([20.5937, 78.9629], 5);
        }
    }, 10);
}

function initMap() {
    mapInstance = L.map('map').setView([20.5937, 78.9629], 5);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        maxZoom: 20
    }).addTo(mapInstance);
    markersLayer = L.markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: 50
    }).addTo(mapInstance);
}

// --- CROP TAB ---
async function loadCropData() {
    if (!locationState.state) {
        alert("Please select a state using the Location Selector.");
        return;
    }

    const tempInput = document.getElementById('cropTempInput').value || document.getElementById('kpi-temp').textContent;
    const rainInput = document.getElementById('cropRainInput').value || document.getElementById('rain-avg').textContent;
    const dtwlInput = document.getElementById('cropDtwlInput').value || document.getElementById('kpi-current-dtwl').textContent;
    const avgDtwl = document.getElementById('kpi-overall-dtwl').textContent;
    const humidity = document.getElementById('kpi-humidity').textContent;

    if (!tempInput || !rainInput || !dtwlInput || tempInput === '--' || rainInput === '--') {
        alert("Please ensure Temperature, Rainfall, and DTWL data is available.");
        return;
    }

    const loading = document.getElementById('crop-loading');
    const content = document.getElementById('crop-content');
    const error = document.getElementById('crop-error');
    const empty = document.getElementById('crop-empty');

    empty.classList.add('hidden');
    loading.classList.remove('hidden');
    content.classList.add('hidden');
    error.classList.add('hidden');

    try {
        let url = `${API_BASE}/ai-crop?state=${encodeURIComponent(locationState.state)}`;
        if (locationState.district) url += `&district=${encodeURIComponent(locationState.district)}`;
        if (locationState.block) url += `&block=${encodeURIComponent(locationState.block)}`;
        if (locationState.village) url += `&village=${encodeURIComponent(locationState.village)}`;
        
        url += `&dtwl=${encodeURIComponent(dtwlInput)}&avg_dtwl=${encodeURIComponent(avgDtwl)}`;
        url += `&temp=${encodeURIComponent(tempInput)}&humidity=${encodeURIComponent(humidity)}&rainfall=${encodeURIComponent(rainInput)}`;
        
        const response = await fetch(url, { headers: getHeaders() });
        const data = await response.json();
        
        if (data.message) {
            throw new Error(data.message);
        }

        const suitable = data.suitable || [];
        const moderate = data.moderate || [];
        const notRecommended = data.not_recommended || [];

        const renderSection = (id, items) => {
            const container = document.getElementById(id);
            container.innerHTML = '';
            if (!items || items.length === 0) {
                container.innerHTML = '<p class="text-sm opacity-80 italic">No suitable crops found for current conditions</p>';
                return;
            }
            items.forEach(item => {
                container.innerHTML += `
                    <div class="crop-item">
                        <span class="font-bold block">${item.crop}</span>
                        <span class="text-xs opacity-90 block mt-1">• ${item.reason}</span>
                    </div>
                `;
            });
        };

        renderSection('crop-suitable-list', suitable);
        renderSection('crop-moderate-list', moderate);
        renderSection('crop-not-recommended-list', notRecommended);

        content.classList.remove('hidden');
        content.classList.add('flex');
    } catch (err) {
        console.warn("AI Crop Model warning:", err);
        error.classList.remove('hidden');
    } finally {
        loading.classList.add('hidden');
    }
}

// --- ADVANCED TAB ---
async function loadAdvancedData() {
    let baseQs = `?`;
    if (locationState.state) baseQs += `state=${encodeURIComponent(locationState.state)}&`;
    if (locationState.district) baseQs += `district=${encodeURIComponent(locationState.district)}&`;
    if (locationState.block) baseQs += `block=${encodeURIComponent(locationState.block)}&`;
    if (locationState.village) baseQs += `village=${encodeURIComponent(locationState.village)}&`;

    try {
        fetch(`${API_BASE}/api/health-card${baseQs}`).then(r => r.json()).then(data => {
            document.getElementById('health-score').textContent = data.health_score != null ? data.health_score : '--';
            document.getElementById('health-trend').textContent = data.trend || '--';
            const card = document.getElementById('healthCard');
            if (card) card.className = `kpi-card ${data.risk === 'high' ? 'rose' : data.risk === 'medium' ? 'orange' : 'emerald'}`;
            
            const expl = document.getElementById('health-explanation');
            if (expl) {
                let txt = "Explanation:<br>";
                if (data.health_score >= 80) txt += "This means groundwater is in good condition. Water levels are stable and suitable for usage.";
                else if (data.health_score >= 50) txt += "This means groundwater is available but not in ideal condition. Water levels are slightly deep and may reduce further if usage continues.";
                else txt += "This means groundwater condition is poor. Water levels are very deep and immediate water-saving measures are required.";
                expl.innerHTML = txt;
            }
        }).catch(e => console.warn(e));

        fetch(`${API_BASE}/api/autonomy${baseQs}`).then(r => r.json()).then(data => {
            const daysVal = data.days_of_autonomy;
            document.getElementById('autonomy-days').textContent = daysVal != null && daysVal !== '--' ? daysVal + ' Days' : '--';
            document.getElementById('autonomy-status').textContent = data.status || '--';
            const card = document.getElementById('autonomyCard');
            if (card) card.className = `kpi-card ${data.status === 'Safe' ? 'emerald' : data.status === 'Warning' ? 'orange' : 'rose'}`;
            
            const expl = document.getElementById('autonomy-explanation');
            if (expl) {
                let txt = "Explanation:<br>";
                if (daysVal === '--') {
                    txt += "Not enough data to calculate autonomy.";
                } else if (daysVal < 30) {
                    txt += "If no rain occurs, the available groundwater can support usage for approximately " + daysVal + " days before reaching critical levels. <strong>Water may run out very soon.</strong>";
                } else if (daysVal <= 90) {
                    txt += "If no rain occurs, the available groundwater can support usage for approximately " + daysVal + " days. <strong>Water is available but needs careful usage.</strong>";
                } else {
                    txt += "If no rain occurs, the available groundwater can support usage for approximately " + daysVal + " days. <strong>Water availability is stable.</strong>";
                }
                expl.innerHTML = txt;
            }
        }).catch(e => console.warn(e));

        fetch(`${API_BASE}/api/alerts${baseQs}`).then(r => r.json()).then(data => {
            const container = document.getElementById('alertsList');
            if (!container) return;
            container.innerHTML = '';
            (data.alerts || []).forEach(alertObj => {
                const card = document.createElement('div');
                card.className = 'kpi-card';
                card.style.background = 'rgba(30, 41, 59, 0.7)';
                
                if (typeof alertObj === 'string') {
                    card.innerHTML = `<h4 style="color: #ef4444; margin-bottom: 8px;">⚠ Alert</h4><p style="color: var(--text-muted);">${alertObj}</p>`;
                } else {
                    const isSafe = alertObj.alert.includes('✅');
                    const color = isSafe ? '#10b981' : '#f59e0b';
                    card.innerHTML = `
                        <h4 style="color: ${color}; margin-bottom: 12px; font-size: 1.1rem;">${alertObj.alert}</h4>
                        <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px 12px; font-size: 0.95rem; line-height: 1.5;">
                            <strong style="color: #cbd5e1;">Reason:</strong>
                            <span style="color: #94a3b8;">${alertObj.reason || '--'}</span>
                            <strong style="color: #cbd5e1;">Impact:</strong>
                            <span style="color: #94a3b8;">${alertObj.impact || '--'}</span>
                            <strong style="color: ${color};">Recommendation:</strong>
                            <span style="color: #e2e8f0;">${alertObj.recommendation || '--'}</span>
                        </div>
                    `;
                }
                container.appendChild(card);
            });
        }).catch(e => console.warn(e));

        fetch(`${API_BASE}/api/insights${baseQs}`).then(r => r.json()).then(data => {
            const ip = document.getElementById('insightsText');
            if (ip) ip.textContent = data.insight || 'Groundwater levels in this region are moderately stable but show a declining trend. Recharge after rainfall is limited, so careful water usage is recommended.';
        }).catch(e => console.warn(e));

        fetch(`${API_BASE}/api/recharge-efficiency${baseQs}`).then(r => r.json()).then(data => {
            renderEfficiencyChart(data);
        }).catch(e => console.warn(e));

        fetch(`${API_BASE}/api/forecast${baseQs}`).then(r => r.json()).then(data => {
            renderForecastChart(data);
        }).catch(e => console.warn(e));

    } catch (e) {
        console.error("Advanced data load failed:", e);
    }
}

function renderEfficiencyChart(dataList) {
    const ctxEl = document.getElementById('efficiencyChart');
    if (!ctxEl) return;
    
    if (efficiencyChartInstance) efficiencyChartInstance.destroy();
    
    const years = dataList.map(d => d.year);
    const effs = dataList.map(d => d.efficiency);

    efficiencyChartInstance = new Chart(ctxEl.getContext('2d'), {
        type: 'line',
        data: {
            labels: years,
            datasets: [{
                label: 'Efficiency Index',
                data: effs,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderWidth: 2,
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#f8fafc' } } },
            scales: {
                x: { grid: { color: '#334155' }, ticks: { color: '#94a3b8' } },
                y: { grid: { color: '#334155' }, ticks: { color: '#94a3b8' } }
            }
        }
    });
}

function renderForecastChart(dataList) {
    const ctxEl = document.getElementById('forecastChart');
    if (!ctxEl) return;
    
    if (forecastChartInstance) forecastChartInstance.destroy();
    
    const years = dataList.map(d => d.year);
    const vals = dataList.map(d => d.value);

    forecastChartInstance = new Chart(ctxEl.getContext('2d'), {
        type: 'line',
        data: {
            labels: years,
            datasets: [{
                label: 'Forecasted DTWL',
                data: vals,
                borderColor: '#8b5cf6',
                borderDash: [5, 5],
                borderWidth: 2,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#f8fafc' } } },
            scales: {
                x: { grid: { color: '#334155' }, ticks: { color: '#94a3b8' } },
                y: { grid: { color: '#334155' }, ticks: { color: '#94a3b8' }, reverse: true, title: { display: true, text: 'Depth (m)', color: '#94a3b8' } }
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', init);

window.toggleLocationInputs = function() {
    const section = document.getElementById("location-inputs");
    const arrow = document.getElementById("location-arrow");

    if (!section || !arrow) return;

    if (section.style.display === "none" || section.style.display === "") {
        section.style.display = "block";
        arrow.innerHTML = "⌄";
    } else {
        section.style.display = "none";
        arrow.innerHTML = "›";
    }
};
