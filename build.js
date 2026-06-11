const fs = require('fs');
const path = require('path');

const appJsPath = path.join(__dirname, 'app.js');
let content = fs.readFileSync(appJsPath, 'utf8');

// Fallback to non-prefixed Vercel system tokens if needed
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const key = process.env.NEXT_PUBLIC_SUPABASE_KEY || process.env.SUPABASE_KEY || '';

content = content.replace(/__NEXT_PUBLIC_SUPABASE_URL__/g, url);
content = content.replace(/__NEXT_PUBLIC_SUPABASE_KEY__/g, key);

fs.writeFileSync(appJsPath, content, 'utf8');
console.log('Build Injection Successful.');
