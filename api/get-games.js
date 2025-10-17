// Vercel API function for getting games
// Note: Vercel serverless functions have read-only file system
// This uses shared storage for now. For production, use a database like Supabase

import { customGames } from './shared-storage.js';

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
            res.status(200).json({ games: customGames });
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
