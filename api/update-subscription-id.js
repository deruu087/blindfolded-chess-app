// Vercel serverless function to update subscription ID for existing subscriptions
// This can be called to fix subscriptions that don't have dodo_subscription_id

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
        const supabaseUrl = process.env.SUPABASE_URL;
        if (!supabaseUrl) {
            return res.status(500).json({ error: 'SUPABASE_URL not configured' });
        }
        
        const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
        if (!supabaseAnonKey) {
            return res.status(500).json({ error: 'SUPABASE_ANON_KEY not configured' });
        }
        
        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        
        // Verify user token and get user
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        
        if (authError || !user) {
            return res.status(401).json({ error: 'Unauthorized - Invalid token' });
        }
        
        console.log('✅ User authenticated:', user.id, user.email);
        
        // Get Dodo Payments API key
        const dodoApiKey = process.env.DODO_PAYMENTS_API_KEY?.trim();
        if (!dodoApiKey) {
            return res.status(500).json({ error: 'DODO_PAYMENTS_API_KEY not configured' });
        }
        
        // Use service role key to access subscriptions
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const supabaseAdmin = supabaseServiceKey 
            ? createClient(supabaseUrl, supabaseServiceKey, {
                auth: { autoRefreshToken: false, persistSession: false }
            })
            : supabase;
        
        // Get user's subscription
        const { data: subscription, error: subError } = await supabaseAdmin
            .from('subscriptions')
            .select('*')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        
        if (subError) {
            return res.status(500).json({ error: 'Error fetching subscription: ' + subError.message });
        }
        
        if (!subscription) {
            return res.status(404).json({ error: 'No subscription found' });
        }
        
        // If subscription already has ID, return it
        if (subscription.dodo_subscription_id) {
            return res.status(200).json({ 
                success: true, 
                message: 'Subscription already has subscription ID',
                subscriptionId: subscription.dodo_subscription_id
            });
        }
        
        console.log('🔍 Subscription found, attempting to fetch subscription ID from Dodo Payments...');
        
        // Get payment records for this user
        const { data: payments, error: paymentError } = await supabaseAdmin
            .from('payments')
            .select('order_id, transaction_id, payment_date')
            .eq('user_id', user.id)
            .order('payment_date', { ascending: false })
            .limit(5);
        
        if (paymentError) {
            return res.status(500).json({ error: 'Error fetching payments: ' + paymentError.message });
        }
        
        if (!payments || payments.length === 0) {
            return res.status(404).json({ 
                error: 'No payment records found',
                message: 'Cannot fetch subscription ID without payment records'
            });
        }
        
        // Determine API base URL
        const apiBaseUrl = dodoApiKey.startsWith('sk_test_') 
            ? 'https://test.dodopayments.com'
            : 'https://live.dodopayments.com';
        
        // Try each payment ID to find the subscription
        let foundSubscriptionId = null;
        
        for (const payment of payments) {
            const paymentId = payment.order_id || payment.transaction_id;
            if (!paymentId || paymentId.startsWith('sync_')) {
                continue; // Skip generated IDs
            }
            
            console.log('🔍 Trying payment ID:', paymentId);
            
            // Try payments endpoint
            try {
                const paymentUrl = `${apiBaseUrl}/payments/${paymentId}`;
                const paymentResponse = await fetch(paymentUrl, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${dodoApiKey}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                console.log('📞 Payment endpoint response status:', paymentResponse.status);
                
                if (paymentResponse.ok) {
                    const paymentData = await paymentResponse.json();
                    console.log('📦 Payment data received:', JSON.stringify(paymentData, null, 2));
                    foundSubscriptionId = paymentData.subscription_id || paymentData.subscription?.id || paymentData.data?.subscription_id;
                    
                    if (foundSubscriptionId) {
                        console.log('✅ Found subscription ID:', foundSubscriptionId);
                        break;
                    } else {
                        console.log('⚠️ Payment data does not contain subscription_id');
                    }
                } else {
                    const errorText = await paymentResponse.text();
                    console.log('⚠️ Payment endpoint failed:', paymentResponse.status, errorText);
                }
            } catch (error) {
                console.log('⚠️ Error fetching from payments endpoint:', error.message);
            }
            
            // Try orders endpoint
            try {
                const orderUrl = `${apiBaseUrl}/orders/${paymentId}`;
                const orderResponse = await fetch(orderUrl, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${dodoApiKey}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                console.log('📞 Order endpoint response status:', orderResponse.status);
                
                if (orderResponse.ok) {
                    const orderData = await orderResponse.json();
                    console.log('📦 Order data received:', JSON.stringify(orderData, null, 2));
                    foundSubscriptionId = orderData.subscription_id || orderData.subscription?.id || orderData.data?.subscription_id;
                    
                    if (foundSubscriptionId) {
                        console.log('✅ Found subscription ID:', foundSubscriptionId);
                        break;
                    } else {
                        console.log('⚠️ Order data does not contain subscription_id');
                    }
                } else {
                    const errorText = await orderResponse.text();
                    console.log('⚠️ Order endpoint failed:', orderResponse.status, errorText);
                }
            } catch (error) {
                console.log('⚠️ Error fetching from orders endpoint:', error.message);
            }
        }
        
        if (!foundSubscriptionId) {
            console.error('❌ Could not find subscription ID from any payment record');
            console.error('❌ Payment IDs tried:', payments.map(p => p.order_id || p.transaction_id));
            
            // Try one more approach: search subscriptions by customer email
            console.log('🔍 Trying to find subscription by customer email:', user.email);
            try {
                // Dodo Payments API: List subscriptions for a customer
                // This might require a different endpoint structure
                const subscriptionsUrl = `${apiBaseUrl}/subscriptions?customer_email=${encodeURIComponent(user.email)}`;
                const subscriptionsResponse = await fetch(subscriptionsUrl, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${dodoApiKey}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (subscriptionsResponse.ok) {
                    const subscriptionsData = await subscriptionsResponse.json();
                    console.log('🔍 Subscriptions data:', JSON.stringify(subscriptionsData, null, 2));
                    
                    // Handle different response formats
                    const subscriptions = subscriptionsData.data || subscriptionsData.subscriptions || subscriptionsData;
                    if (Array.isArray(subscriptions) && subscriptions.length > 0) {
                        // Get the most recent active subscription
                        const activeSub = subscriptions.find(s => s.status === 'active' || s.status === 'Active') || subscriptions[0];
                        foundSubscriptionId = activeSub.id || activeSub.subscription_id;
                        
                        if (foundSubscriptionId) {
                            console.log('✅ Found subscription ID by email:', foundSubscriptionId);
                        }
                    }
                }
            } catch (emailError) {
                console.log('⚠️ Error searching by email:', emailError.message);
            }
        }
        
        if (!foundSubscriptionId) {
            return res.status(404).json({ 
                success: false,
                error: 'Subscription ID not found',
                message: 'Could not find subscription ID from payment records or by email search. The subscription may need to be manually updated in Supabase with the subscription ID from Dodo Payments dashboard.',
                hint: 'Please contact support at hi@memo-chess.com with your subscription details, or manually update the subscription in Supabase with the subscription ID from Dodo Payments dashboard.',
                paymentIdsTried: payments.map(p => ({ order_id: p.order_id, transaction_id: p.transaction_id }))
            });
        }
        
        // Update subscription with the found ID
        const { data: updatedSub, error: updateError } = await supabaseAdmin
            .from('subscriptions')
            .update({ 
                dodo_subscription_id: foundSubscriptionId,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', user.id)
            .select()
            .single();
        
        if (updateError) {
            return res.status(500).json({ 
                error: 'Failed to update subscription: ' + updateError.message 
            });
        }
        
        console.log('✅ Subscription updated with subscription ID:', foundSubscriptionId);
        
        return res.status(200).json({ 
            success: true, 
            message: 'Subscription ID updated successfully',
            subscriptionId: foundSubscriptionId,
            subscription: updatedSub
        });
        
    } catch (error) {
        console.error('❌ Error updating subscription ID:', error);
        return res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
}

