// Clean, minimal Supabase authentication
// Single source of truth - Supabase session only

/**
 * Sign in with email and password
 */
async function signInWithEmail(email, password) {
    const supabase = getSupabase();
    if (!supabase) {
        return { success: false, error: 'Supabase not initialized' };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
    });

    if (error) {
        return { success: false, error: error.message };
    }

    return { success: true, user: data.user, session: data.session };
}

/**
 * Sign up with email and password
 */
async function signUpWithEmail(email, password, name) {
    const supabase = getSupabase();
    if (!supabase) {
        return { success: false, error: 'Supabase not initialized' };
    }

    const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
            data: {
                name: name
            }
        }
    });

    if (error) {
        return { success: false, error: error.message };
    }

    return { success: true, user: data.user, session: data.session };
}

/**
 * Sign in with Google OAuth
 * Redirects to Google for authentication
 */
async function signInWithGoogle() {
    const supabase = getSupabase();
    if (!supabase) {
        return { success: false, error: 'Supabase not initialized' };
    }

    const redirectUrl = window.location.origin + window.location.pathname;
    
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: redirectUrl
        }
    });

    if (error) {
        return { success: false, error: error.message };
    }

    // Redirect to Google OAuth
    window.location.href = data.url;
    
    return { success: true, url: data.url };
}

/**
 * Sign out
 */
async function signOut() {
    const supabase = getSupabase();
    if (!supabase) {
        return { success: false, error: 'Supabase not initialized' };
    }

    const { error } = await supabase.auth.signOut();

    if (error) {
        return { success: false, error: error.message };
    }

    return { success: true };
}

/**
 * Get current session
 * Single source of truth for authentication state
 */
async function getSession() {
    const supabase = getSupabase();
    if (!supabase) {
        return null;
    }

    const { data, error } = await supabase.auth.getSession();
    
    if (error || !data.session) {
        return null;
    }

    return data.session;
}

/**
 * Get current user
 */
async function getCurrentUser() {
    const session = await getSession();
    return session?.user || null;
}

/**
 * Check if user is signed in
 */
async function isSignedIn() {
    const session = await getSession();
    return session !== null;
}

/**
 * Setup auth state change listener
 * Updates UI when auth state changes
 */
function setupAuthListener(callback) {
    const supabase = getSupabase();
    if (!supabase) {
        return;
    }

    supabase.auth.onAuthStateChange((event, session) => {
        // Redirect to profile on SIGNED_IN event
        if (event === 'SIGNED_IN' && session && session.user) {
            // Only redirect if we're not already on profile page
            if (window.location.pathname !== '/profile.html' && !window.location.pathname.endsWith('profile.html')) {
                window.location.href = 'profile.html';
                return;
            }
        }
        
        if (callback) {
            callback(event, session);
        }
    });
}

// Make functions available globally
window.signInWithEmail = signInWithEmail;
window.signUpWithEmail = signUpWithEmail;
window.signInWithGoogle = signInWithGoogle;
window.signOut = signOut;
window.getSession = getSession;
window.getCurrentUser = getCurrentUser;
window.isSignedIn = isSignedIn;
window.setupAuthListener = setupAuthListener;
