export default function handler(req, res) {
  // Retrieve environment variables securely on Vercel server-side
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_KEY || process.env.SUPABASE_KEY || '';

  // Return them to the client-side app
  return res.status(200).json({
    supabaseUrl: url,
    supabaseKey: key
  });
}
