// Vercel serverless function to cancel a subscription via Dodo Payments API
// This endpoint is called from the frontend when user cancels subscription

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
        // Get authorization header (Supabase JWT token)
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized - No token provided' });
        }
        
        const token = authHeader.replace('Bearer ', '');
        
        // Initialize Supabase
        const supabaseUrl = process.env.SUPABASE_URL || 'https://yaaxydrmuslgzjletzbw.supabase.co';
        const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhYXh5ZHJtdXNsZ3pqbGV0emJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyOTQ3NjksImV4cCI6MjA3Nzg3MDc2OX0.uv4fqCgRxq7HCT5TWvFxq5xHOUNFT3PI4nmvhhPS2Qk';
        
        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        
        // Verify user token and get user
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        
        if (authError || !user) {
            console.error('Auth error:', authError);
            return res.status(401).json({ error: 'Unauthorized - Invalid token' });
        }
        
        console.log('✅ User authenticated:', user.id, user.email);
        
        // Get user's subscription from Supabase
        const { data: subscription, error: subError } = await supabase
            .from('subscriptions')
            .select('*')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .single();
        
        if (subError || !subscription) {
            console.error('Error fetching subscription:', subError);
            return res.status(404).json({ error: 'No active subscription found' });
        }
        
        // Check if we have Dodo Payments subscription ID
        const dodoSubscriptionId = subscription.dodo_subscription_id;
        
        if (!dodoSubscriptionId) {
            console.warn('⚠️ No Dodo Payments subscription ID found, updating Supabase only');
            // Update Supabase only (fallback for subscriptions created before we stored the ID)
            const { data: updatedSub, error: updateError } = await supabase
                .from('subscriptions')
                .update({
                    status: 'cancelled',
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', user.id)
                .select()
                .single();
            
            if (updateError) {
                console.error('Error updating subscription:', updateError);
                return res.status(500).json({ error: 'Failed to update subscription' });
            }
            
            return res.status(200).json({ 
                success: true, 
                message: 'Subscription cancelled (Supabase only - no Dodo Payments ID)',
                subscription: updatedSub
            });
        }
        
        // Get Dodo Payments API key from environment variables
        const dodoApiKey = process.env.DODO_PAYMENTS_API_KEY;
        
        if (!dodoApiKey) {
            console.error('❌ DODO_PAYMENTS_API_KEY not configured');
            // Still update Supabase
            const { data: updatedSub, error: updateError } = await supabase
                .from('subscriptions')
                .update({
                    status: 'cancelled',
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', user.id)
                .select()
                .single();
            
            if (updateError) {
                return res.status(500).json({ error: 'Failed to update subscription' });
            }
            
            return res.status(200).json({ 
                success: true, 
                message: 'Subscription cancelled (Supabase only - API key not configured)',
                subscription: updatedSub
            });
        }
        
        // Determine API endpoint (test vs production)
        const isTestMode = process.env.DODO_PAYMENTS_TEST_MODE === 'true' || dodoApiKey.includes('test');
        const apiBaseUrl = isTestMode 
            ? 'https://api.test.dodopayments.com'
            : 'https://api.dodopayments.com';
        
        // Call Dodo Payments API to cancel subscription
        // According to Dodo Payments docs: PATCH /subscriptions/{subscription_id}
        // with body: { cancel_at_next_billing_date: true }
        console.log('📞 Calling Dodo Payments API to cancel subscription:', dodoSubscriptionId);
        
        const dodoResponse = await fetch(`${apiBaseUrl}/subscriptions/${dodoSubscriptionId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${dodoApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                cancel_at_next_billing_date: true
            })
        });
        
        if (!dodoResponse.ok) {
            const errorData = await dodoResponse.text();
            console.error('❌ Dodo Payments API error:', dodoResponse.status, errorData);
            
            // Still update Supabase even if Dodo Payments call failed
            const { data: updatedSub, error: updateError } = await supabase
                .from('subscriptions')
                .update({
                    status: 'cancelled',
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', user.id)
                .select()
                .single();
            
            return res.status(200).json({ 
                success: true, 
                message: 'Subscription cancelled in Supabase (Dodo Payments API call failed)',
                subscription: updatedSub,
                warning: 'Dodo Payments cancellation may not have been processed'
            });
        }
        
        const dodoData = await dodoResponse.json();
        console.log('✅ Dodo Payments subscription cancelled:', dodoData);
        
        // Update Supabase subscription status
        const { data: updatedSub, error: updateError } = await supabase
            .from('subscriptions')
            .update({
                status: 'cancelled',
                updated_at: new Date().toISOString()
            })
            .eq('user_id', user.id)
            .select()
            .single();
        
        if (updateError) {
            console.error('Error updating Supabase:', updateError);
            // Dodo Payments cancellation succeeded, but Supabase update failed
            return res.status(200).json({ 
                success: true, 
                message: 'Subscription cancelled in Dodo Payments (Supabase update failed)',
                dodoResponse: dodoData,
                warning: 'Supabase may not reflect cancellation'
            });
        }
        
        console.log('✅ Subscription cancelled successfully in both Dodo Payments and Supabase');
        
        return res.status(200).json({ 
            success: true, 
            message: 'Subscription cancelled successfully',
            subscription: updatedSub,
            dodoResponse: dodoData
        });
        
    } catch (error) {
        console.error('❌ Error cancelling subscription:', error);
        return res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
}

