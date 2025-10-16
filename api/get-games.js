// Vercel API function for getting games
// Note: Vercel serverless functions have read-only file system
// This uses in-memory storage for now. For production, use a database like Supabase

// In-memory storage (resets on each deployment)
let games = [];

export default function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    if (req.method === 'GET') {
        try {
            res.status(200).json({ games: games });
        } catch (error) {
            console.error('Error getting games:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to get games' 
            });
        }
    } else {
        res.status(405).json({ 
            success: false, 
            message: 'Method not allowed' 
        });
    }
}
