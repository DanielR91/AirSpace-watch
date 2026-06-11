// Airspace-Watch Radar Core Client Engine
(function() {
  // Constants & State
  const INGEST_INTERVAL_MS = 10000; // Ingest aviation data every 10 seconds
  const TRAIL_MAX = 20; // Maximum history coordinate tracker points

  let supabase = null;
  let flights = [];
  let selectedFlightHex = null;
  let lastIngestTime = null;

  // Radar Camera & Display Config
  // Default origin center (SF Bay Area)
  let originLat = 37.7749;
  let originLon = -122.4194;
  let camera = {
    x: 0, // canvas center offset X
    y: 0, // canvas center offset Y
    zoom: 1.5,
    targetX: 0,
    targetY: 0,
    targetZoom: 1.5,
    lerpFactor: 0.1,
    isLocked: false
  };

  // Dragging support
  let isDragging = false;
  let dragStart = { x: 0, y: 0 };
  let cameraStart = { x: 0, y: 0 };

  // Canvas elements
  const canvas = document.getElementById('radar-canvas');
  const ctx = canvas.getContext('2d');
  
  // Sweep state
  let sweepAngle = 0;
  
  // UI Elements
  const supabaseModal = document.getElementById('supabase-modal');
  const supabaseForm = document.getElementById('supabase-config-form');
  const sbUrlInput = document.getElementById('sb-url');
  const sbAnonKeyInput = document.getElementById('sb-anon-key');
  const btnConfigReset = document.getElementById('btn-config-reset');
  const feedStatus = document.getElementById('feed-status');
  const lastUpdateTimeSpan = document.getElementById('last-update-time');
  const tableBody = document.getElementById('aircraft-table-body');
  const detailCard = document.getElementById('target-detail-card');

  // Stats elements
  const statTotal = document.getElementById('stat-total');
  const statEmergencies = document.getElementById('stat-emergencies');
  const statMilitary = document.getElementById('stat-military');

  // Initialize UI & Connection
  document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    checkDatabaseConnection();
    resizeCanvas();
    animate();
  });

  window.addEventListener('resize', resizeCanvas);

  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height, 700);
    canvas.width = size * window.devicePixelRatio;
    canvas.height = size * window.devicePixelRatio;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }

  // Check connection state & localStorage keys
  async function checkDatabaseConnection() {
    let supabaseUrl = "";
    let supabaseKey = "";

    try {
      // Attempt to load credentials from Vercel server-side runtime variables
      const configRes = await fetch('/api/config');
      if (configRes.ok) {
        const config = await configRes.json();
        supabaseUrl = config.supabaseUrl;
        supabaseKey = config.supabaseKey;
      }
    } catch (err) {
      console.warn('Config fetch from endpoint failed:', err);
    }

    // Fallback if environment variables are not served via API
    if (!supabaseUrl) {
      supabaseUrl = localStorage.getItem('supabase_url') || localStorage.getItem('AIRSPACE_SB_URL');
    }
    if (!supabaseKey) {
      supabaseKey = localStorage.getItem('supabase_key') || localStorage.getItem('AIRSPACE_SB_KEY');
    }

    // 1. Guard Against Null Ingestion Keys
    if (!supabaseUrl || !supabaseKey) {
      showConfigModal();
      feedStatus.innerText = 'NO KEYS';
      feedStatus.className = 'text-tacticalRed font-bold';
      return;
    }

    try {
      // Initialize Supabase client
      supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
      hideConfigModal();
      feedStatus.innerText = 'CONNECTED';
      feedStatus.className = 'text-tacticalGreen font-bold';
      
      // Start Ingest cycle and Query loop
      triggerTelemetrySyncCycle();
      setInterval(triggerTelemetrySyncCycle, INGEST_INTERVAL_MS);
    } catch (err) {
      console.error('Supabase Init Error:', err);
      showConfigModal();
    }
  }

  async function showConfigModal() {
    let sbUrl = "";
    let sbKey = "";

    try {
      const configRes = await fetch('/api/config');
      if (configRes.ok) {
        const config = await configRes.json();
        sbUrl = config.supabaseUrl;
        sbKey = config.supabaseKey;
      }
    } catch (err) {}

    if (!sbUrl) {
      sbUrl = localStorage.getItem('supabase_url') || localStorage.getItem('AIRSPACE_SB_URL') || '';
    }
    if (!sbKey) {
      sbKey = localStorage.getItem('supabase_key') || localStorage.getItem('AIRSPACE_SB_KEY') || '';
    }

    sbUrlInput.value = sbUrl;
    sbAnonKeyInput.value = sbKey;
    supabaseModal.classList.remove('hidden');
  }

  function hideConfigModal() {
    supabaseModal.classList.add('hidden');
  }

  function setupEventListeners() {
    // Config Form Submit
    supabaseForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const inputUrl = sbUrlInput.value.trim();
      const inputKey = sbAnonKeyInput.value.trim();
      localStorage.setItem('supabase_url', inputUrl);
      localStorage.setItem('supabase_key', inputKey);
      localStorage.setItem('AIRSPACE_SB_URL', inputUrl);
      localStorage.setItem('AIRSPACE_SB_KEY', inputKey);
      checkDatabaseConnection();
    });

    btnConfigReset.addEventListener('click', () => {
      showConfigModal();
    });

    // Zoom Controls
    document.getElementById('zoom-in').addEventListener('click', () => {
      camera.targetZoom = Math.min(camera.targetZoom * 1.4, 15);
    });

    document.getElementById('zoom-out').addEventListener('click', () => {
      camera.targetZoom = Math.max(camera.targetZoom / 1.4, 0.2);
    });

    document.getElementById('radar-recenter').addEventListener('click', () => {
      camera.targetX = 0;
      camera.targetY = 0;
      camera.isLocked = false;
      selectedFlightHex = null;
      detailCard.classList.add('hidden');
    });

    // Canvas Dragging Panning
    canvas.addEventListener('mousedown', (e) => {
      isDragging = true;
      camera.isLocked = false;
      const rect = canvas.getBoundingClientRect();
      dragStart.x = e.clientX - rect.left;
      dragStart.y = e.clientY - rect.top;
      cameraStart.x = camera.x;
      cameraStart.y = camera.y;
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const rect = canvas.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;
      
      const dx = currentX - dragStart.x;
      const dy = currentY - dragStart.y;
      
      camera.targetX = cameraStart.x + dx;
      camera.targetY = cameraStart.y + dy;
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }

  // Trigger telemetry fetch, local scoring, caching to Supabase, and querying
  async function triggerTelemetrySyncCycle() {
    if (!supabase) return;
    
    feedStatus.innerText = 'SYNCING';
    feedStatus.className = 'text-tacticalAmber font-bold';

    try {
      // Fetch telemetry from multiple public points or military feeds
      // Fetch SFO general regional traffic (250 NM radius)
      const flightResponse = await fetch(`https://api.airplanes.live/v2/point/${originLat}/${originLon}/250`);
      
      if (!flightResponse.ok) {
        throw new Error(`Aviation API HTTP Error: ${flightResponse.status}`);
      }

      const rawData = await flightResponse.json();
      const rawFlights = rawData.ac || [];
      
      // Process and insert/upsert each flight
      await processAndCacheFlights(rawFlights);

      // Query top 20 flights sorted by score descending
      const { data, error } = await supabase
        .from('monitored_flights')
        .select('*')
        .order('score', { ascending: false })
        .limit(20);

      if (error) throw error;
      
      flights = data || [];
      
      // Update UI Stats
      updateStats(rawFlights.length, flights);
      
      // Update table feed
      renderFlightsTable();

      lastIngestTime = new Date();
      lastUpdateTimeSpan.innerText = lastIngestTime.toLocaleTimeString();
      feedStatus.innerText = 'ONLINE';
      feedStatus.className = 'text-tacticalGreen font-bold';

    } catch (err) {
      console.error('Ingestion Sync Cycle Failed:', err);
      feedStatus.innerText = 'OFFLINE/ERR';
      feedStatus.className = 'text-tacticalRed font-bold';
    }
  }

  // Bulk process raw flights, calculate scores, manage coordinate trails, and upsert
  async function processAndCacheFlights(acItems) {
    if (acItems.length === 0) return;

    // Fetch existing flights first to extract existing trails and prevent losing path history
    const hexCodes = acItems.map(item => item.hex).filter(Boolean);
    const { data: existingFlights } = await supabase
      .from('monitored_flights')
      .select('hex, trail')
      .in('hex', hexCodes);

    const existingTrailsMap = {};
    if (existingFlights) {
      existingFlights.forEach(f => {
        existingTrailsMap[f.hex] = f.trail || [];
      });
    }

    const recordsToUpsert = acItems.map(acItem => {
      // 2. Optimize the Data Mapping Layer with solid fallbacks
      const callsign = acItem.flight ? acItem.flight.trim() : "UNTK";
      const squawk = acItem.squawk || "0000";
      const reg = acItem.r || "UNKNOWN";
      const type = acItem.t || "UNKNOWN";
      const desc = acItem.desc || "";
      const isMil = acItem.dbFlags === 1 || (acItem.category && acItem.category.startsWith('A')); // basic heuristic
      
      // Extract numeric values safely
      const rawAlt = acItem.alt_baro;
      const alt = (rawAlt === "ground" || rawAlt === undefined || rawAlt === null) ? 0 : parseInt(rawAlt, 10);
      const speed = acItem.gs ? parseFloat(acItem.gs) : 0;
      const lat = acItem.lat;
      const lon = acItem.lon;
      const baro_rate = acItem.baro_rate ? parseFloat(acItem.baro_rate) : 0;
      const emergency = acItem.emergency || "none";

      if (!lat || !lon) return null; // Drop invalid coordinate vectors

      // Scoring engine
      let score = 0;
      // High weight for emergencies
      if (squawk === "7700" || squawk === "7600" || squawk === "7500" || emergency !== "none") {
        score += 10000;
      }
      // Military/Rare Airframes
      if (isMil) {
        score += 2000;
      }
      // Heavy airframe
      if (desc.includes("C-17") || desc.includes("C-5") || desc.includes("B-52") || type === "A388" || type === "B748") {
        score += 1500;
      }
      // Rapid climb/descent rate (rapid altitude change)
      if (Math.abs(baro_rate) > 2000) {
        score += 800;
      }
      // Speed bonus
      if (speed > 450) {
        score += Math.round(speed / 10);
      }

      // Build trail point: [lat, lon, alt, timestamp]
      const oldTrail = existingTrailsMap[acItem.hex] || [];
      const newPoint = [lat, lon, alt, Date.now()];
      
      // Update trail and limit size to TRAIL_MAX (20) to prevent overhead
      const newTrail = [...oldTrail, newPoint];
      if (newTrail.length > TRAIL_MAX) {
        newTrail.shift();
      }

      return {
        hex: acItem.hex,
        callsign,
        registration: reg,
        type,
        desc_text: desc,
        alt_baro: alt,
        gs: speed,
        squawk,
        emergency,
        lat,
        lon,
        baro_rate,
        trail: newTrail,
        score,
        last_seen: new Date().toISOString()
      };
    }).filter(Boolean);

    if (recordsToUpsert.length === 0) return;

    // Supabase upsert payload
    const chunks = chunkArray(recordsToUpsert, 50); // chunk upserts to avoid overloading
    for (const chunk of chunks) {
      await supabase
        .from('monitored_flights')
        .upsert(chunk, { onConflict: 'hex' });
    }
  }

  function chunkArray(array, size) {
    const result = [];
    for (let i = 0; i < array.length; i += size) {
      result.push(array.slice(i, i + size));
    }
    return result;
  }

  // Update Statistics Banner
  function updateStats(totalRaw, top20) {
    statTotal.innerText = totalRaw;
    
    // Count active emergencies in the payload
    const emergenciesCount = top20.filter(f => f.squawk === "7700" || f.squawk === "7600" || f.squawk === "7500" || f.emergency !== "none").length;
    statEmergencies.innerText = emergenciesCount;
    if (emergenciesCount > 0) {
      statEmergencies.classList.add('glow-text-red');
    } else {
      statEmergencies.classList.remove('glow-text-red');
    }

    // Count military (basic score category heuristic or regex)
    const militaryCount = top20.filter(f => f.score >= 2000).length;
    statMilitary.innerText = militaryCount;
  }

  // Render Table
  function renderFlightsTable() {
    tableBody.innerHTML = '';
    
    if (flights.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-tacticalGreen/40">No critical airframes logged.</td></tr>`;
      return;
    }

    flights.forEach(f => {
      const isEmergency = f.squawk === "7700" || f.squawk === "7600" || f.squawk === "7500" || f.emergency !== "none";
      const rowClass = selectedFlightHex === f.hex 
        ? 'bg-tacticalGreen/20 text-tacticalGreen border-l-2 border-tacticalGreen font-bold cursor-pointer'
        : isEmergency 
          ? 'text-tacticalRed bg-tacticalRed/10 border-l-2 border-tacticalRed hover:bg-tacticalRed/20 cursor-pointer animate-pulse'
          : 'hover:bg-tacticalGreen/5 cursor-pointer border-b border-tacticalGreen/5';

      const tr = document.createElement('tr');
      tr.className = rowClass;
      tr.innerHTML = `
        <td class="p-2">${f.callsign}</td>
        <td class="p-2">${f.squawk}</td>
        <td class="p-2">${f.alt_baro.toLocaleString()}</td>
        <td class="p-2">${Math.round(f.gs)}</td>
        <td class="p-2">${f.type}</td>
      `;

      tr.addEventListener('click', () => {
        selectFlight(f);
      });

      tableBody.appendChild(tr);
    });
  }

  function selectFlight(f) {
    selectedFlightHex = f.hex;
    camera.isLocked = true;
    
    // Highlight details card
    detailCard.classList.remove('hidden');
    document.getElementById('detail-callsign').innerText = f.callsign;
    document.getElementById('detail-hex').innerText = `HEX: ${f.hex.toUpperCase()}`;
    document.getElementById('detail-reg').innerText = f.registration;
    document.getElementById('detail-type').innerText = `${f.type} (${f.desc_text || 'UNKNOWN'})`;
    document.getElementById('detail-alt').innerText = `${f.alt_baro.toLocaleString()} ft`;
    document.getElementById('detail-speed').innerText = `${Math.round(f.gs)} kt`;
    document.getElementById('detail-vs').innerText = `${f.baro_rate > 0 ? '+' : ''}${f.baro_rate.toLocaleString()} fpm`;
    document.getElementById('detail-coords').innerText = `${f.lat.toFixed(4)}, ${f.lon.toFixed(4)}`;

    const squawkBadge = document.getElementById('detail-squawk-badge');
    squawkBadge.innerText = `SQUAWK ${f.squawk}`;
    if (f.squawk === "7700" || f.squawk === "7600" || f.squawk === "7500") {
      squawkBadge.className = "px-2 py-0.5 border border-tacticalRed text-[10px] font-bold text-tacticalRed bg-tacticalRed/10 rounded";
    } else {
      squawkBadge.className = "px-2 py-0.5 border border-tacticalGreen text-[10px] font-bold text-tacticalGreen bg-tacticalGreen/10 rounded";
    }

    // Recalculate table highlighting
    renderFlightsTable();
  }

  // Latitude / Longitude projection to 2D Canvas coordinate mapping
  function latLonToCanvas(lat, lon, width, height) {
    // Simple Equirectangular Projection scaled to fit canvas radius
    // Center projection at the origin point
    const r = Math.min(width, height) * 0.45;
    
    const dLat = (lat - originLat) * (Math.PI / 180);
    const dLon = (lon - originLon) * (Math.PI / 180);

    // Map longitude to x-axis, latitude to y-axis (inverted screen coordinates)
    const x = dLon * Math.cos(originLat * Math.PI / 180) * 111320; // in meters approx
    const y = -dLat * 111320; 

    // Scale down factor
    const scaleFactor = 0.003 * camera.zoom;
    return {
      x: x * scaleFactor + camera.x,
      y: y * scaleFactor + camera.y
    };
  }

  // Main high-performance Canvas Frame Rendering loop
  function animate() {
    requestAnimationFrame(animate);
    
    const w = canvas.width / window.devicePixelRatio;
    const h = canvas.height / window.devicePixelRatio;
    const cx = w / 2;
    const cy = h / 2;

    // Smooth Camera Panning LERPing
    camera.x += (camera.targetX - camera.x) * camera.lerpFactor;
    camera.y += (camera.targetY - camera.y) * camera.lerpFactor;
    camera.zoom += (camera.targetZoom - camera.zoom) * camera.lerpFactor;

    // If camera is locked onto a selected plane, continuously LERP camera target coordinates
    if (camera.isLocked && selectedFlightHex) {
      const targetPlane = flights.find(f => f.hex === selectedFlightHex);
      if (targetPlane) {
        // Calculate where the plane would sit on screen relative to camera 0 offset
        // We want to shift the target camera offset so the plane stays exactly centered at (cx, cy)
        const scaleFactor = 0.003 * camera.zoom;
        const dLat = (targetPlane.lat - originLat) * (Math.PI / 180);
        const dLon = (targetPlane.lon - originLon) * (Math.PI / 180);
        const xMeters = dLon * Math.cos(originLat * Math.PI / 180) * 111320;
        const yMeters = -dLat * 111320;

        camera.targetX = -xMeters * scaleFactor;
        camera.targetY = -yMeters * scaleFactor;
      }
    }

    // 3. Restrict Canvas State Overhead: Alpha decay sweep + clear rect
    // We clear the canvas and paint the premium matrix elements
    ctx.clearRect(0, 0, w, h);

    // Render Radar Background Circle and concentric rings
    ctx.fillStyle = '#030a05';
    ctx.beginPath();
    ctx.arc(cx, cy, cx * 0.95, 0, Math.PI * 2);
    ctx.fill();

    // Concentric Grid Rings
    ctx.strokeStyle = 'rgba(0, 255, 102, 0.1)';
    ctx.lineWidth = 1;
    for (let r = 0.2; r < 1.0; r += 0.2) {
      ctx.beginPath();
      ctx.arc(cx, cy, cx * 0.95 * r, 0, Math.PI * 2);
      ctx.stroke();
      
      // Range Ring Text Labels
      ctx.fillStyle = 'rgba(0, 255, 102, 0.4)';
      ctx.font = '8px monospace';
      ctx.fillText(`${Math.round(r * 150)}NM`, cx + cx * 0.95 * r + 2, cy - 2);
    }

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(cx - cx * 0.95, cy);
    ctx.lineTo(cx + cx * 0.95, cy);
    ctx.moveTo(cx, cy - cy * 0.95);
    ctx.lineTo(cx, cy + cy * 0.95);
    ctx.stroke();

    // Draw Radar Sweep line
    sweepAngle = (sweepAngle + 0.005) % (Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 255, 102, 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(
      cx + Math.cos(sweepAngle) * cx * 0.95,
      cy + Math.sin(sweepAngle) * cy * 0.95
    );
    ctx.stroke();

    // Draw active flights and their vector tails
    flights.forEach(f => {
      const pos = latLonToCanvas(f.lat, f.lon, w, h);
      const screenX = cx + pos.x;
      const screenY = cy + pos.y;
      
      // Check if coordinate sits inside the radar circle bounds
      const distFromCenter = Math.sqrt((screenX - cx) ** 2 + (screenY - cy) ** 2);
      if (distFromCenter > cx * 0.95) return; // clip targets outside tactical circle

      const isEmergency = f.squawk === "7700" || f.squawk === "7600" || f.squawk === "7500" || f.emergency !== "none";
      const isSelected = selectedFlightHex === f.hex;

      // Draw Flight Trail line
      if (f.trail && f.trail.length > 1) {
        ctx.strokeStyle = isEmergency ? 'rgba(255, 51, 51, 0.3)' : 'rgba(0, 255, 102, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        
        f.trail.forEach((pt, idx) => {
          const ptPos = latLonToCanvas(pt[0], pt[1], w, h);
          const px = cx + ptPos.x;
          const py = cy + ptPos.y;
          
          if (idx === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        });
        ctx.stroke();
      }

      // Draw target blip
      ctx.fillStyle = isEmergency ? '#ff3333' : isSelected ? '#00ff66' : 'rgba(0, 255, 102, 0.8)';
      ctx.beginPath();
      ctx.arc(screenX, screenY, isSelected ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();

      // Blip glow
      ctx.fillStyle = isEmergency ? 'rgba(255, 51, 51, 0.3)' : 'rgba(0, 255, 102, 0.2)';
      ctx.beginPath();
      ctx.arc(screenX, screenY, isSelected ? 8 : 6, 0, Math.PI * 2);
      ctx.fill();

      // Target Label
      ctx.fillStyle = isEmergency ? '#ff3333' : isSelected ? '#00ff66' : '#c0d0c5';
      ctx.font = isSelected ? 'bold 9px monospace' : '8px monospace';
      const textOffset = 8;
      ctx.fillText(f.callsign, screenX + textOffset, screenY - 2);
      ctx.fillText(`FL${Math.round(f.alt_baro / 100)}`, screenX + textOffset, screenY + 6);

      // Draw Target Lock Reticle if selected
      if (isSelected) {
        ctx.strokeStyle = '#00ff66';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(screenX, screenY, 12, 0, Math.PI * 2);
        ctx.stroke();
        
        // crosshairs ticks on the selection reticle
        ctx.beginPath();
        ctx.moveTo(screenX - 16, screenY);
        ctx.lineTo(screenX - 10, screenY);
        ctx.moveTo(screenX + 10, screenY);
        ctx.lineTo(screenX + 16, screenY);
        ctx.moveTo(screenX, screenY - 16);
        ctx.lineTo(screenX, screenY - 10);
        ctx.moveTo(screenX, screenY + 10);
        ctx.lineTo(screenX, screenY + 16);
        ctx.stroke();
      }
    });

    // Outer border ring for HUD appearance
    ctx.strokeStyle = '#00ff66';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, cx * 0.95, 0, Math.PI * 2);
    ctx.stroke();
  }
})();
