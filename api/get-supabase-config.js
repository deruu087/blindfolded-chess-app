// Vercel serverless function to expose public Supabase config to browser
// This only returns the anon key (safe for browser), never the service role key

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    
    try {
        // Only return public keys (safe for browser)
        const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        
        if (!supabaseUrl || !supabaseAnonKey) {
            console.error('❌ Supabase environment variables not configured');
            return res.status(500).json({ 
                error: 'Server configuration error',
                message: 'Supabase environment variables are not set'
            });
        }
        
        // Return only public keys (never service role key)
        res.status(200).json({
            url: supabaseUrl,
            anonKey: supabaseAnonKey
        });
    } catch (error) {
        console.error('❌ Error getting Supabase config:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
}

