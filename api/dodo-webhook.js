// Vercel serverless function to handle Dodo Payments webhooks
// This will automatically update Supabase subscriptions when payments succeed

import { createClient } from '@supabase/supabase-js';
import { sendEmailDirect } from './email-helpers.js';

// Verify email helper import
console.log('📧 [WEBHOOK] Email helper imported:', typeof sendEmailDirect);

/**
 * Helper function to get invoice URL from Dodo Payments API
 * Tries multiple endpoints and field names to find the invoice URL
 */
async function getInvoiceUrlFromDodo(paymentId, orderId, subscriptionId) {
    const dodoApiKey = process.env.DODO_PAYMENTS_API_KEY?.trim();
    if (!dodoApiKey) {
        console.warn('⚠️ [INVOICE] DODO_PAYMENTS_API_KEY not configured, cannot fetch invoice URL');
        return null;
    }
    
    const apiBaseUrl = dodoApiKey.startsWith('sk_test_') 
        ? 'https://test.dodopayments.com'
        : 'https://live.dodopayments.com';
    
    // Try multiple IDs in order of preference
    const idsToTry = [paymentId, orderId, subscriptionId].filter(Boolean);
    
    for (const id of idsToTry) {
        // Try payments endpoint
        try {
            const paymentUrl = `${apiBaseUrl}/payments/${id}`;
            const response = await fetch(paymentUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${dodoApiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const paymentData = await response.json();
                console.log('📄 [INVOICE] Payment data from API:', JSON.stringify(paymentData, null, 2));
                console.log('📄 [INVOICE] Payment data keys:', Object.keys(paymentData));
                
                // Try various possible field names for invoice URL
                const invoiceUrl = paymentData.invoice_url || 
                                   paymentData.invoice?.url ||
                                   paymentData.invoice_link ||
                                   paymentData.receipt_url ||
                                   paymentData.receipt?.url ||
                                   paymentData.payment_url ||
                                   paymentData.download_url ||
                                   paymentData.url ||
                                   paymentData.invoice_pdf_url ||
                                   paymentData.receipt_pdf_url ||
                                   paymentData.checkout_url;
                
                if (invoiceUrl) {
                    console.log('✅ [INVOICE] Found invoice URL from payments endpoint:', invoiceUrl);
                    // Also check if payment data has payment_id
                    const foundPaymentId = paymentData.payment_id || paymentData.id || id;
                    if (foundPaymentId && foundPaymentId.startsWith('pay_')) {
                        return { url: invoiceUrl, payment_id: foundPaymentId };
                    }
                    return invoiceUrl;
                } else {
                    console.log('⚠️ [INVOICE] No invoice URL found in payment data. Available fields:', Object.keys(paymentData));
                    // Try to construct invoice URL if we have an ID
                    if (id) {
                        const constructedUrl = `${apiBaseUrl}/invoices/${id}`;
                        console.log('🔧 [INVOICE] Attempting constructed URL:', constructedUrl);
                        // Don't return constructed URL yet - we'll verify it exists
                    }
                }
            } else {
                const errorText = await response.text();
                console.log('⚠️ [INVOICE] Payments endpoint returned error:', response.status, errorText);
            }
        } catch (error) {
            console.warn('⚠️ [INVOICE] Error fetching from payments endpoint:', error.message);
        }
        
        // Try orders endpoint
        try {
            const orderUrl = `${apiBaseUrl}/orders/${id}`;
            const response = await fetch(orderUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${dodoApiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const orderData = await response.json();
                console.log('📄 [INVOICE] Order data from API:', JSON.stringify(orderData, null, 2));
                console.log('📄 [INVOICE] Order data keys:', Object.keys(orderData));
                
                const invoiceUrl = orderData.invoice_url || 
                                   orderData.invoice?.url ||
                                   orderData.invoice_link ||
                                   orderData.receipt_url ||
                                   orderData.receipt?.url ||
                                   orderData.payment_url ||
                                   orderData.download_url ||
                                   orderData.url ||
                                   orderData.invoice_pdf_url ||
                                   orderData.receipt_pdf_url ||
                                   orderData.checkout_url;
                
                if (invoiceUrl) {
                    console.log('✅ [INVOICE] Found invoice URL from orders endpoint:', invoiceUrl);
                    // Check if order data has payment_id
                    const foundPaymentId = orderData.payment_id || orderData.payment?.id || orderData.payment_id;
                    if (foundPaymentId && foundPaymentId.startsWith('pay_')) {
                        return { url: invoiceUrl, payment_id: foundPaymentId };
                    }
                    return invoiceUrl;
                } else {
                    console.log('⚠️ [INVOICE] No invoice URL found in order data. Available fields:', Object.keys(orderData));
                }
            } else {
                const errorText = await response.text();
                console.log('⚠️ [INVOICE] Orders endpoint returned error:', response.status, errorText);
            }
        } catch (error) {
            console.warn('⚠️ [INVOICE] Error fetching from orders endpoint:', error.message);
        }
    }
    
    console.warn('⚠️ [INVOICE] Could not find invoice URL from Dodo Payments API');
    
    // Construct invoice URL using Dodo Payments pattern: /invoices/payments/{payment_id}
    // IMPORTANT: Must use payment_id (pay_XXX), NOT subscription_id (sub_XXX)
    // Format: https://test.dodopayments.com/invoices/payments/pay_XXX
    // or: https://live.dodopayments.com/invoices/payments/pay_XXX
    
    // Find the first ID that looks like a payment ID (pay_XXX)
    let validPaymentId = null;
    for (const id of idsToTry) {
        if (id && id.startsWith('pay_')) {
            validPaymentId = id;
            break;
        }
    }
    
    // Only construct URL if we have a valid payment_id
    if (validPaymentId) {
        const constructedUrl = `${apiBaseUrl}/invoices/payments/${validPaymentId}`;
        console.log('🔧 [INVOICE] Constructing invoice URL using payment_id:', constructedUrl);
        return { url: constructedUrl, payment_id: validPaymentId };
    } else {
        console.warn('⚠️ [INVOICE] No payment_id (pay_XXX) found in IDs. Cannot construct invoice URL.');
        console.warn('⚠️ [INVOICE] IDs tried:', idsToTry);
        console.warn('⚠️ [INVOICE] Invoice URL must use payment_id, not subscription_id or order_id');
    }
    
    return null;
}

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    // Handle GET requests for health checks (Dodo Payments verification)
    if (req.method === 'GET') {
        console.log('🏥 [WEBHOOK] Health check received');
        console.log('🏥 [WEBHOOK] Request URL:', req.url);
        console.log('🏥 [WEBHOOK] Request headers:', JSON.stringify(req.headers, null, 2));
        console.log('🏥 [WEBHOOK] Host:', req.headers.host);
        return res.status(200).json({ 
            status: 'ok',
            message: 'Webhook endpoint is active',
            endpoint: '/api/dodo-webhook',
            accepts: ['POST'],
            timestamp: new Date().toISOString(),
            requestUrl: req.url,
            host: req.headers.host
        });
    }
    
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    
    try {
        const webhookData = req.body;
        
        // Log webhook receipt with timestamp
        console.log('='.repeat(80));
        console.log('📥 [WEBHOOK] Dodo Payments webhook received at:', new Date().toISOString());
        console.log('📥 [WEBHOOK] Request method:', req.method);
        console.log('📥 [WEBHOOK] Request headers:', JSON.stringify(req.headers, null, 2));
        console.log('📥 [WEBHOOK] Webhook payload:', JSON.stringify(webhookData, null, 2));
        console.log('📥 [WEBHOOK] Raw body type:', typeof req.body);
        console.log('📥 [WEBHOOK] Body keys:', Object.keys(webhookData || {}));
        console.log('='.repeat(80));
        
        // Verify webhook signature (if Dodo Payments provides one)
        // TODO: Add webhook signature verification when you get the webhook secret
        
        // Handle different webhook event types
        const eventType = webhookData.event || webhookData.type || webhookData.event_type;
        
        // Dodo Payments sends data nested in 'data' object
        const data = webhookData.data || webhookData;
        
        // Extract customer email from nested structure
        const customerEmail = data.customer?.email || data.customer_email || webhookData.customer?.email || webhookData.email;
        
        // Extract order/subscription ID
        const orderId = data.subscription_id || data.payment_id || data.order_id || data.transaction_id || data.id;
        
        // Extract amount (Dodo Payments sends in cents) - NO FALLBACKS
        // Try multiple possible field names that Dodo Payments might use
        const amountRaw = data.total_amount || data.recurring_pre_tax_amount || data.amount || data.settlement_amount || data.price || data.total;
        if (!amountRaw && amountRaw !== 0) {
            console.error('❌ No amount found in webhook data');
            console.error('Available data fields:', Object.keys(data));
            console.error('Full data object:', JSON.stringify(data, null, 2));
            return res.status(400).json({ 
                error: 'Missing required field: amount',
                availableFields: Object.keys(data),
                receivedData: data
            });
        }
        
        // Dodo Payments always sends amounts in cents, so always convert
        let amount;
        const amountNum = parseFloat(amountRaw);
        amount = (amountNum / 100).toFixed(2); // Always convert cents to decimal
        
        // Extract currency from webhook (for logging only) - IGNORE IT, ALWAYS USE USD
        const webhookCurrency = data.currency || data.settlement_currency || data.currency_code || 'USD';
        // ALWAYS use USD regardless of what webhook sends
        const currency = 'USD';
        console.log('📋 [WEBHOOK] Currency from webhook:', webhookCurrency, '- Using USD instead');
        
        // Extract status - NO FALLBACKS
        const status = data.status || data.payment_status || data.state;
        if (!status) {
            console.error('❌ No status found in webhook data');
            console.error('Available data fields:', Object.keys(data));
            return res.status(400).json({ 
                error: 'Missing required field: status',
                availableFields: Object.keys(data)
            });
        }
        
        console.log('📋 [WEBHOOK] Parsed data:', {
            eventType,
            customerEmail,
            orderId,
            amount,
            webhookCurrency: webhookCurrency,
            currency: currency, // Always USD
            status,
            rawAmount: amountRaw
        });
        
        // Handle successful payment
        if (status === 'completed' || status === 'paid' || status === 'success' || status === 'succeeded' ||
            eventType === 'payment.completed' || eventType === 'payment.succeeded' || 
            eventType === 'order.completed' || eventType === 'subscription.active') {
            
            // Initialize Supabase with service role key (needed to query auth.users)
            
            const supabaseUrl = process.env.SUPABASE_URL;
            if (!supabaseUrl) {
                console.error('❌ SUPABASE_URL not configured');
                return res.status(500).json({ error: 'Server configuration error: SUPABASE_URL missing' });
            }
            
            // Use service role key for admin operations (finding users by email)
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
            
            if (!customerEmail) {
                console.error('❌ No customer email found in webhook data');
                console.error('Full webhook payload:', JSON.stringify(webhookData, null, 2));
                // Don't fail - log for manual processing
                // The payment-success.html page will handle it when user visits
                return res.status(200).json({ 
                    success: true, 
                    message: 'Webhook received but no email - will be processed on payment-success page',
                    orderId: orderId
                });
            }
            
            // Find user by email using admin API
            let userId = null;
            let foundUser = null;
            try {
                const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
                
                if (userError) {
                    console.error('❌ Error listing users:', userError);
                    return res.status(500).json({ error: 'Failed to find user', message: userError.message });
                } else if (users) {
                    foundUser = users.find(u => u.email === customerEmail);
                    if (foundUser) {
                        userId = foundUser.id;
                        console.log('✅ Found user:', userId, 'for email:', customerEmail);
                    } else {
                        console.log('⚠️ User not found for email:', customerEmail);
                        return res.status(404).json({ 
                            error: 'User not found', 
                            message: `No user found with email: ${customerEmail}` 
                        });
                    }
                } else {
                    console.error('❌ No users returned from Supabase');
                    return res.status(500).json({ error: 'Failed to query users' });
                }
            } catch (error) {
                console.error('❌ Error finding user:', error);
                return res.status(500).json({ error: 'Error finding user', message: error.message });
            }
            
            // Determine plan type from payment frequency or amount
            const amountNum = parseFloat(amount);
            if (isNaN(amountNum)) {
                console.error('❌ Invalid amount:', amount);
                return res.status(400).json({ error: 'Invalid amount value' });
            }
            
            // REJECT payments with amount 2.94 - this is a wrong/duplicate payment
            if (Math.abs(amountNum - 2.94) < 0.01) {
                console.warn('⚠️ [WEBHOOK] Rejecting payment with wrong amount 2.94 - this is a duplicate/incorrect payment');
                return res.status(200).json({ 
                    success: true, 
                    message: 'Payment with amount 2.94 rejected - incorrect/duplicate payment',
                    rejected: true,
                    reason: 'Incorrect amount 2.94'
                });
            }
            
            let planType = null;
            
            // First, try to get from payment frequency (if available)
            if (data.payment_frequency_interval === 'Month' && data.payment_frequency_count === 1) {
                planType = 'monthly';
                console.log('✅ Plan type determined from payment frequency (monthly)');
            } else if (data.payment_frequency_interval === 'Month' && data.payment_frequency_count === 3) {
                planType = 'quarterly';
                console.log('✅ Plan type determined from payment frequency (quarterly)');
            }
            
            // If plan type not determined from frequency, try other methods
            if (!planType) {
                // Try to get from plan_type field if available
                planType = data.plan_type || data.plan || data.subscription?.plan_type;
                
                if (planType) {
                    console.log('✅ Plan type found in webhook data:', planType);
                    // Normalize plan type
                    if (planType.toLowerCase().includes('month')) {
                        planType = 'monthly';
                    } else if (planType.toLowerCase().includes('quarter')) {
                        planType = 'quarterly';
                    }
                }
                
                // If still not found, determine from amount (works for both USD and EUR)
                if (!planType) {
                    // Hardcoded amounts for monthly and quarterly subscriptions (same in USD and EUR)
                    const MONTHLY_AMOUNT = 3.49;
                    const QUARTERLY_AMOUNT = 8.90;
                    
                    // Allow small variance (0.02) for rounding and currency conversion
                    if (Math.abs(amountNum - MONTHLY_AMOUNT) < 0.03) {
                        planType = 'monthly';
                        console.log('✅ Plan type determined from amount (monthly):', amountNum, currency);
                    } else if (Math.abs(amountNum - QUARTERLY_AMOUNT) < 0.03) {
                        planType = 'quarterly';
                        console.log('✅ Plan type determined from amount (quarterly):', amountNum, currency);
                    } else {
                        console.error('❌ Cannot determine plan type - amount does not match monthly or quarterly');
                        console.error('Amount received:', amountNum, currency);
                        console.error('Expected monthly:', MONTHLY_AMOUNT);
                        console.error('Expected quarterly:', QUARTERLY_AMOUNT);
                        console.error('Available data fields:', Object.keys(data));
                        // Don't fail - try to continue with a default
                        planType = 'monthly'; // Default to monthly as fallback
                        console.warn('⚠️ Defaulting to monthly plan type');
                    }
                }
            }
            
            // Validate plan type
            if (planType !== 'monthly' && planType !== 'quarterly') {
                console.error('❌ Invalid plan type:', planType);
                return res.status(400).json({ error: 'Invalid plan_type - must be monthly or quarterly' });
            }
            
            // If we found the user, create/update subscription
            if (userId) {
                // Extract next_billing_date from webhook data if available
                let nextBillingDate = null;
                if (data.next_billing_date) {
                    // Dodo Payments sends ISO string, convert to date
                    nextBillingDate = data.next_billing_date.split('T')[0]; // Extract date part
                }
                
                // Extract Dodo Payments subscription ID
                // CRITICAL: Try multiple possible field names for subscription ID
                // Dodo Payments might send it as: subscription_id, subscription.id, id, or in nested structure
                let dodoSubscriptionId = data.subscription_id || 
                                        data.subscription?.id || 
                                        data.subscription_id || 
                                        data.id ||
                                        orderId;
                
                // Log what we found for debugging
                console.log('🔍 [WEBHOOK] Extracting subscription ID:');
                console.log('🔍 [WEBHOOK] data.subscription_id:', data.subscription_id);
                console.log('🔍 [WEBHOOK] data.subscription?.id:', data.subscription?.id);
                console.log('🔍 [WEBHOOK] data.id:', data.id);
                console.log('🔍 [WEBHOOK] orderId (fallback):', orderId);
                console.log('🔍 [WEBHOOK] Final dodoSubscriptionId:', dodoSubscriptionId);
                console.log('🔍 [WEBHOOK] Full data object keys:', Object.keys(data));
                
                // If we still don't have a subscription ID, log the full payload for debugging
                if (!dodoSubscriptionId || dodoSubscriptionId === orderId) {
                    console.warn('⚠️ [WEBHOOK] WARNING: Using orderId as subscription ID - may not be correct');
                    console.warn('⚠️ [WEBHOOK] Full webhook payload:', JSON.stringify(webhookData, null, 2));
                }
                
                const subscriptionData = {
                    user_id: userId,
                    email: customerEmail, // Add email for easier querying
                    plan_type: planType,
                    status: 'active',
                    start_date: data.created_at ? data.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
                    end_date: null, // No end date for recurring subscriptions
                    next_billing_date: nextBillingDate, // Store next billing date from webhook
                    amount_paid: amountNum,
                    currency: 'USD', // Always USD, ignore webhook currency
                    payment_method: 'dodo_payments',
                    dodo_subscription_id: dodoSubscriptionId, // Store Dodo Payments subscription ID for API calls
                    updated_at: new Date().toISOString()
                };
                
                console.log('📝 [WEBHOOK] Subscription data to be saved:', JSON.stringify(subscriptionData, null, 2));
                
                try {
                    // Check if subscription already exists (prevent race condition)
                    const { data: existingSubscription } = await supabase
                        .from('subscriptions')
                        .select('*')
                        .eq('user_id', userId)
                        .maybeSingle();
                    
                    let subscription;
                    if (existingSubscription) {
                        // Check if we should keep existing or update (prefer correct amount)
                        const existingAmount = parseFloat(existingSubscription.amount_paid);
                        const newAmount = parseFloat(subscriptionData.amount_paid);
                        const correctAmounts = [3.49, 3.50, 8.90]; // Allow 3.50 as correct (close to 3.49)
                        
                        const existingIsCorrect = correctAmounts.includes(existingAmount);
                        const newIsCorrect = correctAmounts.includes(newAmount);
                        
                        // If existing has correct amount and new doesn't, keep existing (don't update)
                        if (existingIsCorrect && !newIsCorrect) {
                            console.log('✅ [WEBHOOK] Keeping existing subscription with correct amount:', existingAmount);
                            subscription = existingSubscription;
                        } else {
                            // Update existing subscription (new is correct or both are same)
                            console.log('🔄 [WEBHOOK] Subscription exists, updating:', existingSubscription.id);
                            const { data: updated, error: updateError } = await supabase
                                .from('subscriptions')
                                .update({
                                    ...subscriptionData,
                                    updated_at: new Date().toISOString()
                                })
                                .eq('user_id', userId)
                                .select()
                                .single();
                        
                            if (updateError) {
                                console.error('❌ Error updating subscription:', updateError);
                                return res.status(500).json({ 
                                    error: 'Failed to update subscription',
                                    message: updateError.message 
                                });
                            }
                            subscription = updated;
                            console.log('✅ [WEBHOOK] Subscription updated:', JSON.stringify(subscription, null, 2));
                        }
                    } else {
                        // Insert new subscription
                        console.log('💾 [WEBHOOK] Creating new subscription with dodo_subscription_id:', dodoSubscriptionId);
                        const { data: inserted, error: insertError } = await supabase
                            .from('subscriptions')
                            .insert(subscriptionData)
                            .select()
                            .single();
                        
                        if (insertError) {
                            // Check if it's a duplicate error (unique constraint violation)
                            if (insertError.code === '23505' || insertError.message.includes('duplicate') || insertError.message.includes('unique')) {
                                console.log('🔄 [WEBHOOK] Duplicate subscription detected, fetching existing...');
                                // Fetch existing subscription
                                const { data: existingAfterInsert } = await supabase
                                    .from('subscriptions')
                                    .select('*')
                                    .eq('user_id', userId)
                                    .single();
                                
                                if (existingAfterInsert) {
                                    // Update existing with better data
                                    const { data: updated } = await supabase
                                        .from('subscriptions')
                                        .update({
                                            ...subscriptionData,
                                            updated_at: new Date().toISOString()
                                        })
                                        .eq('user_id', userId)
                                        .select()
                                        .single();
                                    subscription = updated || existingAfterInsert;
                                    console.log('✅ [WEBHOOK] Subscription updated (duplicate handled):', JSON.stringify(subscription, null, 2));
                                } else {
                                    console.error('❌ Duplicate error but could not find existing subscription:', insertError);
                                    return res.status(500).json({ 
                                        error: 'Failed to create subscription (duplicate)',
                                        message: insertError.message 
                                    });
                                }
                            } else {
                                console.error('❌ Error creating subscription:', insertError);
                                return res.status(500).json({ 
                                    error: 'Failed to create subscription',
                                    message: insertError.message 
                                });
                            }
                        } else {
                            subscription = inserted;
                            console.log('✅ [WEBHOOK] Subscription created:', JSON.stringify(subscription, null, 2));
                        }
                    }
                    
                    console.log('✅ [WEBHOOK] Saved dodo_subscription_id:', subscription?.dodo_subscription_id);
                    
                    // Verify the subscription ID was actually saved
                    if (!subscription.dodo_subscription_id) {
                        console.error('❌ [WEBHOOK] CRITICAL: Subscription saved but dodo_subscription_id is NULL!');
                        console.error('❌ [WEBHOOK] Subscription data sent:', JSON.stringify(subscriptionData, null, 2));
                        console.error('❌ [WEBHOOK] Subscription data received:', JSON.stringify(subscription, null, 2));
                        
                        // Try to fetch subscription ID from Dodo Payments API as fallback
                        console.log('🔧 [WEBHOOK] Attempting to fetch subscription ID from Dodo Payments API...');
                        try {
                            const dodoApiKey = process.env.DODO_PAYMENTS_API_KEY?.trim();
                            if (dodoApiKey) {
                                const apiBaseUrl = dodoApiKey.startsWith('sk_test_') 
                                    ? 'https://test.dodopayments.com'
                                    : 'https://live.dodopayments.com';
                                
                                // Try to get subscription by customer email
                                const subscriptionsUrl = `${apiBaseUrl}/subscriptions?customer_email=${encodeURIComponent(customerEmail)}`;
                                const subscriptionsResponse = await fetch(subscriptionsUrl, {
                                    method: 'GET',
                                    headers: {
                                        'Authorization': `Bearer ${dodoApiKey}`,
                                        'Content-Type': 'application/json'
                                    }
                                });
                                
                                if (subscriptionsResponse.ok) {
                                    const subscriptionsData = await subscriptionsResponse.json();
                                    const subscriptions = subscriptionsData.data || subscriptionsData.subscriptions || subscriptionsData;
                                    
                                    if (Array.isArray(subscriptions) && subscriptions.length > 0) {
                                        const activeSub = subscriptions.find(s => 
                                            (s.status === 'active' || s.status === 'Active') &&
                                            s.customer?.email === customerEmail
                                        ) || subscriptions[0];
                                        
                                        const fetchedSubscriptionId = activeSub.id || activeSub.subscription_id;
                                        
                                        if (fetchedSubscriptionId) {
                                            console.log('✅ [WEBHOOK] Found subscription ID from API:', fetchedSubscriptionId);
                                            
                                            // Update subscription with the fetched ID
                                            const { error: updateError } = await supabase
                                                .from('subscriptions')
                                                .update({ dodo_subscription_id: fetchedSubscriptionId })
                                                .eq('user_id', userId);
                                            
                                            if (updateError) {
                                                console.error('❌ [WEBHOOK] Failed to update subscription ID:', updateError);
                                            } else {
                                                console.log('✅ [WEBHOOK] Successfully updated subscription ID from API');
                                            }
                                        }
                                    }
                                }
                            }
                        } catch (apiError) {
                            console.error('❌ [WEBHOOK] Error fetching subscription ID from API:', apiError);
                        }
                    }
                    
                    // Insert payment record into payments table
                    // Use subscription_id as order_id and transaction_id
                    const subscriptionId = dodoSubscriptionId || data.subscription_id || orderId;
                    
                    // Extract invoice URL and payment ID from webhook data
                    console.log('🔍 [WEBHOOK] Checking webhook data for invoice URL and payment ID...');
                    console.log('🔍 [WEBHOOK] Webhook data keys:', Object.keys(data));
                    console.log('🔍 [WEBHOOK] Full webhook data structure:', JSON.stringify(data, null, 2));
                    
                    // Extract payment_id FIRST (same process as EU payments)
                    // Dodo sends payment_id directly in data.payment_id field
                    let extractedPaymentId = null;
                    if (data.payment_id && typeof data.payment_id === 'string' && data.payment_id.startsWith('pay_')) {
                        extractedPaymentId = data.payment_id;
                        console.log('✅ [WEBHOOK] Found payment_id in data.payment_id:', extractedPaymentId);
                    } else if (data.id && typeof data.id === 'string' && data.id.startsWith('pay_')) {
                        extractedPaymentId = data.id;
                        console.log('✅ [WEBHOOK] Found payment_id in data.id:', extractedPaymentId);
                    } else {
                        console.log('⚠️ [WEBHOOK] No payment_id found in data.payment_id or data.id');
                        console.log('🔍 [WEBHOOK] data.payment_id:', data.payment_id);
                        console.log('🔍 [WEBHOOK] data.id:', data.id);
                    }
                    
                    // Extract invoice URL - Dodo often includes this directly!
                    let invoiceUrl = data.invoice_url || 
                                     data.invoice?.url || 
                                     data.invoice_link ||
                                     data.receipt_url ||
                                     data.receipt?.url ||
                                     data.payment_url ||
                                     data.checkout_url ||
                                     data.invoice_pdf_url ||
                                     data.receipt_pdf_url ||
                                     null;
                    
                    if (invoiceUrl) {
                        console.log('✅ [WEBHOOK] Found invoice URL directly in webhook data:', invoiceUrl);
                        
                        // If we don't have payment_id yet, try to extract it from invoice_url
                        if (!extractedPaymentId && invoiceUrl.includes('/payments/')) {
                            const urlMatch = invoiceUrl.match(/\/payments\/(pay_[^\/\?]+)/);
                            if (urlMatch && urlMatch[1]) {
                                extractedPaymentId = urlMatch[1];
                                console.log('✅ [WEBHOOK] Extracted payment_id from invoice_url:', extractedPaymentId);
                            }
                        }
                        
                        // Also double-check data.payment_id if we still don't have it
                        if (!extractedPaymentId && data.payment_id && typeof data.payment_id === 'string' && data.payment_id.startsWith('pay_')) {
                            extractedPaymentId = data.payment_id;
                            console.log('✅ [WEBHOOK] Found payment_id in data.payment_id (after invoice_url check):', extractedPaymentId);
                        }
                    } else if (extractedPaymentId) {
                        // Construct invoice URL using payment_id (same as EU payments)
                        const dodoApiKey = process.env.DODO_PAYMENTS_API_KEY?.trim();
                        const apiBaseUrl = dodoApiKey && dodoApiKey.startsWith('sk_test_') 
                            ? 'https://test.dodopayments.com'
                            : 'https://live.dodopayments.com';
                        
                        invoiceUrl = `${apiBaseUrl}/invoices/payments/${extractedPaymentId}`;
                        console.log('🔧 [WEBHOOK] Constructed invoice URL from payment_id:', invoiceUrl);
                    } else {
                        console.log('⚠️ [WEBHOOK] No invoice URL or payment_id found, attempting to fetch from Dodo API...');
                        console.log('🔍 [WEBHOOK] IDs to try:', {
                            payment_id: data.payment_id || data.id,
                            order_id: data.order_id || orderId,
                            subscription_id: subscriptionId
                        });
                        
                        // Fetch from Dodo Payments API
                        const apiResult = await getInvoiceUrlFromDodo(
                            data.payment_id || data.id,
                            data.order_id || orderId,
                            subscriptionId
                        );
                        
                        // getInvoiceUrlFromDodo can return either a string (URL) or an object with url and payment_id
                        if (typeof apiResult === 'object' && apiResult !== null) {
                            invoiceUrl = apiResult.url;
                            if (apiResult.payment_id && !extractedPaymentId) {
                                extractedPaymentId = apiResult.payment_id;
                                console.log('✅ [WEBHOOK] Extracted payment_id from API response:', extractedPaymentId);
                            }
                        } else {
                            invoiceUrl = apiResult;
                        }
                        
                        // If we got invoice URL from API, try to extract payment_id from it
                        if (invoiceUrl && invoiceUrl.includes('/payments/')) {
                            const urlMatch = invoiceUrl.match(/\/payments\/(pay_[^\/\?]+)/);
                            if (urlMatch && urlMatch[1]) {
                                // Update extractedPaymentId if we found it in the invoice URL
                                if (!extractedPaymentId) {
                                    extractedPaymentId = urlMatch[1];
                                    console.log('✅ [WEBHOOK] Extracted payment_id from invoice URL:', extractedPaymentId);
                                }
                            }
                        }
                    }
                    
                    // Use fetched invoice URL or fallback to account page
                    const finalInvoiceUrl = invoiceUrl || `https://checkout.dodopayments.com/account`;
                    
                    if (invoiceUrl) {
                        console.log('✅ [WEBHOOK] Using invoice URL:', finalInvoiceUrl);
                    } else {
                        console.log('⚠️ [WEBHOOK] Using fallback invoice URL (account page)');
                    }
                    
                    // Log final payment_id status
                    if (extractedPaymentId) {
                        console.log('✅ [WEBHOOK] Final payment_id to store:', extractedPaymentId);
                    } else {
                        console.log('⚠️ [WEBHOOK] No payment_id found - payment record will be created without payment_id');
                    }
                    
                    const paymentData = {
                        user_id: userId,
                        email: customerEmail, // Add email for easier querying
                        amount: amountNum,
                        currency: 'USD', // Always USD, ignore webhook currency
                        status: 'paid',
                        payment_date: data.created_at || data.previous_billing_date || data.payment_date || new Date().toISOString(),
                        invoice_url: finalInvoiceUrl, // Use the fetched/extracted invoice URL
                        payment_id: extractedPaymentId, // Store Dodo Payments payment ID
                        order_id: subscriptionId,
                        transaction_id: subscriptionId,
                        payment_method: 'dodo_payments',
                        description: `${planType} subscription payment`
                    };
                    
                    if (extractedPaymentId) {
                        console.log('✅ [WEBHOOK] Storing payment_id:', extractedPaymentId);
                    } else {
                        console.log('⚠️ [WEBHOOK] No payment_id found in format pay_XXX');
                    }
                    
                    // Check if payment already exists (deduplication)
                    let existingPayment = null;
                    if (extractedPaymentId) {
                        const { data: existing } = await supabase
                            .from('payments')
                            .select('*')
                            .eq('payment_id', extractedPaymentId)
                            .eq('user_id', userId)
                            .maybeSingle();
                        
                        if (existing) {
                            existingPayment = existing;
                            console.log('🔄 [WEBHOOK] Payment with payment_id already exists, will update:', existingPayment.id);
                        }
                    }
                    
                    // Also check by order_id/transaction_id if no payment_id
                    if (!existingPayment && subscriptionId) {
                        // First, check for correct amount
                        const { data: existing } = await supabase
                            .from('payments')
                            .select('*')
                            .eq('order_id', subscriptionId)
                            .eq('user_id', userId)
                            .eq('amount', amountNum)
                            .maybeSingle();
                        
                        if (existing) {
                            existingPayment = existing;
                            console.log('🔄 [WEBHOOK] Payment with order_id already exists, will update:', existingPayment.id);
                        } else {
                            // Check for wrong amount (2.94) - we'll delete it if we have correct payment
                            const correctAmounts = [3.49, 3.50, 8.90];
                            if (correctAmounts.includes(amountNum)) {
                                const { data: wrongPayment } = await supabase
                                    .from('payments')
                                    .select('*')
                                    .eq('order_id', subscriptionId)
                                    .eq('user_id', userId)
                                    .eq('amount', 2.94)
                                    .maybeSingle();
                                
                                if (wrongPayment) {
                                    console.log('⚠️ [WEBHOOK] Found wrong payment (2.94) with same order_id, will delete it:', wrongPayment.id);
                                    await supabase
                                        .from('payments')
                                        .delete()
                                        .eq('id', wrongPayment.id);
                                    console.log('✅ [WEBHOOK] Deleted wrong payment (2.94)');
                                }
                            }
                        }
                    }
                    
                    // Also check by amount + date (within 5 minutes) to catch duplicates even without payment_id
                    if (!existingPayment) {
                        const paymentDateObj = new Date(paymentData.payment_date);
                        const fiveMinutesAgo = new Date(paymentDateObj.getTime() - 5 * 60 * 1000);
                        const fiveMinutesLater = new Date(paymentDateObj.getTime() + 5 * 60 * 1000);
                        
                        const { data: recentPayments } = await supabase
                            .from('payments')
                            .select('*')
                            .eq('user_id', userId)
                            .eq('amount', amountNum)
                            .eq('currency', currency)
                            .gte('payment_date', fiveMinutesAgo.toISOString())
                            .lte('payment_date', fiveMinutesLater.toISOString())
                            .order('payment_date', { ascending: false })
                            .limit(5);
                        
                        if (recentPayments && recentPayments.length > 0) {
                            // Prefer payment with invoice_url and correct amount (3.50, not 2.94)
                            // Priority: 1) Has invoice_url (not default), 2) Correct amount (3.50), 3) Has payment_id, 4) Most recent
                            const correctAmounts = [3.49, 3.50, 8.90];
                            const bestPayment = recentPayments.find(p => {
                                const hasInvoice = p.invoice_url && !p.invoice_url.includes('checkout.dodopayments.com/account');
                                const hasCorrectAmount = correctAmounts.includes(parseFloat(p.amount));
                                return hasInvoice && hasCorrectAmount;
                            }) || recentPayments.find(p => {
                                const hasInvoice = p.invoice_url && !p.invoice_url.includes('checkout.dodopayments.com/account');
                                return hasInvoice;
                            }) || recentPayments.find(p => {
                                const hasCorrectAmount = correctAmounts.includes(parseFloat(p.amount));
                                return hasCorrectAmount;
                            }) || recentPayments.find(p => 
                                (p.payment_id && p.payment_id.startsWith('pay_'))
                            ) || recentPayments[0];
                            
                            existingPayment = bestPayment;
                            console.log('🔄 [WEBHOOK] Found recent payment with same amount/date, will update:', existingPayment.id);
                        }
                    }
                    
                    // Use upsert to handle duplicates atomically at database level
                    // This prevents race conditions where multiple requests check before insert
                    let payment;
                    const upsertData = {
                        ...paymentData,
                        updated_at: new Date().toISOString()
                    };
                    
                    // Determine conflict target based on what we have
                    let conflictTarget = null;
                    if (extractedPaymentId) {
                        // Use payment_id as unique constraint
                        conflictTarget = 'payment_id';
                    } else if (subscriptionId) {
                        // Use order_id + user_id + amount + payment_date as unique constraint
                        // We'll use a different approach - check and upsert manually
                        conflictTarget = null; // Will handle manually
                    }
                    
                    if (conflictTarget === 'payment_id') {
                        // Try to find existing payment first
                        const { data: existing } = await supabase
                            .from('payments')
                            .select('*')
                            .eq('payment_id', extractedPaymentId)
                            .eq('user_id', userId)
                            .maybeSingle();
                        
                        let payment;
                        if (existing) {
                            // Only update if new payment has better data (invoice_url or correct amount)
                            const correctAmounts = [3.49, 3.50, 8.90];
                            const newHasInvoice = upsertData.invoice_url && !upsertData.invoice_url.includes('checkout.dodopayments.com/account');
                            const existingHasInvoice = existing.invoice_url && !existing.invoice_url.includes('checkout.dodopayments.com/account');
                            const newHasCorrectAmount = correctAmounts.includes(parseFloat(upsertData.amount));
                            const existingHasCorrectAmount = correctAmounts.includes(parseFloat(existing.amount));
                            const existingIsWrongAmount = Math.abs(parseFloat(existing.amount) - 2.94) < 0.01;
                            
                            // Always update if new payment has payment_id and existing doesn't
                            const newHasPaymentId = !!upsertData.payment_id;
                            const existingHasPaymentId = !!existing.payment_id;
                            
                            // Update if: new has payment_id and existing doesn't, OR new has invoice and existing doesn't, OR new has correct amount and existing is wrong (2.94), OR existing is wrong amount
                            if ((newHasPaymentId && !existingHasPaymentId) || 
                                (newHasInvoice && !existingHasInvoice) || 
                                (newHasCorrectAmount && existingIsWrongAmount) || 
                                existingIsWrongAmount) {
                                const { data: updated, error: updateError } = await supabase
                                    .from('payments')
                                    .update(upsertData)
                                    .eq('id', existing.id)
                                    .select()
                                    .single();
                                
                                if (updateError) {
                                    console.error('⚠️ Error updating payment record:', updateError);
                                    payment = existing; // Use existing if update fails
                                } else {
                                    payment = updated;
                                    console.log('✅ [WEBHOOK] Payment record updated (better data):', payment);
                                    if (newHasPaymentId && !existingHasPaymentId) {
                                        console.log('✅ [WEBHOOK] Added missing payment_id to existing payment:', upsertData.payment_id);
                                    }
                                }
                            } else {
                                // Keep existing if it's better or equal, but ensure payment_id and invoice_url are set if we have them
                                const needsUpdate = {};
                                if (newHasPaymentId && !existingHasPaymentId) {
                                    needsUpdate.payment_id = upsertData.payment_id;
                                }
                                if (newHasInvoice && !existingHasInvoice) {
                                    needsUpdate.invoice_url = upsertData.invoice_url;
                                }
                                
                                if (Object.keys(needsUpdate).length > 0) {
                                    // Update just the missing fields
                                    const { data: updated } = await supabase
                                        .from('payments')
                                        .update(needsUpdate)
                                        .eq('id', existing.id)
                                        .select()
                                        .single();
                                    payment = updated || existing;
                                    console.log('✅ [WEBHOOK] Added missing fields to existing payment:', needsUpdate);
                                } else {
                                    payment = existing;
                                    console.log('✅ [WEBHOOK] Keeping existing payment (has better/equal data):', payment);
                                }
                            }
                        } else {
                            // Insert new payment
                            const { data: inserted, error: insertError } = await supabase
                                .from('payments')
                                .insert(paymentData)
                                .select()
                                .single();
                            
                            if (insertError) {
                                // Check if it's a duplicate error (unique constraint violation)
                                if (insertError.code === '23505' || insertError.message.includes('duplicate') || insertError.message.includes('unique')) {
                                    console.log('🔄 [WEBHOOK] Duplicate payment detected, fetching existing...');
                                    console.log('🔍 [WEBHOOK] Duplicate constraint: (user_id, order_id, amount, payment_date)');
                                    console.log('🔍 [WEBHOOK] Searching with:', { userId, order_id: subscriptionId, amount: amountNum, payment_date: paymentData.payment_date });
                                    
                                    // Fetch existing payment using the duplicate constraint fields
                                    // The constraint is on (user_id, order_id, amount, payment_date)
                                    let existingAfterInsert = null;
                                    
                                    // First try by payment_id if we have it
                                    if (extractedPaymentId) {
                                        const { data: existingByPaymentId } = await supabase
                                            .from('payments')
                                            .select('*')
                                            .eq('payment_id', extractedPaymentId)
                                            .eq('user_id', userId)
                                            .maybeSingle();
                                        
                                        if (existingByPaymentId) {
                                            existingAfterInsert = existingByPaymentId;
                                            console.log('✅ [WEBHOOK] Found existing payment by payment_id:', existingAfterInsert.id);
                                        }
                                    }
                                    
                                    // If not found by payment_id, try by constraint fields
                                    if (!existingAfterInsert) {
                                        const { data: existingByConstraint } = await supabase
                                            .from('payments')
                                            .select('*')
                                            .eq('user_id', userId)
                                            .eq('order_id', subscriptionId)
                                            .eq('amount', amountNum)
                                            .eq('payment_date', paymentData.payment_date)
                                            .maybeSingle();
                                        
                                        if (existingByConstraint) {
                                            existingAfterInsert = existingByConstraint;
                                            console.log('✅ [WEBHOOK] Found existing payment by constraint fields:', existingAfterInsert.id);
                                        }
                                    }
                                    
                                    if (existingAfterInsert) {
                                        // Only update if new payment has better data (invoice_url or correct amount)
                                        const correctAmounts = [3.49, 3.50, 8.90];
                                        const newHasInvoice = upsertData.invoice_url && !upsertData.invoice_url.includes('checkout.dodopayments.com/account');
                                        const existingHasInvoice = existingAfterInsert.invoice_url && !existingAfterInsert.invoice_url.includes('checkout.dodopayments.com/account');
                                        const newHasCorrectAmount = correctAmounts.includes(parseFloat(upsertData.amount));
                                        const existingHasCorrectAmount = correctAmounts.includes(parseFloat(existingAfterInsert.amount));
                                        const existingIsWrongAmount = Math.abs(parseFloat(existingAfterInsert.amount) - 2.94) < 0.01;
                                        
                                        // Always update invoice_url if new has a valid one and existing doesn't, or if new has payment_id and existing doesn't
                                        const newHasPaymentId = !!upsertData.payment_id;
                                        const existingHasPaymentId = !!existingAfterInsert.payment_id;
                                        
                                        const needsUpdate = {};
                                        if (newHasInvoice && !existingHasInvoice) {
                                            needsUpdate.invoice_url = upsertData.invoice_url;
                                        }
                                        if (newHasPaymentId && !existingHasPaymentId) {
                                            needsUpdate.payment_id = upsertData.payment_id;
                                        }
                                        
                                        // Update if: new has invoice and existing doesn't, OR new has payment_id and existing doesn't, OR new has correct amount and existing is wrong (2.94), OR existing is wrong amount
                                        if (Object.keys(needsUpdate).length > 0 || (newHasCorrectAmount && existingIsWrongAmount) || existingIsWrongAmount) {
                                            const updateData = Object.keys(needsUpdate).length > 0 ? { ...upsertData, ...needsUpdate } : upsertData;
                                            const { data: updated } = await supabase
                                                .from('payments')
                                                .update(updateData)
                                                .eq('id', existingAfterInsert.id)
                                                .select()
                                                .single();
                                            payment = updated || existingAfterInsert;
                                            console.log('✅ [WEBHOOK] Payment record updated (duplicate handled with better data):', payment);
                                        } else {
                                            // Keep existing if it's better or equal
                                            payment = existingAfterInsert;
                                            console.log('✅ [WEBHOOK] Keeping existing payment (has better/equal data):', payment);
                                        }
                                    } else {
                                        console.error('⚠️ Duplicate error but could not find existing payment:', insertError);
                                    }
                                } else {
                                    console.error('⚠️ Error creating payment record:', insertError);
                                }
                            } else {
                                payment = inserted;
                                console.log('✅ [WEBHOOK] Payment record created:', payment);
                            }
                        }
                    } else {
                        // For order_id/transaction_id, use manual check and upsert
                        if (existingPayment) {
                            // Always update invoice_url and payment_id if new payment has them and existing doesn't
                            const newHasInvoice = upsertData.invoice_url && !upsertData.invoice_url.includes('checkout.dodopayments.com/account');
                            const existingHasInvoice = existingPayment.invoice_url && !existingPayment.invoice_url.includes('checkout.dodopayments.com/account');
                            const newHasPaymentId = !!upsertData.payment_id;
                            const existingHasPaymentId = !!existingPayment.payment_id;
                            
                            // Update if new has better data (invoice_url or payment_id)
                            if ((newHasInvoice && !existingHasInvoice) || (newHasPaymentId && !existingHasPaymentId)) {
                                const { data: updated, error: updateError } = await supabase
                                    .from('payments')
                                    .update(upsertData)
                                    .eq('id', existingPayment.id)
                                    .select()
                                    .single();
                                
                                if (updateError) {
                                    console.error('⚠️ Error updating payment record:', updateError);
                                    payment = existingPayment;
                                } else {
                                    payment = updated;
                                    console.log('✅ [WEBHOOK] Payment record updated (deduplication with better data):', payment);
                                }
                            } else {
                                // Keep existing, but update missing fields
                                const needsUpdate = {};
                                if (newHasPaymentId && !existingHasPaymentId) {
                                    needsUpdate.payment_id = upsertData.payment_id;
                                }
                                if (newHasInvoice && !existingHasInvoice) {
                                    needsUpdate.invoice_url = upsertData.invoice_url;
                                }
                                
                                if (Object.keys(needsUpdate).length > 0) {
                                    const { data: updated } = await supabase
                                        .from('payments')
                                        .update(needsUpdate)
                                        .eq('id', existingPayment.id)
                                        .select()
                                        .single();
                                    payment = updated || existingPayment;
                                    console.log('✅ [WEBHOOK] Added missing fields to existing payment:', needsUpdate);
                                } else {
                                    payment = existingPayment;
                                    console.log('✅ [WEBHOOK] Keeping existing payment (has better/equal data):', payment);
                                }
                            }
                        } else {
                            // Try insert, handle duplicate error
                            const { data: inserted, error: insertError } = await supabase
                                .from('payments')
                                .insert(paymentData)
                                .select()
                                .single();
                            
                            if (insertError) {
                                // Check if it's a duplicate error (unique constraint violation)
                                if (insertError.code === '23505' || insertError.message.includes('duplicate') || insertError.message.includes('unique')) {
                                    console.log('🔄 [WEBHOOK] Duplicate payment detected, fetching existing...');
                                    // Fetch existing payment
                                    const { data: existing } = await supabase
                                        .from('payments')
                                        .select('*')
                                        .eq('order_id', subscriptionId)
                                        .eq('user_id', userId)
                                        .eq('amount', amountNum)
                                        .maybeSingle();
                                    
                                    if (existing) {
                                        // Update existing with better data
                                        const { data: updated } = await supabase
                                            .from('payments')
                                            .update(upsertData)
                                            .eq('id', existing.id)
                                            .select()
                                            .single();
                                        payment = updated || existing;
                                        console.log('✅ [WEBHOOK] Payment record updated (duplicate handled):', payment);
                                    } else {
                                        console.error('⚠️ Duplicate error but could not find existing payment:', insertError);
                                    }
                                } else {
                                    console.error('⚠️ Error creating payment record:', insertError);
                                }
                            } else {
                                payment = inserted;
                                console.log('✅ [WEBHOOK] Payment record created:', payment);
                            }
                        }
                    }
                    
                    console.log('✅ Subscription created/updated:', subscription);
                    console.log('✅ Payment successful for:', customerEmail);
                    console.log('💰 Amount:', amount, currency);
                    console.log('📦 Plan:', planType);
                    
                    // Send subscription confirmation email (NON-BLOCKING)
                    // Always send email when payment is successful, regardless of whether subscription is new or updated
                    console.log('📧 [WEBHOOK] Starting email send process...');
                    console.log('📧 [WEBHOOK] Customer email:', customerEmail);
                    console.log('📧 [WEBHOOK] Found user:', foundUser?.id, foundUser?.email);
                    
                    // Send subscription confirmation email directly (we're already in serverless function)
                    // Use sendEmailDirect since we're server-to-server, not client-to-server
                    console.log('📧 [WEBHOOK] Preparing to send subscription confirmation email...');
                    console.log('📧 [WEBHOOK] Verifying sendEmailDirect function:', typeof sendEmailDirect);
                    
                    // Use IIFE to handle async without blocking
                    const emailPromise = (async () => {
                        console.log('📧 [WEBHOOK] Email IIFE started executing...');
                        try {
                            // Only use real user data - no fallbacks
                            const userName = foundUser?.user_metadata?.name || 
                                           foundUser?.user_metadata?.full_name || 
                                           customerEmail?.split('@')[0] || 
                                           'Chess Player';
                            
                            const planName = planType === 'monthly' ? 'Monthly Premium' : 'Quarterly Premium';
                            
                            console.log('📧 [WEBHOOK] Sending subscription confirmation email via sendEmailDirect');
                            console.log('📧 [WEBHOOK] Email data:', { planName, amount, currency, to: customerEmail, userName });
                            
                            if (typeof sendEmailDirect !== 'function') {
                                console.error('❌ [WEBHOOK] sendEmailDirect is not a function!');
                                return;
                            }
                            
                            const emailStartTime = Date.now();
                            const result = await sendEmailDirect('subscription_confirmed', customerEmail, userName, {
                                planName,
                                amount,
                                currency
                            });
                            
                            const emailDuration = Date.now() - emailStartTime;
                            console.log('📧 [WEBHOOK] sendEmailDirect returned:', { success: result.success, error: result.error, duration: emailDuration });
                            
                            if (result.success) {
                                console.log('✅ [WEBHOOK] Subscription confirmation email sent successfully in', emailDuration, 'ms:', result.messageId);
                            } else {
                                console.error('❌ [WEBHOOK] Email sending failed:', result.error);
                                if (result.details) {
                                    console.error('❌ [WEBHOOK] Email error details:', JSON.stringify(result.details, null, 2));
                                }
                            }
                        } catch (emailError) {
                            // Log full error details for debugging
                            console.error('❌ [WEBHOOK] Could not send subscription email:', emailError.message);
                            console.error('❌ [WEBHOOK] Email error stack:', emailError.stack);
                            console.error('❌ [WEBHOOK] Email error name:', emailError.name);
                        }
                    })(); // Execute immediately, don't await
                    
                    console.log('📧 [WEBHOOK] Email promise created, attaching error handler...');
                    
                    // Attach error handler to prevent unhandled rejection
                    emailPromise.catch(err => {
                        console.error('❌ [WEBHOOK] Unhandled email promise rejection:', err.message);
                        console.error('❌ [WEBHOOK] Unhandled email promise rejection stack:', err.stack);
                    });
                    
                    // Store promise in a way that prevents garbage collection
                    // This ensures Vercel keeps the function alive long enough for email to send
                    if (!global.emailPromises) {
                        global.emailPromises = [];
                    }
                    global.emailPromises.push(emailPromise);
                    
                    console.log('📧 [WEBHOOK] Email send process initiated (non-blocking)');
                    
                    return res.status(200).json({ 
                        success: true, 
                        message: 'Webhook processed successfully',
                        orderId: orderId,
                        subscription: subscription
                    });
                } catch (error) {
                    console.error('❌ Error saving subscription:', error);
                    return res.status(500).json({ 
                        error: 'Failed to save subscription',
                        message: error.message 
                    });
                }
            } else {
                // User not found - log for manual processing
                console.log('⚠️ User not found for email:', customerEmail);
                console.log('💰 Payment amount:', amount, currency);
                console.log('📦 Detected plan:', planType);
                console.log('💡 Subscription will be created when user visits payment-success.html');
                
                // Still return success so DodoPayments doesn't retry
                return res.status(200).json({ 
                    success: true, 
                    message: 'Webhook received - user will be matched on payment-success page',
                    orderId: orderId
                });
            }
        } else if (status === 'cancelled' || status === 'cancelled' || 
                   eventType === 'payment.cancelled' || eventType === 'subscription.cancelled') {
            
            // Handle subscription cancellation
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
            
            if (supabaseServiceKey && customerEmail) {
                const supabase = createClient(supabaseUrl, supabaseServiceKey, {
                    auth: {
                        autoRefreshToken: false,
                        persistSession: false
                    }
                });
                
                // Find user by email
                let userId = null;
                try {
                    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
                    if (!userError && users) {
                        const user = users.find(u => u.email === customerEmail);
                        if (user) userId = user.id;
                    }
                } catch (error) {
                    console.error('Error finding user for cancellation:', error);
                }
                
                // Update subscription status to cancelled
                if (userId) {
                    try {
                        const { data: subscription, error: subError } = await supabase
                            .from('subscriptions')
                            .update({
                                status: 'cancelled',
                                updated_at: new Date().toISOString()
                            })
                            .eq('user_id', userId)
                            .select()
                            .single();
                        
                        if (subError) {
                            console.error('Error cancelling subscription:', subError);
                        } else {
                            console.log('✅ Subscription cancelled:', subscription);
                            
                            // Send cancellation email (NON-BLOCKING)
                            (async () => {
                                try {
                                    // Get user details for email
                                    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
                                    let userName = customerEmail?.split('@')[0] || 'Chess Player';
                                    
                                    if (!userError && users) {
                                        const foundUser = users.find(u => u.email === customerEmail);
                                        if (foundUser) {
                                            userName = foundUser.user_metadata?.name || 
                                                      foundUser.user_metadata?.full_name || 
                                                      userName;
                                        }
                                    }
                                    
                                    console.log('📧 [WEBHOOK] Preparing to send cancellation email to:', customerEmail);
                                    
                                    if (typeof sendEmailDirect !== 'function') {
                                        console.error('❌ [WEBHOOK] sendEmailDirect is not a function!');
                                        return;
                                    }
                                    
                                    const result = await sendEmailDirect('subscription_cancelled', customerEmail, userName);
                                    
                                    if (result.success) {
                                        console.log('✅ [WEBHOOK] Cancellation email sent successfully:', result.messageId);
                                    } else {
                                        console.error('❌ [WEBHOOK] Email sending failed:', result.error);
                                        if (result.details) {
                                            console.error('❌ [WEBHOOK] Email error details:', JSON.stringify(result.details, null, 2));
                                        }
                                    }
                                } catch (emailError) {
                                    // Silently fail - email is optional
                                    console.error('❌ [WEBHOOK] Could not send cancellation email:', emailError.message);
                                }
                            })(); // Execute immediately, don't await
                        }
                    } catch (error) {
                        console.error('Error updating subscription:', error);
                    }
                }
            }
            
            console.log('❌ Payment/subscription cancelled for:', customerEmail);
            res.status(200).json({ 
                success: true, 
                message: 'Payment cancellation processed' 
            });
        } else {
            console.log('ℹ️ Unknown webhook event:', eventType, status);
            res.status(200).json({ 
                success: true, 
                message: 'Webhook received but not processed' 
            });
        }
        
    } catch (error) {
        console.error('❌ Webhook processing error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
}

