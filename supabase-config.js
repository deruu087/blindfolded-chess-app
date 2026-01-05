// Supabase configuration
// Replace these with your actual Supabase project credentials

// Get Supabase client from CDN (loaded in HTML)
// After you add the Supabase script to your HTML, you can access it via window.supabase

let supabaseClient = null;

// Initialize Supabase client
function initSupabase() {
    if (typeof supabase !== 'undefined') {
        // Your Supabase credentials
        const SUPABASE_URL = 'https://yaaxydrmuslgzjletzbw.supabase.co';
        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhYXh5ZHJtdXNsZ3pqbGV0emJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyOTQ3NjksImV4cCI6MjA3Nzg3MDc2OX0.uv4fqCgRxq7HCT5TWvFxq5xHOUNFT3PI4nmvhhPS2Qk';
        
        // Configure with explicit storage settings for production compatibility
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                storage: window.localStorage, // Explicitly use localStorage
                autoRefreshToken: true,      // Enable automatic token refresh
                persistSession: true,        // Persist sessions across page reloads
                detectSessionInUrl: true    // Detect OAuth callbacks in URL hash
            }
        });
        
        console.log('Supabase client initialized');
        return supabaseClient;
    } else {
        console.warn('Supabase library not loaded yet');
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
