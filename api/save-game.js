// Vercel API function for saving games
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
    
    if (req.method === 'POST') {
        try {
            const gameData = req.body;
            
            // Add timestamp if not present
            if (!gameData.timestamp) {
                gameData.timestamp = new Date().toISOString();
            }
            
            // Read existing games from file
            const filePath = path.join(process.cwd(), 'custom-games.json');
            let games = [];
            
            if (fs.existsSync(filePath)) {
                const fileContent = fs.readFileSync(filePath, 'utf8');
                const data = JSON.parse(fileContent);
                games = data.games || [];
            }
            
            // Add new game
            games.push(gameData);
            
            // Write back to file
            const updatedData = { games: games };
            fs.writeFileSync(filePath, JSON.stringify(updatedData, null, 2));
            
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
