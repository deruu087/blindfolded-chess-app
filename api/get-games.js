// Vercel API function for getting games
import fs from 'fs';
import path from 'path';

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
            // Read from custom-games.json file
            const filePath = path.join(process.cwd(), 'custom-games.json');
            
            if (fs.existsSync(filePath)) {
                const fileContent = fs.readFileSync(filePath, 'utf8');
                const data = JSON.parse(fileContent);
                res.status(200).json({ games: data.games || [] });
            } else {
                // Return empty array if file doesn't exist
                res.status(200).json({ games: [] });
            }
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
