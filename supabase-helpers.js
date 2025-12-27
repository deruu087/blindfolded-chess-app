// Helper functions to interact with Supabase database

/**
 * Wait for Supabase to be initialized (defensive fallback)
 */
async function waitForSupabase(maxWaitMs = 5000) {
    const startTime = Date.now();
    while (!window.getSupabase || !window.getSupabase()) {
        if (Date.now() - startTime > maxWaitMs) {
            console.error('❌ waitForSupabase: Timeout waiting for Supabase');
            return false;
        }
        await new Promise(r => setTimeout(r, 25));
    }
    return true;
}

// Export globally
window.waitForSupabase = waitForSupabase;

/**
 * Get the current user's progress from the database
 */
async function getUserProgress() {
    console.log('🔍 getUserProgress() called');
    
    // Wait for Supabase if not ready
    if (!window.getSupabase || !window.getSupabase()) {
        console.log('⏳ Supabase not ready, waiting...');
        const ready = await waitForSupabase();
        if (!ready) {
            console.error('❌ Supabase not initialized after wait');
            return null;
        }
    }
    
    const supabase = getSupabase();
    if (!supabase) {
        console.error('❌ Supabase not initialized');
        return null;
    }
    console.log('✅ Supabase client available');

    // Get the current user - use getSession() first as it's faster and more reliable
    console.log('🔍 Getting current user from session...');
    let user = null;
    
    try {
        // Try session first (faster and more reliable)
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
            console.error('❌ Error getting session:', sessionError);
        } else if (session?.user) {
            user = session.user;
            console.log('✅ User found in session:', user.id, user.email);
        } else {
            console.log('⚠️ No user in session, trying getUser()...');
            // Fallback to getUser() if session doesn't have user
            const result = await Promise.race([
                supabase.auth.getUser(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('getUser() timeout')), 3000))
            ]);
            if (result?.data?.user) {
                user = result.data.user;
                console.log('✅ User found via getUser():', user.id, user.email);
            } else if (result?.error) {
                console.error('❌ Error getting user:', result.error);
            }
        }
    } catch (e) {
        console.error('❌ Exception getting user:', e);
        if (e.message === 'getUser() timeout') {
            console.log('⚠️ getUser() timed out, checking session again...');
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                user = session.user;
                console.log('✅ User found in session after timeout:', user.id, user.email);
            }
        }
    }
    
    if (!user) {
        console.log('⚠️ No user found - cannot fetch progress');
        return null;
    }
    
    console.log('✅ User confirmed:', user.id, user.email);

    // Fetch user's progress from database
    console.log('🔍 Fetching progress from user_progress table for user_id:', user.id);
    console.log('🔍 User email:', user.email);
    
    const { data, error } = await supabase
        .from('user_progress')
        .select('*')
        .eq('user_id', user.id)
        .single();

    console.log('🔍 Query result:', { hasData: !!data, hasError: !!error, error: error });

    if (error) {
        // Check if it's a "no rows" error (user has no progress record yet)
        if (error.code === 'PGRST116') {
            console.log('⚠️ No progress record found for user (this is normal for new users)');
            console.log('🔍 Searching for any records with this user_id:', user.id);
            
            // Try to see if there are ANY records for this user (without .single())
            const { data: allData, error: allError } = await supabase
                .from('user_progress')
                .select('*')
                .eq('user_id', user.id);
            
            console.log('🔍 All records for this user_id:', { count: allData?.length || 0, data: allData, error: allError });
            
            return null; // Return null to indicate no record exists
        }
        console.error('❌ Error fetching progress:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        console.error('Error details:', error.details);
        console.error('Error hint:', error.hint);
        return null;
    }

    console.log('✅ Successfully fetched progress from Supabase:', data);
    console.log('📊 Progress data:', {
        completed_games: data.completed_games,
        completed_puzzles: data.completed_puzzles,
        training_hours: data.training_hours,
        current_streak: data.current_streak,
        user_id: data.user_id
    });
    
    // Verify the data structure
    if (data.completed_games && Array.isArray(data.completed_games)) {
        console.log('✅ completed_games is an array with', data.completed_games.length, 'items:', data.completed_games);
    } else {
        console.warn('⚠️ completed_games is not an array or is missing:', data.completed_games);
    }
    
    return data;
}

/**
 * Save or update user's progress in the database
 */
async function saveUserProgress(progressData) {
    const supabase = getSupabase();
    if (!supabase) {
        console.error('Supabase not initialized');
        return false;
    }

    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
        console.log('No user logged in');
        return false;
    }

    // Get user's name and email for display in table
    const userName = user.user_metadata?.name || 
                     user.user_metadata?.full_name || 
                     user.email?.split('@')[0] || 
                     'User';
    const userEmail = user.email || '';

    // Prepare data to save
    console.log('💾 saveUserProgress called with:', {
        completedGames: progressData.completedGames?.length || 0,
        completedPuzzles: progressData.completedPuzzles?.length || 0,
        completedPuzzlesList: progressData.completedPuzzles || []
    });
    
    // CRITICAL: Fetch existing data first to merge, not replace
    // This prevents overwriting completed_games when saving puzzles, and vice versa
    let existingData = null;
    const { data: existing, error: fetchError } = await supabase
        .from('user_progress')
        .select('completed_games, completed_puzzles, training_hours, current_streak')
        .eq('user_id', user.id)
        .single();
    
    if (fetchError && fetchError.code !== 'PGRST116') {
        // PGRST116 means no row found, which is fine for new users
        console.warn('⚠️ Could not fetch existing data (will create new):', fetchError);
    } else if (existing) {
        existingData = existing;
        console.log('📥 Fetched existing data:', existingData);
    }
    
    // Merge new data with existing data (don't overwrite arrays, merge them)
    const existingGames = existingData?.completed_games || [];
    const existingPuzzles = existingData?.completed_puzzles || [];
    
    // Merge arrays - add new items that don't already exist
    const mergedGames = [...new Set([...existingGames, ...(progressData.completedGames || [])])];
    const mergedPuzzles = [...new Set([...existingPuzzles, ...(progressData.completedPuzzles || [])])];
    
    // For training_hours: Always use the higher value (it should only increase)
    // progressData.trainingHours is the TOTAL accumulated hours from progress tracker
    // existingData.training_hours is the TOTAL from Supabase
    // If progressData is higher, it means new training was added locally
    // If existingData is higher, it means Supabase has the most up-to-date total
    const existingHours = existingData?.training_hours || 0;
    const newHours = progressData.trainingHours || 0;
    const mergedTrainingHours = Math.max(existingHours, newHours);
    
    // For streak: Use the higher value (it should only increase)
    const mergedStreak = Math.max(
        existingData?.current_streak || 0,
        progressData.currentStreak || 0
    );
    
    console.log('🕐 Training hours merge:', {
        existingFromSupabase: existingHours,
        newFromProgressTracker: newHours,
        merged: mergedTrainingHours,
        note: newHours > existingHours ? 'Using progress tracker value (new training added)' : 'Using Supabase value (source of truth)'
    });
    
    // Only save to columns that exist in your Supabase table:
    // completed_games, completed_puzzles, training_hours, current_streak
    const dataToSave = {
        user_id: user.id,
        completed_games: mergedGames,
        completed_puzzles: mergedPuzzles,
        training_hours: mergedTrainingHours,
        current_streak: mergedStreak
    };
    
    // Note: Removed columns that don't exist:
    // - total_games_played
    // - user_name, user_email (if not needed)
    // - last_activity_date
    // - updated_at
    
    // CRITICAL: Make absolutely sure challenge_mode_completions is NOT in dataToSave
    // Remove it explicitly if it somehow got added
    delete dataToSave.challenge_mode_completions;
    
    console.log('💾 Merged data to save to Supabase:', {
        existingGames: existingGames.length,
        newGames: progressData.completedGames?.length || 0,
        mergedGames: mergedGames.length,
        existingPuzzles: existingPuzzles.length,
        newPuzzles: progressData.completedPuzzles?.length || 0,
        mergedPuzzles: mergedPuzzles.length,
        training_hours: mergedTrainingHours,
        current_streak: mergedStreak,
        keys: Object.keys(dataToSave)
    });

    // Save to Supabase - merging with existing data
    const { data, error } = await supabase
        .from('user_progress')
        .upsert(dataToSave, {
            onConflict: 'user_id'
        });

    if (error) {
        console.error('Error saving progress:', error);
        console.error('Data that was sent:', JSON.stringify(dataToSave, null, 2));
        return false;
    }

    console.log('✅ Progress saved successfully!');
    return true;
}

/**
 * Test function to check if we can connect to the database
 */
async function testDatabaseConnection() {
    const supabase = getSupabase();
    if (!supabase) {
        console.error('Supabase not initialized');
        return;
    }

    console.log('Testing database connection...');
    
    // Try to query the table (this will work even without auth)
    const { data, error } = await supabase
        .from('user_progress')
        .select('count');

    if (error) {
        console.error('❌ Database connection failed:', error);
    } else {
        console.log('✅ Database connection successful!');
    }
}

/**
 * Save a custom game to the database
 */
async function saveCustomGame(gameData) {
    const supabase = getSupabase();
    if (!supabase) {
        console.error('Supabase not initialized');
        return { success: false, error: 'Supabase not initialized' };
    }

    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
        console.log('No user logged in');
        return { success: false, error: 'User not logged in' };
    }

    // Prepare data to save
    const dataToSave = {
        user_id: user.id,
        game_data: gameData, // Store all game data as JSON
        updated_at: new Date().toISOString()
    };

    // Insert the new custom game
    const { data, error } = await supabase
        .from('custom_games')
        .insert(dataToSave)
        .select()
        .single();

    if (error) {
        console.error('Error saving custom game:', error);
        return { success: false, error: error.message };
    }

    console.log('✅ Custom game saved successfully!', data);
    return { success: true, game: data };
}

/**
 * Get all custom games for the current user
 */
async function getUserCustomGames() {
    const supabase = getSupabase();
    if (!supabase) {
        console.error('Supabase not initialized');
        return null;
    }

    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
        console.log('No user logged in');
        return null;
    }

    // Fetch user's custom games from database
    const { data, error } = await supabase
        .from('custom_games')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching custom games:', error);
        return null;
    }

    return data;
}

/**
 * Delete a custom game by ID
 */
async function deleteCustomGame(gameId) {
    const supabase = getSupabase();
    if (!supabase) {
        console.error('Supabase not initialized');
        return { success: false, error: 'Supabase not initialized' };
    }

    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
        console.log('No user logged in');
        return { success: false, error: 'User not logged in' };
    }

    // Delete the game (RLS will ensure user can only delete their own games)
    const { error } = await supabase
        .from('custom_games')
        .delete()
        .eq('id', gameId)
        .eq('user_id', user.id);

    if (error) {
        console.error('Error deleting custom game:', error);
        return { success: false, error: error.message };
    }

    console.log('✅ Custom game deleted successfully!');
    return { success: true };
}

/**
 * Update a custom game
 */
async function updateCustomGame(gameId, gameData) {
    const supabase = getSupabase();
    if (!supabase) {
        console.error('Supabase not initialized');
        return { success: false, error: 'Supabase not initialized' };
    }

    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
        console.log('No user logged in');
        return { success: false, error: 'User not logged in' };
    }

    // Update the game (RLS will ensure user can only update their own games)
    const { data, error } = await supabase
        .from('custom_games')
        .update({
            game_data: gameData,
            updated_at: new Date().toISOString()
        })
        .eq('id', gameId)
        .eq('user_id', user.id)
        .select()
        .single();

    if (error) {
        console.error('Error updating custom game:', error);
        return { success: false, error: error.message };
    }

    console.log('✅ Custom game updated successfully!', data);
    return { success: true, game: data };
}

/**
 * Get the current user's subscription from the database
 */
async function getUserSubscription() {
    console.log('🔍 getUserSubscription() CALLED');
    const supabase = getSupabase();
    if (!supabase) {
        console.error('❌ Supabase not initialized');
        return null;
    }

    // Get the current user - CRITICAL: Must have user before querying
    console.log('🔍 Checking user authentication...');
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError) {
        console.error('❌ Auth error:', authError);
        return null;
    }
    
    if (!user) {
        console.log('❌ No user logged in - returning null');
        return null;
    }
    
    console.log('✅ User authenticated:', user.id, user.email);

    // Fetch user's subscription from database - FORCE FRESH FETCH (no cache)
    // IMPORTANT: Order by updated_at DESC to get the most recent subscription
    // This prevents old test data from being returned
    console.log('🔍 getUserSubscription: Fetching from Supabase for user:', user.id);
    
    // First, check if there are multiple subscriptions (this should not happen, but let's check)
    const { data: allSubs, error: countError } = await supabase
        .from('subscriptions')
        .select('id, amount_paid, created_at, updated_at')
        .eq('user_id', user.id);
    
    if (!countError && allSubs && allSubs.length > 1) {
        console.warn('⚠️ WARNING: Multiple subscriptions found for user!', allSubs);
        console.warn('⚠️ This should not happen - there should be only one subscription per user');
    }
    
    // Fetch the most recent subscription (ordered by updated_at DESC)
    // Add cache-busting timestamp to ensure fresh fetch
    const cacheBuster = Date.now();
    const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();
    
    console.log('🔍 Query timestamp (cache buster):', cacheBuster);

    if (error) {
        // If no subscription found, that's okay - user is on free plan
        if (error.code === 'PGRST116') {
            console.log('✅ No subscription found - user is on free plan');
            return null;
        }
        // If multiple rows found, try fetching without .single()
        if (error.code === 'PGRST116' || error.message?.includes('multiple') || error.message?.includes('More than one')) {
            console.warn('⚠️ Multiple subscriptions detected, fetching most recent one...');
            const { data: multiData, error: multiError } = await supabase
                .from('subscriptions')
                .select('*')
                .eq('user_id', user.id)
                .order('updated_at', { ascending: false })
                .limit(1);
            
            if (!multiError && multiData && multiData.length > 0) {
                console.log('✅ Found subscription from multiple records:', multiData[0]);
                const sub = multiData[0];
                // REJECT 3.52 even from multiple records
                if (sub.amount_paid == 3.52 || parseFloat(sub.amount_paid) == 3.52) {
                    console.error('❌❌❌ REJECTING SUBSCRIPTION WITH 3.52 FROM MULTIPLE RECORDS');
                    return null;
                }
                return sub;
            }
        }
        console.error('❌ Error fetching subscription:', error);
        console.error('❌ Error code:', error.code);
        console.error('❌ Error message:', error.message);
        return null;
    }

    // Log what we're returning - CRITICAL DEBUG INFO
    console.log('📦 getUserSubscription RAW DATA FROM SUPABASE:', JSON.stringify(data, null, 2));
    console.log('💰 Amount paid:', data?.amount_paid);
    console.log('💰 Amount paid type:', typeof data?.amount_paid);
    console.log('💰 Amount paid value:', data?.amount_paid);
    console.log('💰 Amount paid equals 3.52?', data?.amount_paid == 3.52);
    console.log('💰 Amount paid parseFloat:', parseFloat(data?.amount_paid));
    
    // CRITICAL: If amount_paid is 3.52, REJECT IT IMMEDIATELY
    if (data && (data.amount_paid == 3.52 || parseFloat(data.amount_paid) == 3.52)) {
        console.error('❌❌❌ REJECTING SUBSCRIPTION WITH 3.52 - THIS IS HARDCODED TEST DATA');
        console.error('❌ Subscription ID:', data.id);
        console.error('❌ Full subscription:', data);
        console.error('❌ Returning NULL instead of this subscription');
        return null; // REJECT IT - DON'T RETURN IT
    }
    
    console.log('✅ Returning valid subscription:', data);
    return data;
}

/**
 * Check if the current user has an active subscription
 * Returns true if subscription exists and status is 'active'
 */
async function hasActiveSubscription() {
    const subscription = await getUserSubscription();
    
    if (!subscription) {
        return false;
    }

    // Check if subscription is active and not expired
    if (subscription.status === 'active') {
        // If there's an end_date, check if it's in the future
        if (subscription.end_date) {
            const endDate = new Date(subscription.end_date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            return endDate >= today;
        }
        // If no end_date (lifetime plan), it's active
        return true;
    }

    return false;
}

/**
 * Create or update a subscription (for testing/manual entry)
 * @param {object} subscriptionData - { plan_type, status, start_date, end_date, amount_paid, currency, payment_method }
 */
async function createOrUpdateSubscription(subscriptionData) {
    const supabase = getSupabase();
    if (!supabase) {
        console.error('Supabase not initialized');
        return { success: false, error: 'Supabase not initialized' };
    }

    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
        console.log('No user logged in');
        return { success: false, error: 'User not logged in' };
    }

    // Prepare data to save
    const dataToSave = {
        user_id: user.id,
        plan_type: subscriptionData.plan_type || 'monthly',
        status: subscriptionData.status || 'active',
        start_date: subscriptionData.start_date || new Date().toISOString().split('T')[0],
        end_date: subscriptionData.end_date || null,
        amount_paid: subscriptionData.amount_paid || null,
        currency: subscriptionData.currency || 'EUR',
        payment_method: subscriptionData.payment_method || 'manual',
        updated_at: new Date().toISOString()
    };

    // Try to update existing record, or insert new one
    const { data, error } = await supabase
        .from('subscriptions')
        .upsert(dataToSave, {
            onConflict: 'user_id'
        })
        .select()
        .single();

    if (error) {
        console.error('Error saving subscription:', error);
        return { success: false, error: error.message };
    }

    console.log('✅ Subscription saved successfully!', data);
    return { success: true, subscription: data };
}

/**
 * Cancel a subscription via Dodo Payments API and update Supabase
 * This calls the backend API endpoint which handles Dodo Payments cancellation
 */
async function cancelSubscription() {
    console.log('🚀 cancelSubscription() called');
    try {
        const supabase = getSupabase();
        if (!supabase) {
            console.error('❌ Supabase not initialized');
            return { success: false, error: 'Supabase not initialized' };
        }

        console.log('✅ Supabase initialized');

        // Get the current user
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
            console.log('❌ No user logged in:', authError);
            return { success: false, error: 'User not logged in' };
        }

        console.log('✅ User authenticated:', user.id);

        // Get the user's session token for API authentication
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session || !session.access_token) {
            console.error('❌ No session token available');
            return { success: false, error: 'No session token available' };
        }

        console.log('✅ Session token available');

    // Determine API endpoint (production vs local)
    const isProduction = !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1');
    const apiUrl = isProduction 
        ? 'https://memo-chess.vercel.app/api/cancel-subscription'
        : 'http://localhost:3000/api/cancel-subscription';

    try {
        console.log('📞 Calling cancel subscription API:', apiUrl);
        console.log('📞 Session token exists:', !!session.access_token);
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        console.log('📞 Response status:', response.status);
        console.log('📞 Response ok:', response.ok);

        let result;
        try {
            result = await response.json();
            console.log('📞 Response data:', result);
        } catch (jsonError) {
            const text = await response.text();
            console.error('📞 Failed to parse JSON response:', text);
            return { success: false, error: `Server error: ${response.status} - ${text}` };
        }

        if (!response.ok) {
            console.error('❌ API error:', result);
            return { success: false, error: result.error || result.message || 'Failed to cancel subscription' };
        }

        console.log('✅ Subscription cancelled successfully!', result);
        return { success: true, subscription: result.subscription, message: result.message };
        
    } catch (error) {
        console.error('❌ Error calling cancel subscription API:', error);
        console.error('❌ Error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        return { success: false, error: error.message || 'Network error' };
    }
    } catch (outerError) {
        console.error('❌ Outer error in cancelSubscription:', outerError);
        return { success: false, error: outerError.message || 'Unexpected error' };
    }
}

/**
 * Get payment history for the current user
 * Returns array of payment objects with amount, status, date, and invoice link
 */
async function getPaymentHistory() {
    const supabase = getSupabase();
    if (!supabase) {
        console.error('Supabase not initialized');
        return [];
    }

    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
        console.log('No user logged in');
        return [];
    }

    // Fetch from payments table ONLY - no fallbacks, no mock data
    let payments = [];
    const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select('*')
        .eq('user_id', user.id)
        .order('payment_date', { ascending: false });

    if (!paymentsError && paymentsData) {
        payments = paymentsData
            .map(payment => ({
                amount: payment.amount || 0,
                currency: payment.currency || 'EUR',
                status: payment.status || 'paid',
                date: payment.payment_date || payment.created_at,
                invoice_url: payment.invoice_url || `https://checkout.dodopayments.com/account`
            }))
            .filter(payment => {
                // CRITICAL: Reject any payment with amount 3.52 (mock/test data)
                if (payment.amount == 3.52 || parseFloat(payment.amount) == 3.52) {
                    console.error('❌ Rejecting payment with amount 3.52 (mock data):', payment);
                    return false;
                }
                return true;
            });
    }

    // NO FALLBACK - if no payments, return empty array
    // Payment history only comes from payments table in Supabase
    return payments;
}

// Make functions available globally
window.getUserProgress = getUserProgress;
window.saveUserProgress = saveUserProgress;
window.testDatabaseConnection = testDatabaseConnection;
window.saveCustomGame = saveCustomGame;
window.getUserCustomGames = getUserCustomGames;
window.deleteCustomGame = deleteCustomGame;
window.updateCustomGame = updateCustomGame;
window.getUserSubscription = getUserSubscription;
window.hasActiveSubscription = hasActiveSubscription;
window.createOrUpdateSubscription = createOrUpdateSubscription;
window.cancelSubscription = cancelSubscription;
window.getPaymentHistory = getPaymentHistory;

