# 🛰️ AIRSPACE-WATCH // TAC-SCOPE OPERATOR HANDBOOK

```text
========================================================================
    ___    ____ ____   _____ ____  ___   ______ ______   _      __  ___  ______  ______  __  __
   /   |  /  _// __ \ / ___// __ \/   | / ____// ____/  | | /| / / /   |/_  __/_  __/ / / / / /
  / /| |  / / / /_/ / \__ \/ /_/ / /| |/ /    / __/    | |/ |/ / / /| | / /   / / / /_/ /_/ / 
 / ___ |_/ / / _, _/ ___/ / ____/ ___ / /___ / /___    |  /|  / / ___ |/ /   / / / __  /__  /  
/_/  |_/___//_/ |_|/____//_/   /_/  |_\____//_____/    |__/|__/ /_/  |_/_/   /_/ /_/ /_/ /_/   
                                                                                               
                     -- TACTICAL FLIGHT TELEMETRY SYSTEM v1.0.0 --
========================================================================
```

> **Live Space Link**: [Access Radar Control Console](https://air-space-watch.vercel.app)

---

## 📡 SYSTEM OVERVIEW

**Airspace-Watch** is a high-performance, dark-themed airspace surveillance dashboard styled after retro-tactical air traffic control interfaces. Built with a responsive 2D canvas radar scope and linked to a live Supabase database telemetry caching engine, the console retrieves, filters, scores, and tracks global airspace operations to highlight critical or high-priority airframe vectors in real-time.

```text
+-----------------------------------------------------------------------+
|  [RADAR DISPLAY CONTROL]                                               |
|  * 2D Tactical Sweep (concentric rings, heading lines)               |
|  * Real-Time Coordinate Projection Mapping                            |
|  * Interactive Focus (LERP camera lock-on + coordinate centering)    |
|  * Coordinate History Trails (Capped vector trails at 20 frames)       |
+-----------------------------------------------------------------------+
```

---

## ⚡ CORE FEATURES

### 🛡️ Tactical Canvas Radar Visualizer
* **Continuous Sweep Effect**: An animated glowing sweep line rotates continuously, highlighting active aircraft targets as it passes them.
* **Vector Trailing (Decay Trails)**: Visualizes historical flight paths with line segments connecting coordinate history points, utilizing alpha decay to keep tracking visualizer lines clean and performant.
* **Camera Controls**: Supports click-and-drag panning, zoom-in, zoom-out, and auto-recenter options to control the tactical radar viewport.
* **Auto-Centering Camera Lock**: Clicking any flight row in the tabular log centers and locks the camera view onto that flight, tracking its movements dynamically via LERP (Linear Interpolation) interpolation.

### 📋 Live Critical Log Table (Top 20)
* **Real-Time Priority Feed**: Lists the top 20 most critical or unique airframe targets currently tracked, updated automatically.
* **Visual Alert Tones**: High-priority records (active emergency squawks like 7700, 7600, or 7500) flash in tactical red to command operator attention.
* **Detailed Vector Breakdown**: Click-selecting a target displays a comprehensive HUD card highlighting registration info, aircraft description, barometric rate, ground speed, and coordinates.

### 📊 Ingestion Scoring Engine
The system parses active aviation feeds (`airplanes.live` and `adsb.lol`) and scores airframes dynamically to surface critical traffic:
* **Active Emergency Squawks (7700 / 7600 / 7500)**: $+10,000$ priority units.
* **Military Registrations / Transponders**: $+2,000$ priority units.
* **Heavy/Rare Airframes (B-52, C-17, C-5, A380, etc.)**: $+1,500$ priority units.
* **Rapid Vertical Ascent/Descent (>2000 fpm)**: $+800$ priority units.
* **High Ground Speed (>450 knots)**: Speed proportional scaling units.

### 🔌 Intelligent Credential Mapping
* **Dynamic API Credentials Access**: Automatically queries a secure server-side endpoint `/api/config` to check for Vercel environment variables first, bypassing setup prompts entirely in private/incognito tabs if variables are configured.
* **Local Session Overrides**: A "RE-CONFIG" panel allows manual entry and override of Supabase credentials saved safely to `localStorage`.

---

## 📂 FILE TOPOLOGY

```text
AirSpace-Watch/
├── api/
│   ├── config.js         # Serves runtime environment variables securely
│   └── ingest.js         # Optional background API telemetry database ingest
├── app.js                # Canvas render loop, scoring engine, panning controls, Supabase client
├── build.js              # Standalone Node script to override local placeholders
├── index.html            # Core grid layout wrapper with Tailwind CSS CDN
├── package.json          # Node dependencies and Vercel build phase target script
├── schema.sql            # Database schema, indexing, and anonymous RLS setup
├── style.css             # CRT overlay, matrices green, glow effects, scrollbar custom styling
└── vercel.json           # Output redirection rules to deploy from project root
```

---

```text
========================================================================
                // SECURE LOG TRANSMISSION CONCLUDED //
========================================================================
```
