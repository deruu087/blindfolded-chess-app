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

    // If user was created, signup succeeded - ignore any warnings/errors
    // (Supabase may return database trigger warnings even when signup succeeds)
    if (data?.user) {
        return { success: true, user: data.user, session: data.session };
    }

    // Only treat as failure if user was NOT created
    if (error) {
        return { success: false, error: error.message };
    }

    // Fallback: no user and no error (shouldn't happen)
    return { success: false, error: 'Registration failed - no user created' };
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
    
    // Mark that we're initiating OAuth flow
    sessionStorage.setItem('oauth_initiated', 'true');
    
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: redirectUrl
        }
    });

    if (error) {
        sessionStorage.removeItem('oauth_initiated');
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

    // Clear OAuth flags on sign out
    sessionStorage.removeItem('oauth_initiated');
    sessionStorage.removeItem('oauth_callback_processed');
    
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
 * Check if current URL is an OAuth callback
 * OAuth callbacks have access_token or code in URL hash or query params
 */
function isOAuthCallback() {
    const hash = window.location.hash;
    const search = window.location.search;
    
    // Check hash for OAuth tokens
    if (hash) {
        if (hash.includes('access_token=') || hash.includes('code=') || hash.includes('type=recovery')) {
            return true;
        }
    }
    
    // Check query params for OAuth tokens
    if (search) {
        const params = new URLSearchParams(search);
        if (params.has('code') || params.has('access_token')) {
            return true;
        }
    }
    
    return false;
}

// Global flag to prevent multiple auth listeners
let authListenerSetup = false;
let authStateChangeSubscription = null;

/**
 * Setup auth state change listener
 * Updates UI when auth state changes
 * Only sets up once to prevent duplicate listeners
 */
function setupAuthListener(callback) {
    const supabase = getSupabase();
    if (!supabase) {
        return;
    }

    // Prevent multiple listeners from being set up
    if (authListenerSetup && authStateChangeSubscription) {
        console.log('⚠️ Auth listener already set up, skipping duplicate setup');
        if (callback) {
            // Still call the callback for existing session
            supabase.auth.getSession().then(({ data }) => {
                if (data.session) {
                    callback('SIGNED_IN', data.session);
                }
            });
        }
        return;
    }

    // Track if we've already sent welcome email for this user to prevent duplicates
    const welcomeEmailSentKey = 'welcome_email_sent_';

    // Helper function to send welcome email (with duplicate prevention)
    // Uses both sessionStorage AND a global Set for immediate duplicate prevention
    if (!window._welcomeEmailSent) {
        window._welcomeEmailSent = new Set(); // Global Set to track sent emails immediately
    }
    
    async function sendWelcomeEmailIfNew(user) {
        if (!user || !user.email || !user.created_at) {
            return false; // Return false if not sent
        }

        // Check if we've already sent welcome email for this user ID
        const userWelcomeKey = welcomeEmailSentKey + user.id;
        const userEmailKey = user.email.toLowerCase();
        
        // Check BOTH sessionStorage AND global Set for immediate duplicate prevention
        const existingFlag = sessionStorage.getItem(userWelcomeKey);
        const alreadyInSet = window._welcomeEmailSent.has(userEmailKey);
        
        // Also check localStorage as a backup (persists across page reloads/redirects)
        const localStorageFlag = localStorage.getItem(userWelcomeKey);
        
        // If flag exists, check if it was sent recently (within last 10 minutes)
        if (existingFlag || localStorageFlag) {
            const flagValue = existingFlag || localStorageFlag;
            if (flagValue.startsWith('sent_')) {
                const sentTimestamp = parseInt(flagValue.split('_')[1]);
                const minutesSinceSent = (Date.now() - sentTimestamp) / (1000 * 60);
                // If sent within last 10 minutes, don't send again
                if (minutesSinceSent < 10) {
                    console.log('📧 Welcome email already sent for user:', user.email, '(sent', Math.round(minutesSinceSent), 'minutes ago)');
                    return false;
                }
            } else {
                // Flag exists but not marked as sent yet - might be in progress
                console.log('📧 Welcome email already being processed for user:', user.email);
                return false;
            }
        }
        
        if (alreadyInSet) {
            console.log('📧 Welcome email already in sending queue for user:', user.email);
            return false;
        }
        
        // Mark as "sending" IMMEDIATELY in ALL places (synchronously) to prevent race conditions
        const timestamp = Date.now().toString();
        try {
            sessionStorage.setItem(userWelcomeKey, timestamp);
            localStorage.setItem(userWelcomeKey, timestamp); // Also store in localStorage as backup
        } catch (e) {
            // Storage might be disabled, continue anyway
            console.warn('Could not set storage flags:', e);
        }
        window._welcomeEmailSent.add(userEmailKey);

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
            if (typeof window.sendEmail === 'function') {
                try {
                    await window.sendEmail('welcome', user.email, userName);
                    // Mark as sent (update to 'sent' with timestamp) in BOTH storages
                    const sentTimestamp = 'sent_' + Date.now();
                    try {
                        sessionStorage.setItem(userWelcomeKey, sentTimestamp);
                        localStorage.setItem(userWelcomeKey, sentTimestamp);
                    } catch (e) {
                        console.warn('Could not update storage flags:', e);
                    }
                    console.log('📧 Welcome email sent for new user:', user.email);
                    return true;
                } catch (err) {
                    // On error, remove from all places
                    try {
                        sessionStorage.removeItem(userWelcomeKey);
                        localStorage.removeItem(userWelcomeKey);
                    } catch (e) {
                        // Ignore storage errors
                    }
                    window._welcomeEmailSent.delete(userEmailKey);
                    console.warn('Failed to send welcome email (non-critical):', err);
                    return false;
                }
            }
        } else {
            // Not a new user, remove the flags
            try {
                sessionStorage.removeItem(userWelcomeKey);
                localStorage.removeItem(userWelcomeKey);
            } catch (e) {
                // Ignore storage errors
            }
            window._welcomeEmailSent.delete(userEmailKey);
            return false;
        }
        
        return false;
    }

    // Handle OAuth callback redirect (only runs once per OAuth flow)
    // This checks for OAuth tokens in URL and redirects if session exists and we're on /
    async function handleOAuthCallbackRedirect() {
        const currentPath = window.location.pathname;
        const isRootPath = currentPath === '/' || currentPath === '/index.html';
        const isEmptyHash = !window.location.hash || window.location.hash === '#';
        
        // Only process if we're on root path
        if (!isRootPath) {
            return;
        }
        
        // Check if this is an OAuth callback
        const hasOAuthTokens = isOAuthCallback();
        const oauthInitiated = sessionStorage.getItem('oauth_initiated') === 'true';
        const alreadyProcessed = sessionStorage.getItem('oauth_callback_processed') === 'true';
        
        // Only redirect if:
        // 1. We have OAuth tokens in URL (fresh OAuth callback)
        // 2. OR we initiated OAuth and haven't processed callback yet
        // 3. AND we haven't already processed this callback
        if ((hasOAuthTokens || oauthInitiated) && !alreadyProcessed) {
            // Wait a moment for Supabase to process the OAuth tokens
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Check if session exists
            const { data, error } = await supabase.auth.getSession();
            
            if (!error && data.session && data.session.user) {
                // Mark as processed to prevent duplicate redirects
                sessionStorage.setItem('oauth_callback_processed', 'true');
                sessionStorage.removeItem('oauth_initiated');
                
                // Clear hash to clean up URL
                if (window.location.hash) {
                    window.history.replaceState(null, '', window.location.pathname + window.location.search);
                }
                
                // Redirect to profile
                console.log('🔄 Redirecting to profile after OAuth login');
                window.location.replace('/profile.html');
                return true;
            }
        }
        
        return false;
    }

    // Check for OAuth callback on initial load (only once)
    // This handles the case where Google redirects back to /# with tokens
    handleOAuthCallbackRedirect().catch(err => {
        console.error('Error handling OAuth callback:', err);
    });

    // Setup auth state change listener
    // This handles email/password login redirects and welcome emails
    authStateChangeSubscription = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session && session.user) {
            const user = session.user;
            
            // Send welcome email if new user (duplicate prevention is inside the function)
            await sendWelcomeEmailIfNew(user);
            
            // For email/password login: redirect to profile if on root path
            // For OAuth: the handleOAuthCallbackRedirect above handles it
            const currentPath = window.location.pathname;
            const isRootPath = currentPath === '/' || currentPath === '/index.html';
            const isOAuthFlow = sessionStorage.getItem('oauth_initiated') === 'true' || 
                              sessionStorage.getItem('oauth_callback_processed') === 'true';
            
            // Only redirect for email/password login (not OAuth, which is handled separately)
            if (isRootPath && !isOAuthFlow && 
                currentPath !== '/profile.html' && !currentPath.endsWith('profile.html')) {
                console.log('🔄 Redirecting to profile after email/password login');
                window.location.replace('/profile.html');
                return;
            }
        }
        
        if (callback) {
            callback(event, session);
        }
    });
    
    // Mark as set up
    authListenerSetup = true;
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
