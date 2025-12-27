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
        // Use service role key to bypass RLS if needed
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const supabaseAdmin = supabaseServiceKey 
            ? createClient(supabaseUrl, supabaseServiceKey, {
                auth: { autoRefreshToken: false, persistSession: false }
            })
            : supabase;
        
        const { data: subscription, error: subError } = await supabaseAdmin
            .from('subscriptions')
            .select('*')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        
        console.log('🔍 Subscription query result:', { subscription, subError });
        
        if (subError) {
            console.error('❌ Error fetching subscription:', subError);
            return res.status(500).json({ error: 'Error fetching subscription: ' + subError.message });
        }
        
        if (!subscription) {
            console.error('❌ No active subscription found for user:', user.id);
            return res.status(404).json({ error: 'No active subscription found' });
        }
        
        console.log('✅ Found subscription:', subscription.id, subscription.status);
        
        // Check if we have Dodo Payments subscription ID
        // IMPORTANT: Use subscription ID from Subscriptions dashboard, NOT payment ID
        const dodoSubscriptionId = subscription.dodo_subscription_id;
        
        console.log('🔍 Subscription ID from database:', dodoSubscriptionId);
        console.log('🔍 Full subscription object:', JSON.stringify(subscription, null, 2));
        
        if (!dodoSubscriptionId) {
            console.warn('⚠️ No Dodo Payments subscription ID found, updating Supabase only');
            // Update Supabase only (fallback for subscriptions created before we stored the ID)
            const { data: updatedSub, error: updateError } = await supabaseAdmin
                .from('subscriptions')
                .update({
                    status: 'cancelled',
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', user.id)
                .select()
                .single();
            
            if (updateError) {
                console.error('❌ Error updating subscription:', updateError);
                return res.status(500).json({ error: 'Failed to update subscription: ' + updateError.message });
            }
            
            return res.status(200).json({ 
                success: true, 
                message: 'Subscription cancelled (Supabase only - no Dodo Payments ID)',
                subscription: updatedSub
            });
        }
        
        // Get Dodo Payments API keys from environment variables
        // Support both TEST and LIVE keys - use TEST key if available, otherwise LIVE key
        let dodoApiKey = process.env.DODO_PAYMENTS_TEST_API_KEY || process.env.DODO_PAYMENTS_API_KEY;
        
        // Trim whitespace in case there are extra spaces
        if (dodoApiKey) {
            dodoApiKey = dodoApiKey.trim();
        }
        
        const isTestKey = !!process.env.DODO_PAYMENTS_TEST_API_KEY;
        const isLiveKey = !!process.env.DODO_PAYMENTS_API_KEY && !isTestKey;
        
        console.log('🔑 API Key check:');
        console.log('   Using:', isTestKey ? 'TEST key' : isLiveKey ? 'LIVE key' : 'NO KEY');
        console.log('   Key exists:', !!dodoApiKey);
        console.log('   Key length:', dodoApiKey ? dodoApiKey.length : 0);
        console.log('   Key starts with:', dodoApiKey ? dodoApiKey.substring(0, 5) + '...' : 'N/A');
        console.log('   Key ends with:', dodoApiKey ? '...' + dodoApiKey.substring(dodoApiKey.length - 5) : 'N/A');
        console.log('   ⚠️ IMPORTANT: Test subscriptions require TEST API key, Live subscriptions require LIVE API key');
        
        if (!dodoApiKey) {
            console.error('❌ DODO_PAYMENTS_API_KEY not configured');
            // Still update Supabase
            const { data: updatedSub, error: updateError } = await supabaseAdmin
                .from('subscriptions')
                .update({
                    status: 'cancelled',
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', user.id)
                .select()
                .single();
            
            if (updateError) {
                console.error('❌ Error updating subscription:', updateError);
                return res.status(500).json({ error: 'Failed to update subscription: ' + updateError.message });
            }
            
            return res.status(200).json({ 
                success: true, 
                message: 'Subscription cancelled (Supabase only - API key not configured)',
                subscription: updatedSub
            });
        }
        
        // Dodo Payments API endpoint
        // IMPORTANT: There is only ONE API base URL: https://live.dodopayments.com
        // Test vs live mode is determined by the API key itself, not the URL
        // Test keys don't hit real money, but use the same endpoint
        const apiBaseUrl = 'https://live.dodopayments.com';
        
        console.log('📞 Using API base URL:', apiBaseUrl);
        console.log('📞 Note: Test/live mode determined by API key, not URL');
        
        // Call Dodo Payments API to cancel subscription
        // IMPORTANT: Only update Supabase AFTER successful API call
        // PATCH https://live.dodopayments.com/subscriptions/{subscription_id}
        // Body: { "cancel_at_next_billing_date": true }
        // Headers: Authorization: Bearer {API_KEY}, Content-Type: application/json
        
        const fullUrl = `${apiBaseUrl}/subscriptions/${dodoSubscriptionId}`;
        const dodoAuthHeader = `Bearer ${dodoApiKey}`;
        const headers = {
            'Authorization': dodoAuthHeader,
            'Content-Type': 'application/json'
        };
        
        console.log('📞 Calling Dodo Payments API to cancel subscription');
        console.log('📞 Subscription ID:', dodoSubscriptionId);
        console.log('📞 Full URL:', fullUrl);
        console.log('📞 Request method: PATCH');
        console.log('📞 Request body:', JSON.stringify({ cancel_at_next_billing_date: true }));
        console.log('📞 Auth header length:', dodoAuthHeader.length);
        console.log('📞 Auth header starts with:', dodoAuthHeader.substring(0, 20) + '...');
        
        let dodoResponse;
        let dodoData;
        
        try {
            dodoResponse = await fetch(fullUrl, {
                method: 'PATCH',
                headers: headers,
                body: JSON.stringify({
                    cancel_at_next_billing_date: true
                })
            });
            
            console.log('📞 Dodo Payments response status:', dodoResponse.status);
            
            if (!dodoResponse.ok) {
                const errorText = await dodoResponse.text();
                console.error('❌ Dodo Payments API error:', dodoResponse.status);
                console.error('❌ Error response:', errorText);
                
                // DO NOT update Supabase if API call failed
                // 401 specifically means wrong API key type (test vs live)
                if (dodoResponse.status === 401) {
                    const keyType = isTestKey ? 'TEST' : isLiveKey ? 'LIVE' : 'UNKNOWN';
                    return res.status(401).json({ 
                        success: false,
                        error: 'Authentication failed - API key mismatch',
                        message: `401 Unauthorized: You are using a ${keyType} API key, but this subscription requires a ${isTestKey ? 'LIVE' : 'TEST'} key. Test subscriptions must use TEST API key, Live subscriptions must use LIVE API key.`,
                        dodoError: errorText,
                        hint: 'Check if subscription is test or live, and use matching API key'
                    });
                }
                
                return res.status(dodoResponse.status).json({ 
                    success: false,
                    error: 'Failed to cancel subscription in Dodo Payments',
                    message: `Dodo Payments API returned ${dodoResponse.status}: ${errorText}`,
                    dodoError: errorText
                });
            }
            
            // API call succeeded - parse response
            try {
                dodoData = await dodoResponse.json();
                console.log('✅ Dodo Payments cancellation successful:', dodoData);
            } catch (jsonError) {
                // Some APIs return empty body on success
                console.log('✅ Dodo Payments cancellation successful (no response body)');
                dodoData = null;
            }
            
        } catch (fetchError) {
            console.error('❌ Fetch error calling Dodo Payments:', fetchError);
            console.error('❌ Fetch error details:', {
                message: fetchError.message,
                code: fetchError.code,
                cause: fetchError.cause
            });
            
            // DO NOT update Supabase if fetch failed
            return res.status(500).json({ 
                success: false,
                error: 'Network error calling Dodo Payments API',
                message: fetchError.message
            });
        }
        
        // Only update Supabase AFTER successful API call
        console.log('✅ Dodo Payments API call succeeded, updating Supabase...');
        
        const { data: updatedSub, error: updateError } = await supabaseAdmin
            .from('subscriptions')
            .update({
                status: 'cancelled',
                updated_at: new Date().toISOString()
            })
            .eq('user_id', user.id)
            .select()
            .single();
        
        if (updateError) {
            console.error('❌ Error updating Supabase:', updateError);
            // Dodo Payments cancelled but Supabase update failed
            return res.status(200).json({ 
                success: true, 
                message: 'Subscription cancelled in Dodo Payments (Supabase update failed)',
                dodoResponse: dodoData,
                warning: 'Supabase may not reflect cancellation - please check manually'
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

