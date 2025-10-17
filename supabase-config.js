// Supabase configuration
// Replace these with your actual Supabase project credentials

export const supabaseConfig = {
    url: 'YOUR_SUPABASE_URL',
    anonKey: 'YOUR_SUPABASE_ANON_KEY'
};

// For now, we'll use a simple in-memory storage as fallback
// This will be replaced with actual Supabase calls
export const fallbackStorage = {
    games: [],
    
    saveGame(gameData) {
        this.games.push(gameData);
        console.log('Game saved to fallback storage:', gameData.id);
    },
    
    getGames() {
        return this.games;
    },
    
    deleteGame(gameId) {
        const index = this.games.findIndex(game => game.id === gameId);
        if (index !== -1) {
            this.games.splice(index, 1);
            console.log('Game deleted from fallback storage:', gameId);
            return true;
        }
        return false;
    }
};
