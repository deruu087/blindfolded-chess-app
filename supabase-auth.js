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

    // Check for existing session on initial load (handles OAuth redirect)
    supabase.auth.getSession().then(async ({ data, error }) => {
        if (!error && data.session && data.session.user) {
            const user = data.session.user;
            
            // Check if this is a new user and send welcome email (same logic as SIGNED_IN event)
            if (user.created_at) {
                const createdAt = new Date(user.created_at);
                const now = new Date();
                const minutesSinceCreation = (now - createdAt) / (1000 * 60);
                
                // If user was created within last 5 minutes, it's likely a new sign-up
                if (minutesSinceCreation < 5) {
                    const userName = user.user_metadata?.name || 
                                   user.user_metadata?.full_name || 
                                   user.email?.split('@')[0] || 
                                   'Chess Player';
                    
                    // Send welcome email (non-blocking, fire and forget)
                    if (typeof window.sendEmail === 'function' && user.email) {
                        window.sendEmail('welcome', user.email, userName).catch(err => {
                            console.warn('Failed to send welcome email (non-critical):', err);
                        });
                        console.log('📧 Welcome email queued for new user (initial session):', user.email);
                    }
                }
            }
            
            // Only redirect if user is on root path (/) or has empty hash (#)
            // This handles OAuth landing after Google login, but not normal navigation
            const isRootPath = window.location.pathname === '/';
            const isEmptyHash = window.location.hash === '#';
            
            if ((isRootPath || isEmptyHash) && window.location.pathname !== '/profile.html' && !window.location.pathname.endsWith('profile.html')) {
                window.location.replace('profile.html');
                return;
            }
        }
    });

    supabase.auth.onAuthStateChange(async (event, session) => {
        // Redirect to profile on SIGNED_IN event (for email login or future logins)
        if (event === 'SIGNED_IN' && session && session.user) {
            const user = session.user;
            
            // Check if this is a new user (created within last 5 minutes) and send welcome email
            // This handles both email sign-up and Google OAuth sign-up
            if (user.created_at) {
                const createdAt = new Date(user.created_at);
                const now = new Date();
                const minutesSinceCreation = (now - createdAt) / (1000 * 60);
                
                // If user was created within last 5 minutes, it's likely a new sign-up
                if (minutesSinceCreation < 5) {
                    // Check if user signed up with OAuth (Google) or email
                    const isOAuthUser = user.app_metadata?.provider === 'google' || 
                                       user.identities?.some(identity => identity.provider === 'google');
                    const isEmailUser = user.email && !isOAuthUser;
                    
                    // Get user name from metadata
                    const userName = user.user_metadata?.name || 
                                   user.user_metadata?.full_name || 
                                   user.email?.split('@')[0] || 
                                   'Chess Player';
                    
                    // Send welcome email (non-blocking, fire and forget)
                    if (typeof window.sendEmail === 'function' && user.email) {
                        window.sendEmail('welcome', user.email, userName).catch(err => {
                            console.warn('Failed to send welcome email (non-critical):', err);
                        });
                        console.log('📧 Welcome email queued for new user:', user.email);
                    }
                }
            }
            
            // Only redirect if we're not already on profile page
            if (window.location.pathname !== '/profile.html' && !window.location.pathname.endsWith('profile.html')) {
                window.location.replace('profile.html');
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
