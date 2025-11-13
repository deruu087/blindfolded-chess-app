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
        return { success: true, user: data.user };
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

// Listen for auth state changes (when user signs in/out)
function setupAuthListener() {
    const supabase = getSupabase();
    if (!supabase) {
        return;
    }

    supabase.auth.onAuthStateChange((event, session) => {
        console.log('Auth state changed:', event, session?.user?.email);
        
        if (event === 'SIGNED_IN') {
            console.log('User signed in:', session.user.email);
            // Update navigation or UI as needed
            if (typeof updateNavigation === 'function') {
                updateNavigation();
            }
        } else if (event === 'SIGNED_OUT') {
            console.log('User signed out');
            // Update navigation or UI as needed
            if (typeof updateNavigation === 'function') {
                updateNavigation();
            }
        }
    });
}

// Make functions available globally
window.signUpWithEmail = signUpWithEmail;
window.signInWithEmail = signInWithEmail;
window.signOut = signOut;
window.getCurrentUser = getCurrentUser;
window.isSignedIn = isSignedIn;
window.setupAuthListener = setupAuthListener;


