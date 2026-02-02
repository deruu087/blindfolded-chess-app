// Configuration for API endpoints
// This will automatically detect if we're running locally or on Vercel

const isProduction = !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1');

export const API_BASE_URL = isProduction 
    ? '' // Use relative URLs in production (Vercel)
    : 'http://localhost:3001'; // Use local server in development

export const API_ENDPOINTS = {
    SAVE_GAME: isProduction ? '/api/save-game' : '/save-game',
    GET_GAMES: isProduction ? '/api/get-games' : '/get-games',
    DELETE_GAME: isProduction ? '/api/delete-game' : '/delete-game'
};
