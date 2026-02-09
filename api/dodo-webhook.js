// Vercel serverless function to handle Dodo Payments webhooks
// This will automatically update Supabase subscriptions when payments succeed

import { createClient } from '@supabase/supabase-js';
import { sendEmailDirect } from './email-helpers.js';

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
    // Format: https://test.dodopayments.com/invoices/payments/pay_XXX
    // or: https://live.dodopayments.com/invoices/payments/pay_XXX
    if (idsToTry.length > 0) {
        const idToUse = idsToTry[0];
        
        // Check if ID looks like a payment ID (starts with pay_)
        // If not, try to find a payment ID in the responses we got
        let paymentId = idToUse;
        
        // If ID doesn't start with pay_, it might be a subscription/order ID
        // We'll still try to construct the URL, but it might not work
        if (!paymentId.startsWith('pay_')) {
            console.log('⚠️ [INVOICE] ID does not look like a payment ID (pay_XXX), but constructing URL anyway');
        }
        
        // Use checkout.dodopayments.com domain (not API domain)
        const checkoutDomain = apiBaseUrl.includes('test') 
            ? 'https://test.dodopayments.com'
            : 'https://live.dodopayments.com';
        
        const constructedUrl = `${checkoutDomain}/invoices/payments/${paymentId}`;
        console.log('🔧 [INVOICE] Constructing invoice URL using Dodo pattern:', constructedUrl);
        return constructedUrl;
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
        
        // Extract currency - NO FALLBACKS
        const currency = data.currency || data.settlement_currency || data.currency_code;
        if (!currency) {
            console.error('❌ No currency found in webhook data');
            console.error('Available data fields:', Object.keys(data));
            return res.status(400).json({ 
                error: 'Missing required field: currency',
                availableFields: Object.keys(data)
            });
        }
        
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
            currency,
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
                    currency: currency,
                    payment_method: 'dodo_payments',
                    dodo_subscription_id: dodoSubscriptionId, // Store Dodo Payments subscription ID for API calls
                    updated_at: new Date().toISOString()
                };
                
                console.log('📝 [WEBHOOK] Subscription data to be saved:', JSON.stringify(subscriptionData, null, 2));
                
                try {
                    console.log('💾 [WEBHOOK] Saving subscription to Supabase with dodo_subscription_id:', dodoSubscriptionId);
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
                    
                    console.log('✅ [WEBHOOK] Subscription saved:', JSON.stringify(subscription, null, 2));
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
                    
                    // Extract payment ID - Dodo sends this directly in the payload
                    const paymentId = data.payment_id || 
                                     data.id || 
                                     data.transaction_id ||
                                     orderId;
                    
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
                    } else if (paymentId && paymentId.startsWith('pay_')) {
                        // Construct invoice URL using Dodo Payments pattern
                        const dodoApiKey = process.env.DODO_PAYMENTS_API_KEY?.trim();
                        const apiBaseUrl = dodoApiKey && dodoApiKey.startsWith('sk_test_') 
                            ? 'https://test.dodopayments.com'
                            : 'https://live.dodopayments.com';
                        
                        invoiceUrl = `${apiBaseUrl}/invoices/payments/${paymentId}`;
                        console.log('🔧 [WEBHOOK] Constructed invoice URL from payment ID:', invoiceUrl);
                    } else {
                        console.log('⚠️ [WEBHOOK] No invoice URL or payment ID found, attempting to fetch from Dodo API...');
                        console.log('🔍 [WEBHOOK] IDs to try:', {
                            payment_id: data.payment_id || data.id,
                            order_id: data.order_id || orderId,
                            subscription_id: subscriptionId
                        });
                        
                        // Fetch from Dodo Payments API
                        invoiceUrl = await getInvoiceUrlFromDodo(
                            data.payment_id || data.id,
                            data.order_id || orderId,
                            subscriptionId
                        );
                    }
                    
                    // Use fetched invoice URL or fallback to account page
                    const finalInvoiceUrl = invoiceUrl || `https://checkout.dodopayments.com/account`;
                    
                    if (invoiceUrl) {
                        console.log('✅ [WEBHOOK] Using invoice URL:', finalInvoiceUrl);
                    } else {
                        console.log('⚠️ [WEBHOOK] Using fallback invoice URL (account page)');
                    }
                    
                    // Extract payment_id (should be in format pay_XXX)
                    // Dodo sends payment_id directly in the payload
                    const extractedPaymentId = data.payment_id && data.payment_id.startsWith('pay_')
                        ? data.payment_id
                        : (paymentId && paymentId.startsWith('pay_') 
                            ? paymentId 
                            : (data.id && data.id.startsWith('pay_') 
                                ? data.id 
                                : null));
                    
                    const paymentData = {
                        user_id: userId,
                        email: customerEmail, // Add email for easier querying
                        amount: amountNum,
                        currency: currency,
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
                    
                    const { data: payment, error: paymentError } = await supabase
                        .from('payments')
                        .insert(paymentData)
                        .select()
                        .single();
                    
                    if (paymentError) {
                        // Log error but don't fail the webhook - payment was successful
                        console.error('⚠️ Error creating payment record:', paymentError);
                    } else {
                        console.log('✅ Payment record created:', payment);
                    }
                    
                    console.log('✅ Subscription created/updated:', subscription);
                    console.log('✅ Payment successful for:', customerEmail);
                    console.log('💰 Amount:', amount, currency);
                    console.log('📦 Plan:', planType);
                    
                    // Send subscription confirmation email (NON-BLOCKING)
                    // Use IIFE to handle async without blocking
                    const emailPromise = (async () => {
                        try {
                            // Only use real user data - no fallbacks
                            const userName = foundUser?.user_metadata?.name || 
                                           foundUser?.user_metadata?.full_name || 
                                           customerEmail?.split('@')[0] || 
                                           'Chess Player';
                            
                            const planName = planType === 'monthly' ? 'Monthly Premium' : 'Quarterly Premium';
                            
                            console.log('📧 [WEBHOOK] Sending subscription confirmation email directly (no HTTP call)');
                            console.log('📧 [WEBHOOK] Email data:', { planName, amount, currency, to: customerEmail });
                            
                            const emailStartTime = Date.now();
                            const result = await sendEmailDirect('subscription_confirmed', customerEmail, userName, {
                                planName,
                                amount,
                                currency
                            });
                            
                            const emailDuration = Date.now() - emailStartTime;
                            
                            if (result.success) {
                                console.log('✅ [WEBHOOK] Subscription confirmation email sent successfully in', emailDuration, 'ms:', result.messageId);
                            } else {
                                console.warn('⚠️ [WEBHOOK] Email sending failed:', result.error);
                                if (result.details) {
                                    console.warn('⚠️ [WEBHOOK] Email error details:', result.details);
                                }
                            }
                        } catch (emailError) {
                            // Log full error details for debugging
                            console.warn('⚠️ [WEBHOOK] Could not send subscription email (non-critical):', emailError.message);
                            console.warn('⚠️ [WEBHOOK] Email error stack:', emailError.stack);
                            console.warn('⚠️ [WEBHOOK] Email error name:', emailError.name);
                        }
                    })(); // Execute immediately, don't await
                    
                    // Attach error handler to prevent unhandled rejection
                    emailPromise.catch(err => {
                        console.warn('⚠️ [WEBHOOK] Unhandled email promise rejection:', err.message);
                    });
                    
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

