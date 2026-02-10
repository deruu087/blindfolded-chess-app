// Vercel serverless function to sync subscription from Dodo Payments to Supabase
// This can be called manually or from payment-success page if webhook didn't fire

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
        const { userEmail, subscriptionId, amount, currency, planType, paymentDate } = req.body;
        
        console.log('🔄 [SYNC] Syncing subscription to Supabase:', {
            userEmail,
            subscriptionId,
            amount,
            currency,
            planType,
            paymentDate
        });
        
        // Validate required fields
        if (!userEmail) {
            return res.status(400).json({ error: 'Missing required field: userEmail' });
        }
        
        if (!amount || !currency || !planType) {
            return res.status(400).json({ error: 'Missing required fields: amount, currency, or planType' });
        }
        
        // Warn if subscription ID looks like a generated ID (but still allow it as fallback)
        if (subscriptionId && subscriptionId.startsWith('sync_')) {
            console.warn('⚠️ [SYNC] WARNING: Subscription ID appears to be generated (starts with "sync_")');
            console.warn('⚠️ [SYNC] This means the real subscription ID could not be fetched from Dodo Payments');
            console.warn('⚠️ [SYNC] The webhook should update this with the correct subscription ID when it fires');
            console.warn('⚠️ [SYNC] Cancellation may not work until the webhook updates the subscription ID');
        }
        
        // Initialize Supabase
        const supabaseUrl = process.env.SUPABASE_URL;
        if (!supabaseUrl) {
            console.error('❌ SUPABASE_URL not configured');
            return res.status(500).json({ error: 'Server configuration error: SUPABASE_URL missing' });
        }
        
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
        if (!supabaseServiceKey) {
            console.error('❌ SUPABASE_SERVICE_ROLE_KEY not configured');
            return res.status(500).json({ error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY missing' });
        }
        
        const supabase = createClient(supabaseUrl, supabaseServiceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });
        
        // Find user by email
        let userId = null;
        let foundUser = null;
        try {
            const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
            
            if (userError) {
                console.error('❌ Error listing users:', userError);
                return res.status(500).json({ error: 'Failed to find user', message: userError.message });
            } else if (users) {
                foundUser = users.find(u => u.email === userEmail);
                if (foundUser) {
                    userId = foundUser.id;
                    console.log('✅ Found user:', userId, 'for email:', userEmail);
                } else {
                    console.error('❌ User not found for email:', userEmail);
                    return res.status(404).json({ 
                        error: 'User not found', 
                        message: `No user found with email: ${userEmail}` 
                    });
                }
            }
        } catch (error) {
            console.error('❌ Error finding user:', error);
            return res.status(500).json({ error: 'Error finding user', message: error.message });
        }
        
        // Validate plan type
        if (planType !== 'monthly' && planType !== 'quarterly') {
            return res.status(400).json({ error: 'Invalid plan_type - must be monthly or quarterly' });
        }
        
        const amountNum = parseFloat(amount);
        if (isNaN(amountNum)) {
            return res.status(400).json({ error: 'Invalid amount value' });
        }
        
        // Create/update subscription
        const subscriptionData = {
            user_id: userId,
            email: userEmail,
            plan_type: planType,
            status: 'active',
            start_date: paymentDate ? paymentDate.split('T')[0] : new Date().toISOString().split('T')[0],
            end_date: null,
            amount_paid: amountNum,
            currency: currency,
            payment_method: 'dodo_payments',
            dodo_subscription_id: subscriptionId || null,
            updated_at: new Date().toISOString()
        };
        
        console.log('📝 [SYNC] Creating subscription:', subscriptionData);
        
        const { data: subscription, error: subError } = await supabase
            .from('subscriptions')
            .upsert(subscriptionData, {
                onConflict: 'user_id'
            })
            .select()
            .single();
        
        if (subError) {
            console.error('❌ Error creating/updating subscription:', subError);
            return res.status(500).json({ 
                error: 'Failed to create subscription',
                message: subError.message 
            });
        }
        
        console.log('✅ [SYNC] Subscription created/updated:', subscription);
        
        // Construct invoice URL using Dodo Payments pattern: /invoices/payments/{payment_id}
        // IMPORTANT: Must use payment_id (pay_XXX), NOT subscription_id (sub_XXX)
        // Format: https://test.dodopayments.com/invoices/payments/pay_XXX
        let invoiceUrl = `https://checkout.dodopayments.com/account`; // Default fallback
        let paymentId = null; // Declare outside if block so it's always available
        
        if (subscriptionId && !subscriptionId.startsWith('sync_')) {
            // Only try if we have a real subscription ID (not a generated one)
            const dodoApiKey = process.env.DODO_PAYMENTS_API_KEY?.trim();
            if (dodoApiKey) {
                const apiBaseUrl = dodoApiKey.startsWith('sk_test_') 
                    ? 'https://test.dodopayments.com'
                    : 'https://live.dodopayments.com';
                
                console.log('🔍 [SYNC] Attempting to get payment ID for invoice URL...');
                
                // If subscriptionId is actually a payment ID (pay_XXX), use it directly
                if (subscriptionId.startsWith('pay_')) {
                    paymentId = subscriptionId;
                    invoiceUrl = `${apiBaseUrl}/invoices/payments/${paymentId}`;
                    console.log('✅ [SYNC] Subscription ID is actually a payment ID, using it:', invoiceUrl);
                } else if (subscriptionId.startsWith('sub_')) {
                    // It's a subscription ID, need to fetch subscription to get payment_id
                    try {
                        const subscriptionUrl = `${apiBaseUrl}/subscriptions/${subscriptionId}`;
                        console.log('🔍 [SYNC] Fetching subscription to get payment_id:', subscriptionUrl);
                        const subResponse = await fetch(subscriptionUrl, {
                            method: 'GET',
                            headers: {
                                'Authorization': `Bearer ${dodoApiKey}`,
                                'Content-Type': 'application/json'
                            }
                        });
                        
                        if (subResponse.ok) {
                            const subData = await subResponse.json();
                            console.log('📄 [SYNC] Subscription data:', JSON.stringify(subData, null, 2));
                            
                            // Extract payment_id from subscription data
                            paymentId = subData.payment_id || 
                                       subData.latest_payment_id || 
                                       subData.payments?.[0]?.payment_id ||
                                       subData.payments?.[0]?.id ||
                                       subData.last_payment_id;
                            
                            if (paymentId && paymentId.startsWith('pay_')) {
                                invoiceUrl = `${apiBaseUrl}/invoices/payments/${paymentId}`;
                                console.log('✅ [SYNC] Found payment_id from subscription, constructed invoice URL:', invoiceUrl);
                            } else {
                                console.log('⚠️ [SYNC] Subscription data does not contain payment_id in expected format');
                                console.log('🔍 [SYNC] Available fields:', Object.keys(subData));
                            }
                        } else {
                            const errorText = await subResponse.text();
                            console.log('⚠️ [SYNC] Subscription endpoint returned error:', subResponse.status, errorText);
                        }
                    } catch (error) {
                        console.warn('⚠️ [SYNC] Could not fetch subscription data:', error.message);
                    }
                } else {
                    console.log('⚠️ [SYNC] Subscription ID format not recognized:', subscriptionId);
                }
            }
        } else {
            console.log('⚠️ [SYNC] Using generated subscription ID, skipping invoice URL construction');
        }
        
        // Extract payment_id if we found one
        let extractedPaymentId = null;
        if (subscriptionId && subscriptionId.startsWith('pay_')) {
            extractedPaymentId = subscriptionId;
        } else if (paymentId && paymentId.startsWith('pay_')) {
            extractedPaymentId = paymentId;
        }
        
        // Create payment record
        const paymentData = {
            user_id: userId,
            email: userEmail,
            amount: amountNum,
            currency: currency,
            status: 'paid',
            payment_date: paymentDate || new Date().toISOString(),
            invoice_url: invoiceUrl, // Use fetched invoice URL or fallback
            payment_id: extractedPaymentId, // Store Dodo Payments payment ID
            order_id: subscriptionId || `sync_${Date.now()}`,
            transaction_id: subscriptionId || `sync_${Date.now()}`,
            payment_method: 'dodo_payments',
            description: `${planType} subscription payment`
        };
        
        if (extractedPaymentId) {
            console.log('✅ [SYNC] Storing payment_id:', extractedPaymentId);
        } else {
            console.log('⚠️ [SYNC] No payment_id found in format pay_XXX');
        }
        
        console.log('📝 [SYNC] Creating payment record:', paymentData);
        
        const { data: payment, error: paymentError } = await supabase
            .from('payments')
            .insert(paymentData)
            .select()
            .single();
        
        if (paymentError) {
            console.error('⚠️ Error creating payment record:', paymentError);
            // Don't fail - subscription was created successfully
            return res.status(200).json({ 
                success: true, 
                message: 'Subscription created but payment record failed',
                subscription: subscription,
                paymentError: paymentError.message
            });
        }
        
        console.log('✅ [SYNC] Payment record created:', payment);
        
        // Send subscription confirmation email (NON-BLOCKING)
        console.log('📧 [SYNC] Starting email send process for:', userEmail);
        // Use IIFE to handle async without blocking
        // Store promise to prevent garbage collection
        const emailPromise = (async () => {
            try {
                const planName = planType === 'monthly' ? 'Monthly Premium' : 'Quarterly Premium';
                const userName = userEmail.split('@')[0]; // Use email prefix as name
                
                console.log('📧 [SYNC] Sending subscription confirmation email directly (no HTTP call)');
                console.log('📧 [SYNC] Email data:', { planName, amount, currency, to: userEmail });
                
                const emailStartTime = Date.now();
                const result = await sendEmailDirect('subscription_confirmed', userEmail, userName, {
                    planName,
                    amount,
                    currency
                });
                
                const emailDuration = Date.now() - emailStartTime;
                
                if (result.success) {
                    console.log('✅ [SYNC] Subscription confirmation email sent successfully in', emailDuration, 'ms:', result.messageId);
                } else {
                    console.warn('⚠️ [SYNC] Email sending failed:', result.error);
                    if (result.details) {
                        console.warn('⚠️ [SYNC] Email error details:', result.details);
                    }
                }
            } catch (emailError) {
                // Log full error details for debugging
                console.warn('⚠️ [SYNC] Could not send subscription email (non-critical):', emailError.message);
                console.warn('⚠️ [SYNC] Email error stack:', emailError.stack);
                console.warn('⚠️ [SYNC] Email error name:', emailError.name);
            }
        })(); // Execute immediately, don't await
        
        // Attach error handler to prevent unhandled rejection
        emailPromise.catch(err => {
            console.warn('⚠️ [SYNC] Unhandled email promise rejection:', err.message);
        });
        
        return res.status(200).json({ 
            success: true, 
            message: 'Subscription and payment synced successfully',
            subscription: subscription,
            payment: payment
        });
        
    } catch (error) {
        console.error('❌ [SYNC] Error syncing subscription:', error);
        return res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
}

