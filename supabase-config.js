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
    
    // Return existing client if already created (prevent multiple instances)
    if (supabaseClient) {
        console.log('✅ Using existing Supabase client');
        return supabaseClient;
    }
    
    // Configure with explicit storage settings for production compatibility
    // CRITICAL: Ensure client is properly configured - AbortError suggests client not ready
    try {
        supabaseClient = supabase.createClient(configCache.url, configCache.anonKey, {
            auth: {
                storage: window.localStorage, // Explicitly use localStorage
                autoRefreshToken: true,      // Enable automatic token refresh
                persistSession: true,        // Persist sessions across page reloads
                detectSessionInUrl: true    // Detect OAuth callbacks in URL hash
            }
        });
        
        // Verify client is properly initialized
        if (!supabaseClient || !supabaseClient.auth) {
            throw new Error('Supabase client created but auth is not available');
        }
        
        // CRITICAL: Wait for client to be fully ready before returning
        // The AbortError in _acquireLock/initialize suggests the client is being used 
        // before internal initialization completes. Wait for internal locks to be released.
        // In production, this takes longer because the client is created after async API fetch.
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const initWaitTime = isLocalhost ? 100 : 500; // Longer wait in production
        console.log(`⏳ Waiting ${initWaitTime}ms for Supabase client internal initialization...`);
        await new Promise(resolve => setTimeout(resolve, initWaitTime));
        
        // Verify client structure (lightweight check)
        if (typeof supabaseClient.auth.getSession !== 'function') {
            throw new Error('getSession is not a function - client not properly initialized');
        }
        
        console.log('✅ Supabase client initialized successfully');
        console.log('🔍 Supabase client verification:', {
            url: configCache.url,
            hasAuth: !!supabaseClient.auth,
            hasStorage: !!supabaseClient.auth.storage,
            hasGetSession: typeof supabaseClient.auth.getSession === 'function',
            hasSetSession: typeof supabaseClient.auth.setSession === 'function'
        });
        
        return supabaseClient;
    } catch (error) {
        console.error('❌ Failed to create Supabase client:', error);
        console.error('❌ Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack?.substring(0, 200)
        });
        return null;
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { initSupabase, getSupabase: () => supabaseClient };
}

// For browser usage
window.initSupabase = initSupabase;
window.getSupabase = () => supabaseClient;
