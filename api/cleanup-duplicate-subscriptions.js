// API endpoint to clean up duplicate subscription records
// Keeps the subscription with the correct amount (3.49/3.50 for monthly, 8.90 for quarterly)
// Run this manually via POST request to clean up existing duplicates

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    
    try {
        // Initialize Supabase with service role key
        const supabaseUrl = process.env.SUPABASE_URL;
        if (!supabaseUrl) {
            return res.status(500).json({ error: 'SUPABASE_URL not configured' });
        }
        
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
        if (!supabaseServiceKey) {
            return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' });
        }
        
        const supabase = createClient(supabaseUrl, supabaseServiceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });
        
        console.log('🧹 [CLEANUP] Starting duplicate subscription cleanup...');
        
        // Find all subscriptions
        const { data: allSubscriptions, error: fetchError } = await supabase
            .from('subscriptions')
            .select('*')
            .order('updated_at', { ascending: false });
        
        if (fetchError) {
            console.error('❌ [CLEANUP] Error fetching subscriptions:', fetchError);
            return res.status(500).json({ error: 'Failed to fetch subscriptions', details: fetchError.message });
        }
        
        if (!allSubscriptions || allSubscriptions.length === 0) {
            return res.status(200).json({ 
                success: true, 
                message: 'No subscriptions found',
                deleted: 0
            });
        }
        
        // Group subscriptions by user_id (should only be 1 per user)
        const subscriptionGroups = {};
        for (const subscription of allSubscriptions) {
            const userId = subscription.user_id;
            if (!subscriptionGroups[userId]) {
                subscriptionGroups[userId] = [];
            }
            subscriptionGroups[userId].push(subscription);
        }
        
        // Find groups with duplicates (more than 1 subscription per user)
        const duplicates = [];
        for (const [userId, subscriptions] of Object.entries(subscriptionGroups)) {
            if (subscriptions.length > 1) {
                duplicates.push({
                    userId,
                    subscriptions,
                    count: subscriptions.length
                });
            }
        }
        
        console.log(`🔍 [CLEANUP] Found ${duplicates.length} users with duplicate subscriptions`);
        
        let deletedCount = 0;
        let keptCount = 0;
        const deletedIds = [];
        const keptIds = [];
        
        for (const duplicate of duplicates) {
            const { subscriptions } = duplicate;
            
            // Sort by: 1) Correct amount (3.49/3.50 for monthly, 8.90 for quarterly), 2) Has dodo_subscription_id, 3) Most recent
            subscriptions.sort((a, b) => {
                // Prefer correct amount
                const aAmount = parseFloat(a.amount_paid);
                const bAmount = parseFloat(b.amount_paid);
                const correctAmounts = [3.49, 3.50, 8.90]; // Allow 3.50 as correct
                const aIsCorrectAmount = correctAmounts.includes(aAmount);
                const bIsCorrectAmount = correctAmounts.includes(bAmount);
                if (aIsCorrectAmount && !bIsCorrectAmount) return -1;
                if (!aIsCorrectAmount && bIsCorrectAmount) return 1;
                
                // Prefer subscriptions with dodo_subscription_id
                const aHasSubscriptionId = a.dodo_subscription_id && a.dodo_subscription_id.startsWith('sub_');
                const bHasSubscriptionId = b.dodo_subscription_id && b.dodo_subscription_id.startsWith('sub_');
                if (aHasSubscriptionId && !bHasSubscriptionId) return -1;
                if (!aHasSubscriptionId && bHasSubscriptionId) return 1;
                
                // Prefer higher amount if both are correct (in case of tax adjustments)
                if (aIsCorrectAmount && bIsCorrectAmount && aAmount !== bAmount) {
                    return bAmount - aAmount;
                }
                
                // Prefer most recent
                return new Date(b.updated_at) - new Date(a.updated_at);
            });
            
            // Keep the first one (best subscription), delete the rest
            const subscriptionToKeep = subscriptions[0];
            const subscriptionsToDelete = subscriptions.slice(1);
            
            console.log(`🔄 [CLEANUP] User ${duplicate.userId}:`);
            console.log(`   ✅ Keeping: ${subscriptionToKeep.id} (amount: ${subscriptionToKeep.amount_paid}, dodo_subscription_id: ${subscriptionToKeep.dodo_subscription_id})`);
            
            for (const subscriptionToDelete of subscriptionsToDelete) {
                console.log(`   🗑️  Deleting: ${subscriptionToDelete.id} (amount: ${subscriptionToDelete.amount_paid}, dodo_subscription_id: ${subscriptionToDelete.dodo_subscription_id})`);
                
                const { error: deleteError } = await supabase
                    .from('subscriptions')
                    .delete()
                    .eq('id', subscriptionToDelete.id);
                
                if (deleteError) {
                    console.error(`   ❌ Error deleting subscription ${subscriptionToDelete.id}:`, deleteError);
                } else {
                    deletedCount++;
                    deletedIds.push(subscriptionToDelete.id);
                }
            }
            
            keptCount++;
            keptIds.push(subscriptionToKeep.id);
        }
        
        console.log(`✅ [CLEANUP] Cleanup complete: Deleted ${deletedCount} duplicate subscriptions, kept ${keptCount} subscriptions`);
        
        return res.status(200).json({
            success: true,
            message: `Cleanup complete: Deleted ${deletedCount} duplicate subscriptions, kept ${keptCount} subscriptions`,
            deleted: deletedCount,
            kept: keptCount,
            deletedIds,
            keptIds,
            duplicateUsers: duplicates.length
        });
        
    } catch (error) {
        console.error('❌ [CLEANUP] General error:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Internal server error', 
            details: error.message 
        });
    }
}

