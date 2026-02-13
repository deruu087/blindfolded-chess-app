// Vercel serverless function to cancel a subscription via Dodo Payments API
// This endpoint is called from the frontend when user cancels subscription

import { createClient } from '@supabase/supabase-js';
import { sendEmailDirect } from './email-helpers.js';

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
            console.error('❌ SUPABASE_URL not configured');
            return res.status(500).json({ error: 'Server configuration error: SUPABASE_URL missing' });
        }
        
        const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
        if (!supabaseAnonKey) {
            console.error('❌ SUPABASE_ANON_KEY not configured');
            return res.status(500).json({ error: 'Server configuration error: SUPABASE_ANON_KEY missing' });
        }
        
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
        
        // Get Dodo Payments API key from environment variable first (needed for fetching subscription ID)
        // Dodo Payments determines test/live mode by the key itself, not by a separate flag
        const dodoApiKey = process.env.DODO_PAYMENTS_API_KEY?.trim();
        
        // Check if we have Dodo Payments subscription ID
        // IMPORTANT: Use subscription ID from Subscriptions dashboard, NOT payment ID
        let dodoSubscriptionId = subscription.dodo_subscription_id;
        
        console.log('🔍 Subscription ID from database:', dodoSubscriptionId);
        console.log('🔍 Full subscription object:', JSON.stringify(subscription, null, 2));
        
        // If no subscription ID, try to fetch it from Dodo Payments using payment records
        if (!dodoSubscriptionId) {
            console.warn('⚠️ No Dodo Payments subscription ID found in database');
            console.log('🔍 Attempting to fetch subscription ID from Dodo Payments using payment records...');
            
            if (!dodoApiKey) {
                console.error('❌ Cannot fetch subscription ID: DODO_PAYMENTS_API_KEY not configured');
                return res.status(500).json({ 
                    success: false,
                    error: 'Server configuration error',
                    message: 'DODO_PAYMENTS_API_KEY is not configured. Cannot fetch subscription ID or cancel subscription. Please contact support at hi@memo-chess.com',
                    hint: 'The API key is required to interact with Dodo Payments API.'
                });
            }
            
            // Get the most recent payment for this user
            const { data: recentPayment, error: paymentError } = await supabaseAdmin
                .from('payments')
                .select('order_id, transaction_id')
                .eq('user_id', user.id)
                .order('payment_date', { ascending: false })
                .limit(1)
                .maybeSingle();
            
            if (!paymentError && recentPayment && (recentPayment.order_id || recentPayment.transaction_id)) {
                const paymentId = recentPayment.order_id || recentPayment.transaction_id;
                console.log('🔍 Found payment record with ID:', paymentId);
                
                // Try to fetch subscription ID from Dodo Payments
                const apiBaseUrl = dodoApiKey.startsWith('sk_test_') 
                    ? 'https://test.dodopayments.com'
                    : 'https://live.dodopayments.com';
                
                try {
                    // Try to get subscription ID from payment/order
                    const getSubscriptionIdUrl = `${apiBaseUrl}/payments/${paymentId}`;
                    const paymentResponse = await fetch(getSubscriptionIdUrl, {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${dodoApiKey}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    if (paymentResponse.ok) {
                        const paymentData = await paymentResponse.json();
                        dodoSubscriptionId = paymentData.subscription_id || paymentData.subscription?.id;
                        
                        if (dodoSubscriptionId) {
                            console.log('✅ Successfully fetched subscription ID from Dodo Payments:', dodoSubscriptionId);
                            
                            // Update subscription with the fetched ID
                            await supabaseAdmin
                                .from('subscriptions')
                                .update({ dodo_subscription_id: dodoSubscriptionId })
                                .eq('user_id', user.id);
                        }
                    }
                } catch (fetchError) {
                    console.warn('⚠️ Could not fetch subscription ID from Dodo Payments:', fetchError.message);
                }
            }
            
            // If still no subscription ID, allow cancellation but only update Supabase
            // User will need to cancel manually in Dodo Payments dashboard
            if (!dodoSubscriptionId) {
                console.warn('⚠️ No subscription ID found - will only update Supabase');
                console.warn('⚠️ User needs to cancel subscription manually in Dodo Payments dashboard');
                
                // Update Supabase to cancelled status
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
                    return res.status(500).json({ 
                        success: false,
                        error: 'Failed to update subscription: ' + updateError.message 
                    });
                }
                
                console.log('✅ Supabase: status = cancelled (no Dodo subscription ID found)');
                
                // Send cancellation email (NON-BLOCKING - wrapped in try-catch)
                // Store promise to prevent garbage collection and ensure Vercel keeps function alive
                const emailPromise1 = (async () => {
                    try {
                        const userName = user?.user_metadata?.name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Chess Player';
                        
                        console.log('📧 [CANCEL] Preparing to send cancellation email to:', user.email);
                        
                        if (typeof sendEmailDirect !== 'function') {
                            console.error('❌ [CANCEL] sendEmailDirect is not a function!');
                            return;
                        }
                        
                        const result = await sendEmailDirect('subscription_cancelled', user.email, userName);
                        
                        if (result.success) {
                            console.log('✅ [CANCEL] Cancellation email sent successfully:', result.messageId);
                        } else {
                            console.error('❌ [CANCEL] Email sending failed:', result.error);
                            if (result.details) {
                                console.error('❌ [CANCEL] Email error details:', JSON.stringify(result.details, null, 2));
                            }
                        }
                    } catch (emailError) {
                        // Silently fail - email is optional, cancellation already succeeded
                        console.error('❌ [CANCEL] Could not send cancellation email:', emailError.message);
                        console.error('❌ [CANCEL] Email error stack:', emailError.stack);
                    }
                })(); // Execute immediately, don't await
                
                // Attach error handler to prevent unhandled rejection
                emailPromise1.catch(err => {
                    console.error('❌ [CANCEL] Unhandled email promise rejection:', err.message);
                });
                
                // Store promise globally to prevent garbage collection
                if (!global.emailPromises) {
                    global.emailPromises = [];
                }
                global.emailPromises.push(emailPromise1);
                
                console.log('📧 [CANCEL] Email send process initiated (non-blocking)');
                
                return res.status(200).json({ 
                    success: true, 
                    message: 'Subscription status updated in our system. Please cancel your subscription manually in the Dodo Payments dashboard to stop billing.',
                    subscription: updatedSub,
                    note: 'You need to cancel the subscription in Dodo Payments dashboard to stop future charges. The subscription has been marked as cancelled in our system.',
                    dodoPaymentsAction: 'Please visit Dodo Payments dashboard to cancel the subscription there'
                });
            }
        }
        
        // API key already checked above, log details
        console.log('🔑 API Key check:');
        console.log('   Key exists:', !!dodoApiKey);
        console.log('   Key length:', dodoApiKey ? dodoApiKey.length : 0);
        if (dodoApiKey) {
            console.log('   Key starts with:', dodoApiKey.substring(0, 10) + '...');
            console.log('   Key ends with:', '...' + dodoApiKey.substring(dodoApiKey.length - 10));
        }
        console.log('   ⚠️ IMPORTANT: Ensure the API key matches your subscription type (test or live)');
        
        // Dodo Payments API endpoint
        // Base URLs from Dodo Payments API Reference:
        // Test mode: https://test.dodopayments.com
        // Live mode: https://live.dodopayments.com
        // Auto-detect based on API key
        const apiBaseUrl = dodoApiKey.startsWith('sk_test_') 
            ? 'https://test.dodopayments.com'
            : 'https://live.dodopayments.com';
        
        console.log('📞 Using API base URL:', apiBaseUrl);
        console.log('📞 Mode:', dodoApiKey.startsWith('sk_test_') ? 'TEST' : 'LIVE');
        
        // Call Dodo Payments API to cancel subscription
        // IMPORTANT: Only update Supabase AFTER successful API call
        // Endpoint: PATCH https://test.dodopayments.com/subscriptions/{subscription_id}
        // Body: { "cancel_at_next_billing_date": true }
        // Headers: Authorization: Bearer {API_KEY}, Content-Type: application/json
        // Reference: https://docs.dodopayments.com/api-reference
        
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
        console.log('📞 Full API key (first 10 chars):', dodoApiKey ? dodoApiKey.substring(0, 10) + '...' : 'MISSING');
        console.log('📞 Full API key (last 10 chars):', dodoApiKey ? '...' + dodoApiKey.substring(dodoApiKey.length - 10) : 'MISSING');
        console.log('📞 API key format check:');
        console.log('   - Starts with sk_test_?', dodoApiKey?.startsWith('sk_test_'));
        console.log('   - Starts with sk_live_?', dodoApiKey?.startsWith('sk_live_'));
        console.log('   - Starts with _?', dodoApiKey?.startsWith('_'));
        console.log('   - Contains dots?', dodoApiKey?.includes('.'));
        
        let dodoResponse;
        let dodoData;
        
        try {
            // Cancel immediately in Dodo Payments (not scheduled)
            // Use status: 'cancelled' for immediate cancellation
            dodoResponse = await fetch(fullUrl, {
                method: 'PATCH',
                headers: headers,
                body: JSON.stringify({
                    status: 'cancelled'
                })
            });
            
            console.log('📞 Dodo Payments response status:', dodoResponse.status);
            
            if (!dodoResponse.ok) {
                const errorText = await dodoResponse.text();
                console.error('❌ Dodo Payments API error:', dodoResponse.status);
                console.error('❌ Error response:', errorText);
                console.error('❌ Full error details:');
                console.error('   Status:', dodoResponse.status);
                console.error('   Status Text:', dodoResponse.statusText);
                console.error('   Response Headers:', JSON.stringify(Object.fromEntries(dodoResponse.headers.entries()), null, 2));
                console.error('   Error Body:', errorText);
                console.error('   API Key Used: DODO_PAYMENTS_API_KEY');
                console.error('   Subscription ID:', dodoSubscriptionId);
                console.error('   Full URL:', fullUrl);
                
                // Don't fail - just update Supabase and inform user they need to cancel manually
                console.warn('⚠️ Dodo Payments API call failed - will update Supabase only');
                console.warn('⚠️ User needs to cancel subscription manually in Dodo Payments dashboard');
                
                // Calculate when access ends (end of current billing period)
                const nextBillingDate = subscription.next_billing_date ? new Date(subscription.next_billing_date) : null;
                let accessEndDate = nextBillingDate;
                
                if (!accessEndDate && subscription.start_date) {
                    accessEndDate = new Date(subscription.start_date);
                    if (subscription.plan_type === 'monthly') {
                        accessEndDate.setMonth(accessEndDate.getMonth() + 1);
                    } else if (subscription.plan_type === 'quarterly') {
                        accessEndDate.setMonth(accessEndDate.getMonth() + 3);
                    }
                }
                
                if (!accessEndDate) {
                    accessEndDate = new Date();
                    accessEndDate.setMonth(accessEndDate.getMonth() + 1);
                }
                
                // Update Supabase anyway
                const { data: updatedSub, error: updateError } = await supabaseAdmin
                    .from('subscriptions')
                    .update({
                        status: 'cancelled',
                        end_date: accessEndDate.toISOString().split('T')[0],
                        updated_at: new Date().toISOString()
                    })
                    .eq('user_id', user.id)
                    .select()
                    .single();
                
                if (updateError) {
                    console.error('❌ Error updating Supabase:', updateError);
                    return res.status(500).json({ 
                        success: false,
                        error: 'Failed to update subscription: ' + updateError.message 
                    });
                }
                
                console.log('✅ Supabase: status = cancelled, access until:', accessEndDate.toISOString().split('T')[0]);
                
                // Send cancellation email (NON-BLOCKING - wrapped in try-catch)
                // Store promise to prevent garbage collection and ensure Vercel keeps function alive
                const emailPromise2 = (async () => {
                    try {
                        const userName = user?.user_metadata?.name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Chess Player';
                        
                        console.log('📧 [CANCEL] Preparing to send cancellation email to:', user.email);
                        
                        if (typeof sendEmailDirect !== 'function') {
                            console.error('❌ [CANCEL] sendEmailDirect is not a function!');
                            return;
                        }
                        
                        const result = await sendEmailDirect('subscription_cancelled', user.email, userName);
                        
                        if (result.success) {
                            console.log('✅ [CANCEL] Cancellation email sent successfully:', result.messageId);
                        } else {
                            console.error('❌ [CANCEL] Email sending failed:', result.error);
                            if (result.details) {
                                console.error('❌ [CANCEL] Email error details:', JSON.stringify(result.details, null, 2));
                            }
                        }
                    } catch (emailError) {
                        // Silently fail - email is optional, cancellation already succeeded
                        console.error('❌ [CANCEL] Could not send cancellation email:', emailError.message);
                        console.error('❌ [CANCEL] Email error stack:', emailError.stack);
                    }
                })(); // Execute immediately, don't await
                
                // Attach error handler to prevent unhandled rejection
                emailPromise2.catch(err => {
                    console.error('❌ [CANCEL] Unhandled email promise rejection:', err.message);
                });
                
                // Store promise globally to prevent garbage collection
                if (!global.emailPromises) {
                    global.emailPromises = [];
                }
                global.emailPromises.push(emailPromise2);
                
                console.log('📧 [CANCEL] Email send process initiated (non-blocking)');
                
                // Return success but inform user they need to cancel manually
                return res.status(200).json({ 
                    success: true, 
                    message: 'Subscription status updated in our system. However, we could not cancel it in Dodo Payments automatically. Please cancel your subscription manually in the Dodo Payments dashboard to stop future billing.',
                    subscription: updatedSub,
                    dodoPaymentsAction: 'Please visit Dodo Payments dashboard to cancel the subscription there',
                    dodoError: errorText,
                    accessEndDate: accessEndDate.toISOString().split('T')[0],
                    note: 'Subscription is marked as cancelled in our system, but you must cancel it in Dodo Payments to stop billing'
                });
            }
            
            // API call succeeded - parse response
            try {
                dodoData = await dodoResponse.json();
                console.log('✅ Dodo Payments cancellation successful');
                console.log('📦 Full Dodo Payments response:', JSON.stringify(dodoData, null, 2));
                console.log('📦 Subscription status in response:', dodoData?.status);
                console.log('📦 Cancel at next billing date:', dodoData?.cancel_at_next_billing_date);
                console.log('📦 Cancel at period end:', dodoData?.cancel_at_period_end);
            } catch (jsonError) {
                // Some APIs return empty body on success
                console.log('✅ Dodo Payments cancellation successful (no response body)');
                console.log('⚠️ No response body - cannot verify cancellation status');
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
        
        // IMPORTANT: Subscription IS cancelled (in Dodo Payments), but access continues until end_date
        console.log('✅ Dodo Payments API call succeeded - subscription cancelled immediately in Dodo');
        console.log('📋 Subscription is cancelled, but access continues until end of billing period');
        
        // Calculate when access ends (end of current billing period)
        // Use next_billing_date if available, otherwise calculate from start_date
        const nextBillingDate = subscription.next_billing_date ? new Date(subscription.next_billing_date) : null;
        let accessEndDate = nextBillingDate;
        
        // If no next_billing_date, calculate from start_date + billing period
        if (!accessEndDate && subscription.start_date) {
            accessEndDate = new Date(subscription.start_date);
            // Add billing period (monthly = 1 month, quarterly = 3 months)
            if (subscription.plan_type === 'monthly') {
                accessEndDate.setMonth(accessEndDate.getMonth() + 1);
            } else if (subscription.plan_type === 'quarterly') {
                accessEndDate.setMonth(accessEndDate.getMonth() + 3);
            }
        }
        
        // If still no date, use current date + 1 month as fallback
        if (!accessEndDate) {
            accessEndDate = new Date();
            accessEndDate.setMonth(accessEndDate.getMonth() + 1);
        }
        
        // Update Supabase: status = 'cancelled' (subscription IS cancelled)
        // But end_date = when access ends (user keeps access until then)
        const { data: updatedSub, error: updateError } = await supabaseAdmin
            .from('subscriptions')
            .update({
                status: 'cancelled', // Subscription IS cancelled
                end_date: accessEndDate.toISOString().split('T')[0], // Access ends on this date
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
                message: 'Subscription cancelled immediately in Dodo Payments (Supabase update failed)',
                dodoResponse: dodoData,
                warning: 'Supabase may not reflect cancellation - please check manually'
            });
        }
        
        console.log('✅ Subscription cancelled immediately in Dodo Payments');
        console.log('✅ Supabase: status = cancelled, access until:', accessEndDate.toISOString().split('T')[0]);
        
        // Send cancellation email (NON-BLOCKING - wrapped in try-catch)
        // Store promise to prevent garbage collection and ensure Vercel keeps function alive
        const emailPromise = (async () => {
            try {
                const userName = user?.user_metadata?.name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Chess Player';
                
                console.log('📧 [CANCEL] Preparing to send cancellation email to:', user.email);
                
                if (typeof sendEmailDirect !== 'function') {
                    console.error('❌ [CANCEL] sendEmailDirect is not a function!');
                    return;
                }
                
                const result = await sendEmailDirect('subscription_cancelled', user.email, userName);
                
                if (result.success) {
                    console.log('✅ [CANCEL] Cancellation email sent successfully:', result.messageId);
                } else {
                    console.error('❌ [CANCEL] Email sending failed:', result.error);
                    if (result.details) {
                        console.error('❌ [CANCEL] Email error details:', JSON.stringify(result.details, null, 2));
                    }
                }
            } catch (emailError) {
                // Silently fail - email is optional, cancellation already succeeded
                console.error('❌ [CANCEL] Could not send cancellation email:', emailError.message);
                console.error('❌ [CANCEL] Email error stack:', emailError.stack);
            }
        })(); // Execute immediately, don't await
        
        // Attach error handler to prevent unhandled rejection
        emailPromise.catch(err => {
            console.error('❌ [CANCEL] Unhandled email promise rejection:', err.message);
        });
        
        // Store promise globally to prevent garbage collection
        // This ensures Vercel keeps the function alive long enough for email to send
        if (!global.emailPromises) {
            global.emailPromises = [];
        }
        global.emailPromises.push(emailPromise);
        
        console.log('📧 [CANCEL] Email send process initiated (non-blocking)');
        
        return res.status(200).json({ 
            success: true, 
            message: 'Subscription cancelled successfully. Your access will continue until the end of your current billing period.',
            subscription: updatedSub,
            dodoResponse: dodoData,
            accessEndDate: accessEndDate.toISOString().split('T')[0],
            note: 'Subscription status is cancelled, but access continues until end_date'
        });
        
    } catch (error) {
        console.error('❌ Error cancelling subscription:', error);
        return res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
}

