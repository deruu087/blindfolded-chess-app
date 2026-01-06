// Supabase configuration
// Fetches public keys from API endpoint to use Vercel environment variables

let supabaseClient = null;
let configCache = null; // Cache config to avoid repeated fetches

// Initialize Supabase client
async function initSupabase() {
    if (typeof supabase === 'undefined') {
        console.warn('Supabase library not loaded yet');
        return null;
    }
    
    // Fetch config from API endpoint (uses Vercel environment variables)
    if (!configCache) {
        try {
            // Determine API URL based on environment
            // For localhost, try to detect if we're on port 3000 (Vercel dev) or use relative path
            const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            const apiUrl = isLocalhost && window.location.port === '3000'
                ? 'http://localhost:3000/api/get-supabase-config'
                : '/api/get-supabase-config';
            
            const response = await fetch(apiUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch Supabase config: ${response.status}`);
            }
            
            configCache = await response.json();
            console.log('✅ Supabase config loaded from API');
        } catch (error) {
            console.error('❌ Error fetching Supabase config:', error);
            
            // Only use hardcoded fallback on localhost (development)
            const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            
            if (isLocalhost) {
                console.error('⚠️ Falling back to hardcoded values (localhost only)');
                // Fallback only for localhost development
                configCache = {
                    url: 'https://yaaxydrmuslgzjletzbw.supabase.co',
                    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhYXh5ZHJtdXNsZ3pqbGV0emJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyOTQ3NjksImV4cCI6MjA3Nzg3MDc2OX0.uv4fqCgRxq7HCT5TWvFxq5xHOUNFT3PI4nmvhhPS2Qk'
                };
            } else {
                // Production: Don't use fallback - fail gracefully
                console.error('❌ Production: Cannot initialize Supabase without config from API');
                return null;
            }
        }
    }
    
    // Configure with explicit storage settings for production compatibility
    supabaseClient = supabase.createClient(configCache.url, configCache.anonKey, {
        auth: {
            storage: window.localStorage, // Explicitly use localStorage
            autoRefreshToken: true,      // Enable automatic token refresh
            persistSession: true,        // Persist sessions across page reloads
            detectSessionInUrl: true    // Detect OAuth callbacks in URL hash
        }
    });
    
    console.log('Supabase client initialized');
    return supabaseClient;
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { initSupabase, getSupabase: () => supabaseClient };
}

// For browser usage
window.initSupabase = initSupabase;
window.getSupabase = () => supabaseClient;
