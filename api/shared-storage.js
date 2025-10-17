// Shared storage for Vercel API functions
// This creates a global variable that persists across function calls

if (!global.customGames) {
    global.customGames = [];
}

export const customGames = global.customGames;
