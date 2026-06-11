import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Read env variables
  const sbUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!sbUrl || !sbKey) {
    return res.status(500).json({ error: 'Supabase credentials are not configured in Vercel environment variables.' });
  }

  try {
    const supabase = createClient(sbUrl, sbKey);
    const originLat = 37.7749;
    const originLon = -122.4194;

    // Fetch from public airplanes.live endpoint
    const flightResponse = await fetch(`https://api.airplanes.live/v2/point/${originLat}/${originLon}/250`);
    if (!flightResponse.ok) {
      throw new Error(`Aviation API HTTP Error: ${flightResponse.status}`);
    }

    const rawData = await flightResponse.json();
    const acItems = rawData.ac || [];

    if (acItems.length === 0) {
      return res.status(200).json({ status: 'success', message: 'No aircraft in range.' });
    }

    // Load existing trails
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
      const callsign = acItem.flight ? acItem.flight.trim() : "UNTK";
      const squawk = acItem.squawk || "0000";
      const reg = acItem.r || "UNKNOWN";
      const type = acItem.t || "UNKNOWN";
      const desc = acItem.desc || "";
      const isMil = acItem.dbFlags === 1 || (acItem.category && acItem.category.startsWith('A'));

      const rawAlt = acItem.alt_baro;
      const alt = (rawAlt === "ground" || rawAlt === undefined || rawAlt === null) ? 0 : parseInt(rawAlt, 10);
      const speed = acItem.gs ? parseFloat(acItem.gs) : 0;
      const lat = acItem.lat;
      const lon = acItem.lon;
      const baro_rate = acItem.baro_rate ? parseFloat(acItem.baro_rate) : 0;
      const emergency = acItem.emergency || "none";

      if (!lat || !lon) return null;

      // Calculate Priority Score
      let score = 0;
      if (squawk === "7700" || squawk === "7600" || squawk === "7500" || emergency !== "none") {
        score += 10000;
      }
      if (isMil) {
        score += 2000;
      }
      if (desc.includes("C-17") || desc.includes("C-5") || desc.includes("B-52") || type === "A388" || type === "B748") {
        score += 1500;
      }
      if (Math.abs(baro_rate) > 2000) {
        score += 800;
      }
      if (speed > 450) {
        score += Math.round(speed / 10);
      }

      const oldTrail = existingTrailsMap[acItem.hex] || [];
      const newPoint = [lat, lon, alt, Date.now()];
      const newTrail = [...oldTrail, newPoint];
      if (newTrail.length > 20) {
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

    if (recordsToUpsert.length > 0) {
      await supabase
        .from('monitored_flights')
        .upsert(recordsToUpsert, { onConflict: 'hex' });
    }

    return res.status(200).json({
      status: 'success',
      ingestedCount: recordsToUpsert.length,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('API Ingestion failed:', err);
    return res.status(500).json({ error: err.message });
  }
}
