-- Schema definition for Airspace-Watch database
-- Deploy this in your Supabase SQL Editor.

-- Create table to cache monitored flights
CREATE TABLE IF NOT EXISTS public.monitored_flights (
    hex VARCHAR(12) PRIMARY KEY, -- Mode S ICAO Hex code
    callsign VARCHAR(16) DEFAULT 'UNTK',
    registration VARCHAR(32) DEFAULT 'UNKNOWN',
    type VARCHAR(16) DEFAULT 'UNKNOWN',
    desc_text TEXT DEFAULT '',
    alt_baro INTEGER DEFAULT 0, -- Altitude in feet (0 if on ground)
    gs NUMERIC DEFAULT 0, -- Ground speed in knots
    squawk VARCHAR(8) DEFAULT '0000',
    emergency VARCHAR(32) DEFAULT 'none',
    lat NUMERIC,
    lon NUMERIC,
    baro_rate NUMERIC DEFAULT 0, -- Vertical rate
    trail JSONB DEFAULT '[]'::jsonb, -- History coordinates: [[lat, lon, alt, ts], ...]
    score NUMERIC DEFAULT 0, -- Priority score for sorting
    last_seen TIMESTAMPTZ DEFAULT NOW()
);

-- Index for high-performance sorting
CREATE INDEX IF NOT EXISTS idx_monitored_flights_score ON public.monitored_flights (score DESC);
CREATE INDEX IF NOT EXISTS idx_monitored_flights_last_seen ON public.monitored_flights (last_seen DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.monitored_flights ENABLE ROW LEVEL SECURITY;

-- Enable public read access
CREATE POLICY "Allow public read access"
ON public.monitored_flights
FOR SELECT
TO anon
USING (true);

-- Enable public write access (insert/update) for demonstration/dashboard updates
CREATE POLICY "Allow public insert access"
ON public.monitored_flights
FOR INSERT
TO anon
WITH CHECK (true);

CREATE POLICY "Allow public update access"
ON public.monitored_flights
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- Clean up stale flights (e.g. flights not updated in 5 minutes)
CREATE OR REPLACE FUNCTION clean_stale_flights() 
RETURNS trigger AS $$
BEGIN
    DELETE FROM public.monitored_flights WHERE last_seen < NOW() - INTERVAL '5 minutes';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
