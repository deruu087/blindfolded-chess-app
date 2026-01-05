// Supabase Authentication Functions

/**
 * Sign up a new user with email and password
 */
async function signUpWithEmail(email, password, name) {
    const supabase = getSupabase();
    if (!supabase) {
        console.error('Supabase not initialized');
        return { success: false, error: 'Supabase not initialized' };
    }

    try {
        // Sign up the user
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    name: name  // Store name in user metadata
                }
            }
        });

        if (error) {
            console.error('Sign up error:', error);
            return { success: false, error: error.message };
        }

        console.log('✅ User signed up successfully!', data);
        return { 
            success: true, 
            user: data.user,
            session: data.session 
        };
    } catch (error) {
        console.error('Sign up exception:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Sign in an existing user with email and password
 */
async function signInWithEmail(email, password) {
    const supabase = getSupabase();
    if (!supabase) {
        console.error('Supabase not initialized');
        return { success: false, error: 'Supabase not initialized' };
    }

    try {
        // Sign in the user
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            console.error('Sign in error:', error);
            return { success: false, error: error.message };
        }

        console.log('✅ User signed in successfully!', data);
        return { success: true, user: data.user };
    } catch (error) {
        console.error('Sign in exception:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Sign out the current user
 */
async function signOut() {
    const supabase = getSupabase();
    if (!supabase) {
        console.error('Supabase not initialized');
        return { success: false, error: 'Supabase not initialized' };
    }

    try {
        const { error } = await supabase.auth.signOut();

        if (error) {
            console.error('Sign out error:', error);
            return { success: false, error: error.message };
        }

        console.log('✅ User signed out successfully!');
        return { success: true };
    } catch (error) {
        console.error('Sign out exception:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get the current signed-in user
 */
async function getCurrentUser() {
    const supabase = getSupabase();
    if (!supabase) {
        return null;
    }

    try {
        const { data: { user } } = await supabase.auth.getUser();
        return user;
    } catch (error) {
        console.error('Error getting current user:', error);
        return null;
    }
}

/**
 * Check if user is currently signed in
 */
async function isSignedIn() {
    const user = await getCurrentUser();
    return user !== null;
}

/**
 * Centralized function to check authentication status
 * This is the SINGLE SOURCE OF TRUTH for checking if a user is logged in
 * 
 * @returns {Promise<{isLoggedIn: boolean, user: object|null, email: string|null, name: string|null}>}
 */
async function checkAuthStatus() {
    console.log('🔍 [DEBUG] checkAuthStatus() called');
    
    // Always check Supabase session first (source of truth)
    // Wait for Supabase to initialize (important on production where it may load slower)
    let supabase = getSupabase();
    console.log('🔍 [DEBUG] Initial getSupabase() result:', supabase ? 'found' : 'null');
    
    if (!supabase) {
        // Wait up to 2 seconds for Supabase to initialize
        console.log('🔍 [DEBUG] Waiting for Supabase to initialize...');
        for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            supabase = getSupabase();
            if (supabase) {
                console.log('🔍 [DEBUG] Supabase initialized after', (i + 1) * 100, 'ms');
                break;
            }
        }
    }
    
    if (!supabase) {
        // Supabase not initialized after waiting - return logged out (don't use localStorage fallback)
        console.warn('⚠️ [DEBUG] Supabase not initialized after waiting - returning logged out status');
        console.log('🔍 [DEBUG] localStorage check:', {
            isLoggedIn: localStorage.getItem('isLoggedIn'),
            userEmail: localStorage.getItem('userEmail'),
            userName: localStorage.getItem('userName')
        });
        return {
            isLoggedIn: false,
            user: null,
            email: null,
            name: null
        };
    }

    try {
        // Get current session from Supabase
        console.log('🔍 [DEBUG] Calling supabase.auth.getSession()...');
        const { data: { session }, error } = await supabase.auth.getSession();
        
        console.log('🔍 [DEBUG] getSession() result:', {
            hasSession: !!session,
            hasUser: !!session?.user,
            userEmail: session?.user?.email,
            userId: session?.user?.id,
            error: error?.message
        });
        
        if (error || !session || !session.user) {
            // No valid session - user is logged out
            console.log('🔍 [DEBUG] No valid session - clearing localStorage and returning logged out');
            localStorage.setItem('isLoggedIn', 'false');
            localStorage.removeItem('userEmail');
            localStorage.removeItem('userName');
            
            return {
                isLoggedIn: false,
                user: null,
                email: null,
                name: null
            };
        }

        // Valid session - user is logged in
        const user = session.user;
        const email = user.email || '';
        const userName = user.user_metadata?.name || 
                        user.user_metadata?.full_name || 
                        email.split('@')[0] || 
                        'User';
        
        console.log('🔍 [DEBUG] Valid session found:', {
            email: email,
            name: userName,
            userId: user.id,
            userMetadata: user.user_metadata
        });
        
        // Validate email - reject test/mock emails
        if (email && (email.includes('guest@example.com') || 
            email.includes('test@example') || 
            email.includes('mock@') ||
            email.includes('example.com'))) {
            console.error('❌ [DEBUG] Rejecting test/mock email from Supabase session:', email);
            // Sign out the test user
            await supabase.auth.signOut();
            localStorage.setItem('isLoggedIn', 'false');
            localStorage.removeItem('userEmail');
            localStorage.removeItem('userName');
            return {
                isLoggedIn: false,
                user: null,
                email: null,
                name: null
            };
        }
        
        // Update localStorage to match Supabase session
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('userEmail', email);
        localStorage.setItem('userName', userName);
        
        console.log('✅ [DEBUG] Returning logged in status:', { email, name: userName });
        
        return {
            isLoggedIn: true,
            user: user,
            email: email,
            name: userName
        };
    } catch (error) {
        console.error('❌ [DEBUG] Error checking auth status:', error);
        console.error('❌ [DEBUG] Error stack:', error.stack);
        // On error, return logged out (don't use localStorage fallback to prevent showing stale data)
        // Clear any stale localStorage data
        localStorage.setItem('isLoggedIn', 'false');
        localStorage.removeItem('userEmail');
        localStorage.removeItem('userName');
        return {
            isLoggedIn: false,
            user: null,
            email: null,
            name: null
        };
    }
}

// Listen for auth state changes (when user signs in/out)
function setupAuthListener() {
    const supabase = getSupabase();
    if (!supabase) {
        return;
    }

    supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('Auth state changed:', event, session?.user?.email);
        
        if (event === 'SIGNED_IN' && session && session.user) {
            console.log('User signed in:', session.user.email);
            
            // CRITICAL: Clear any old progress data from localStorage to prevent data leakage
            localStorage.removeItem('chessProgress');
            console.log('🔒 Cleared localStorage progress on auth state change (SIGNED_IN)');
            
            // Update localStorage immediately
            localStorage.setItem('isLoggedIn', 'true');
            localStorage.setItem('userEmail', session.user.email || '');
            const userName = session.user.user_metadata?.name || 
                           session.user.user_metadata?.full_name || 
                           session.user.email?.split('@')[0] || 
                           'User';
            localStorage.setItem('userName', userName);
            
            // Update navigation or UI as needed
            if (typeof updateNavigation === 'function') {
                await updateNavigation();
            }
        } else if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
            if (event === 'SIGNED_OUT') {
                console.log('User signed out');
                // Clear localStorage
                localStorage.setItem('isLoggedIn', 'false');
                localStorage.removeItem('userEmail');
                localStorage.removeItem('userName');
                // CRITICAL: Clear progress data to prevent data leakage between accounts
                localStorage.removeItem('chessProgress');
            }
            
            // Update navigation or UI as needed
            if (typeof updateNavigation === 'function') {
                await updateNavigation();
            }
        }
    });
}

/**
 * Sign in or sign up with Google OAuth
 */
async function signInWithGoogle() {
    const supabase = getSupabase();
    if (!supabase) {
        console.error('Supabase not initialized');
        return { success: false, error: 'Supabase not initialized' };
    }

    try {
        // Initiate Google OAuth flow
        // This will redirect to Google, then back to your site
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin + window.location.pathname
            }
        });

        if (error) {
            console.error('Google OAuth error:', error);
            return { success: false, error: error.message };
        }

        // The OAuth flow will redirect, so we return the URL
        console.log('✅ Google OAuth initiated');
        return { success: true, url: data.url };
    } catch (error) {
        console.error('Google OAuth exception:', error);
        return { success: false, error: error.message };
    }
}

// Make functions available globally
window.signUpWithEmail = signUpWithEmail;
window.signInWithEmail = signInWithEmail;
window.signOut = signOut;
window.getCurrentUser = getCurrentUser;
window.isSignedIn = isSignedIn;
window.setupAuthListener = setupAuthListener;
window.signInWithGoogle = signInWithGoogle;
window.checkAuthStatus = checkAuthStatus;


