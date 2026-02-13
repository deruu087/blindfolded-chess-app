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

    // Supabase may return a warning/error even when signup succeeds
    // (e.g., email confirmation required, database trigger warnings)
    // Only treat as failure if user was NOT created
    if (error && !data?.user) {
        return { success: false, error: error.message };
    }

    // If user was created, signup succeeded (even if there's a warning)
    if (data?.user) {
        return { success: true, user: data.user, session: data.session };
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

    // Check for existing session on initial load (handles OAuth redirect)
    // NOTE: We DON'T send welcome email here - only in onAuthStateChange SIGNED_IN event
    // This prevents duplicate emails when both initial session and SIGNED_IN fire
    // Only run this check once on initial page load, not on tab switches
    let initialSessionCheckDone = false;
    
    // Track page load time to detect tab switches
    const pageLoadTime = Date.now();
    let wasPageHidden = document.hidden;
    
    // Listen for visibility changes to detect tab switches
    document.addEventListener('visibilitychange', () => {
        wasPageHidden = document.hidden;
    });
    
    supabase.auth.getSession().then(async ({ data, error }) => {
        // Only run redirect check once per page load
        if (initialSessionCheckDone) return;
        initialSessionCheckDone = true;
        
        if (!error && data.session && data.session.user) {
            // Only redirect if user is on root path (/) or has empty hash (#)
            // This handles OAuth landing after Google login, but not normal navigation
            const isRootPath = window.location.pathname === '/';
            const isEmptyHash = window.location.hash === '#';
            
            // Check if we've already attempted a redirect for this session
            // This prevents redirects when switching tabs back to the page
            const redirectKey = 'initialRedirectDone_' + data.session.user.id;
            const hasRedirected = sessionStorage.getItem(redirectKey);
            
            // Check if this is an OAuth redirect (has code or access_token in URL)
            const isOAuthRedirect = window.location.search.includes('code=') || 
                                   window.location.hash.includes('access_token') ||
                                   window.location.hash.includes('code=');
            
            // Check if page was just loaded (not a tab switch)
            // If page was hidden when this runs, it's likely a tab switch
            const timeSinceLoad = Date.now() - pageLoadTime;
            const isLikelyTabSwitch = wasPageHidden || timeSinceLoad > 500;
            
            // Only redirect if:
            // 1. We're on root path or empty hash
            // 2. We're not already on profile
            // 3. We haven't already done this redirect for this session
            // 4. This is either an OAuth redirect OR a fresh page load (not a tab switch)
            if ((isRootPath || isEmptyHash) && 
                window.location.pathname !== '/profile.html' && 
                !window.location.pathname.endsWith('profile.html') &&
                !hasRedirected &&
                (isOAuthRedirect || (!isLikelyTabSwitch && timeSinceLoad < 500))) {
                sessionStorage.setItem(redirectKey, 'true');
                window.location.replace('profile.html');
                return;
            }
        }
    });

    // Store the subscription so we can check if it exists
    authStateChangeSubscription = supabase.auth.onAuthStateChange(async (event, session) => {
        // Redirect to profile on SIGNED_IN event (for email login or future logins)
        if (event === 'SIGNED_IN' && session && session.user) {
            const user = session.user;
            
            // Send welcome email if new user (duplicate prevention is inside the function)
            await sendWelcomeEmailIfNew(user);
            
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
