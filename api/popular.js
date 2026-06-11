import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    let hexList = [];

    // Attempt to fetch from public airplanes.live / adsb.fi globe popularity JSON
    const popularUrls = [
      'https://globe.airplanes.live/data/popular.json',
      'https://globe.adsb.fi/data/popular.json'
    ];

    for (const url of popularUrls) {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          signal: AbortSignal.timeout(4000)
        });

        if (response.ok) {
          const data = await response.json();
          // The popular.json is usually an array: [{"hex":"a1b2c3","count":12}, ...]
          if (Array.isArray(data)) {
            hexList = data.slice(0, 20).map(item => item.hex).filter(Boolean);
            if (hexList.length > 0) break;
          }
        }
      } catch (err) {
        console.warn(`Failed to fetch popular flights from ${url}:`, err.message);
      }
    }

    let popularFlights = [];

    if (hexList.length > 0) {
      // Query the details for these popular hexes in a single bulk request
      const hexCsv = hexList.join(',');
      const detailRes = await fetch(`https://api.airplanes.live/v2/hex/${hexCsv}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (detailRes.ok) {
        const detailData = await detailRes.json();
        const acList = detailData.ac || [];
        popularFlights = acList.map(acItem => {
          const rawAlt = acItem.alt_baro;
          const alt = (rawAlt === "ground" || rawAlt === undefined || rawAlt === null) ? 0 : parseInt(rawAlt, 10);
          return {
            hex: acItem.hex,
            callsign: acItem.flight ? acItem.flight.trim() : "UNTK",
            registration: acItem.r || "UNKNOWN",
            type: acItem.t || "UNKNOWN",
            desc_text: acItem.desc || "",
            alt_baro: alt,
            gs: acItem.gs ? parseFloat(acItem.gs) : 0,
            squawk: acItem.squawk || "0000",
            emergency: acItem.emergency || "none",
            lat: acItem.lat,
            lon: acItem.lon,
            baro_rate: acItem.baro_rate ? parseFloat(acItem.baro_rate) : 0
          };
        });
      }
    }

    // Fallback: If no popular flights could be parsed from external servers (e.g., due to Cloudflare blocks),
    // fetch military flights and treat them as the popular list to keep the UI fully functional
    if (popularFlights.length === 0) {
      console.log('Using military flights fallback for popular list...');
      const fallbackRes = await fetch('https://api.airplanes.live/v2/mil', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        const acList = (fallbackData.ac || []).slice(0, 20);
        popularFlights = acList.map(acItem => {
          const rawAlt = acItem.alt_baro;
          const alt = (rawAlt === "ground" || rawAlt === undefined || rawAlt === null) ? 0 : parseInt(rawAlt, 10);
          return {
            hex: acItem.hex,
            callsign: acItem.flight ? acItem.flight.trim() : "UNTK",
            registration: acItem.r || "UNKNOWN",
            type: acItem.t || "UNKNOWN",
            desc_text: acItem.desc || "",
            alt_baro: alt,
            gs: acItem.gs ? parseFloat(acItem.gs) : 0,
            squawk: acItem.squawk || "0000",
            emergency: acItem.emergency || "none",
            lat: acItem.lat,
            lon: acItem.lon,
            baro_rate: acItem.baro_rate ? parseFloat(acItem.baro_rate) : 0
          };
        });
      }
    }

    // Return the formatted results
    return res.status(200).json({
      status: 'success',
      flights: popularFlights,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('Popular flights fetching failed:', err);
    return res.status(500).json({ error: err.message });
  }
}
