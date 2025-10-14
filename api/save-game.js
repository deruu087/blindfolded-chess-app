// Vercel API function for saving games
// Note: This uses in-memory storage. For production, consider using a database like Supabase

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
    
    if (req.method === 'POST') {
        try {
            const gameData = req.body;
            
            // Add timestamp if not present
            if (!gameData.timestamp) {
                gameData.timestamp = new Date().toISOString();
            }
            
            // Add to in-memory storage
            games.push(gameData);
            
            console.log('✅ Game saved:', gameData.id);
            console.log('Total games now:', games.length);
            
            res.status(200).json({ 
                success: true, 
                message: 'Game saved successfully' 
            });
        } catch (error) {
            console.error('Error saving game:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to save game' 
            });
        }
    } else {
        res.status(405).json({ 
            success: false, 
            message: 'Method not allowed' 
        });
    }
}
