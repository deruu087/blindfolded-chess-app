// Vercel API function for deleting games
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
            
            // Read existing games from file
            const filePath = path.join(process.cwd(), 'custom-games.json');
            let games = [];
            
            if (fs.existsSync(filePath)) {
                const fileContent = fs.readFileSync(filePath, 'utf8');
                const data = JSON.parse(fileContent);
                games = data.games || [];
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
            
            // Write back to file
            const updatedData = { games: games };
            fs.writeFileSync(filePath, JSON.stringify(updatedData, null, 2));
            
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
