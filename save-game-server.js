#!/usr/bin/env node

import http from 'http';
import fs from 'fs';
import path from 'path';
import url from 'url';
import { fileURLToPath } from 'url';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the custom-games.json file
const customGamesPath = path.join(__dirname, 'games', 'custom-games.json');

// Function to save game to JSON file
function saveGameToFile(gameData) {
    try {
        // Read the current custom-games.json file
        let customGamesData = { games: [] };
        
        if (fs.existsSync(customGamesPath)) {
            const fileContent = fs.readFileSync(customGamesPath, 'utf8');
            customGamesData = JSON.parse(fileContent);
        }
        
        // Add the new game
        customGamesData.games.push(gameData);
        
        // Write back to the file
        fs.writeFileSync(customGamesPath, JSON.stringify(customGamesData, null, 2));
        
        console.log('✅ Game saved to games/custom-games.json');
        console.log('Game ID:', gameData.id);
        console.log('Total games now:', customGamesData.games.length);
        
        return true;
    } catch (error) {
        console.error('❌ Error saving game:', error.message);
        return false;
    }
}

// Create HTTP server
const server = http.createServer((req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    const parsedUrl = url.parse(req.url, true);
    
    if (parsedUrl.pathname === '/save-game' && req.method === 'POST') {
        let body = '';
        
        req.on('data', chunk => {
            body += chunk.toString();
        });
        
        req.on('end', () => {
            try {
                const gameData = JSON.parse(body);
                const success = saveGameToFile(gameData);
                
                res.writeHead(success ? 200 : 500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    success: success, 
                    message: success ? 'Game saved successfully' : 'Failed to save game' 
                }));
            } catch (error) {
                console.error('Error parsing request:', error);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Invalid JSON data' }));
            }
        });
    } else if (parsedUrl.pathname === '/get-games' && req.method === 'GET') {
        try {
            let customGamesData = { games: [] };
            
            if (fs.existsSync(customGamesPath)) {
                const fileContent = fs.readFileSync(customGamesPath, 'utf8');
                customGamesData = JSON.parse(fileContent);
            }
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(customGamesData));
        } catch (error) {
            console.error('Error reading games:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Failed to read games' }));
        }
    } else if (parsedUrl.pathname.startsWith('/delete-game/') && req.method === 'DELETE') {
        const gameId = parsedUrl.pathname.split('/')[2];
        console.log('Received request to delete game:', gameId);
        
        try {
            let customGamesData = { games: [] };
            
            if (fs.existsSync(customGamesPath)) {
                const fileContent = fs.readFileSync(customGamesPath, 'utf8');
                customGamesData = JSON.parse(fileContent);
            }
            
            // Find the game index
            const gameIndex = customGamesData.games.findIndex(game => game.id === gameId);
            
            if (gameIndex === -1) {
                console.log('Game not found:', gameId);
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Game not found.' }));
                return;
            }
            
            // Remove the game
            const deletedGame = customGamesData.games.splice(gameIndex, 1)[0];
            console.log('Deleted game:', deletedGame.id);
            
            // Save the updated data
            fs.writeFileSync(customGamesPath, JSON.stringify(customGamesData, null, 2));
            console.log('✅ Game deleted from games/custom-games.json');
            console.log('Total games now:', customGamesData.games.length);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Game deleted successfully!' }));
        } catch (error) {
            console.error('❌ Error deleting game:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Failed to delete game.' }));
        }
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Not found' }));
    }
});

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`🚀 Save Game Server running on http://localhost:${PORT}`);
    console.log('📁 Will save games to:', customGamesPath);
    console.log('📝 Endpoints:');
    console.log('  POST /save-game - Save a game');
    console.log('  GET /get-games - Get all games');
    console.log('  DELETE /delete-game/:id - Delete a game');
});
