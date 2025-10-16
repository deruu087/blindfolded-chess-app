// Vercel API function for deleting games
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
    
    if (req.method === 'DELETE') {
        try {
            const { id } = req.query;
            
            if (!id) {
                res.status(400).json({ 
                    success: false, 
                    message: 'Game ID is required' 
                });
                return;
            }
            
            // Find the game index
            const gameIndex = games.findIndex(game => game.id === id);
            
            if (gameIndex === -1) {
                res.status(404).json({ 
                    success: false, 
                    message: 'Game not found' 
                });
                return;
            }
            
            // Remove the game
            const deletedGame = games.splice(gameIndex, 1)[0];
            console.log('✅ Game deleted:', deletedGame.id);
            console.log('Total games now:', games.length);
            
            res.status(200).json({ 
                success: true, 
                message: 'Game deleted successfully!' 
            });
        } catch (error) {
            console.error('Error deleting game:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to delete game' 
            });
        }
    } else {
        res.status(405).json({ 
            success: false, 
            message: 'Method not allowed' 
        });
    }
}
