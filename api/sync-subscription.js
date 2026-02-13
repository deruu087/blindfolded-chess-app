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
        const { userEmail, subscriptionId, amount, currency: webhookCurrency, planType, paymentDate } = req.body;
        
        // ALWAYS use USD regardless of what's sent
        const currency = 'USD';
        
        console.log('🔄 [SYNC] Syncing subscription to Supabase:', {
            userEmail,
            subscriptionId,
            amount,
            webhookCurrency: webhookCurrency,
            currency: 'USD', // Always USD, ignore webhook currency // Always USD
            planType,
            paymentDate
        });
        
        // Validate required fields
        if (!userEmail) {
            return res.status(400).json({ error: 'Missing required field: userEmail' });
        }
        
        if (!amount || !planType) {
            return res.status(400).json({ error: 'Missing required fields: amount or planType' });
        }
        
        // REJECT payments with amount 2.94 - this is a wrong/duplicate payment
        const amountNum = parseFloat(amount);
        if (Math.abs(amountNum - 2.94) < 0.01) {
            console.warn('⚠️ [SYNC] Rejecting payment with wrong amount 2.94 - this is a duplicate/incorrect payment');
            return res.status(400).json({ 
                error: 'Payment with amount 2.94 rejected - incorrect/duplicate payment',
                rejected: true,
                reason: 'Incorrect amount 2.94'
            });
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
            currency: 'USD', // Always USD, ignore webhook currency
            payment_method: 'dodo_payments',
            dodo_subscription_id: subscriptionId || null,
            updated_at: new Date().toISOString()
        };
        
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
                console.log('✅ [SYNC] Keeping existing subscription with correct amount:', existingAmount);
                subscription = existingSubscription;
            } else {
                // Update existing subscription (new is correct or both are same)
                console.log('🔄 [SYNC] Subscription exists, updating:', existingSubscription.id);
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
                console.log('✅ [SYNC] Subscription updated:', subscription);
            }
        } else {
            // Insert new subscription
            console.log('📝 [SYNC] Creating new subscription:', subscriptionData);
            const { data: inserted, error: insertError } = await supabase
                .from('subscriptions')
                .insert(subscriptionData)
                .select()
                .single();
            
            if (insertError) {
                // Check if it's a duplicate error (unique constraint violation)
                if (insertError.code === '23505' || insertError.message.includes('duplicate') || insertError.message.includes('unique')) {
                    console.log('🔄 [SYNC] Duplicate subscription detected, fetching existing...');
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
                        console.log('✅ [SYNC] Subscription updated (duplicate handled):', subscription);
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
                console.log('✅ [SYNC] Subscription created:', subscription);
            }
        }
        
        // Check if payment was already created recently (within last 2 minutes) by webhook
        // This prevents sync-subscription from creating duplicate if webhook already processed it
        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
        const { data: recentPayment } = await supabase
            .from('payments')
            .select('*')
            .eq('user_id', userId)
            .eq('amount', amountNum)
            .gte('created_at', twoMinutesAgo.toISOString())
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        
        if (recentPayment) {
            console.log('✅ [SYNC] Payment already exists (likely created by webhook), skipping payment creation:', recentPayment.id);
            console.log('✅ [SYNC] This prevents duplicate payments when both webhook and sync-subscription run');
            return res.status(200).json({ 
                success: true, 
                message: 'Subscription synced successfully. Payment already exists (created by webhook).',
                subscription: subscription,
                payment: recentPayment
            });
        }
        
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
            currency: 'USD', // Always USD, ignore webhook currency
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
                console.log('🔄 [SYNC] Payment with payment_id already exists, will update:', existingPayment.id);
            }
        }
        
        // Also check by order_id/transaction_id if no payment_id
        if (!existingPayment && subscriptionId && !subscriptionId.startsWith('sync_')) {
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
                console.log('🔄 [SYNC] Payment with order_id already exists, will update:', existingPayment.id);
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
                        console.log('⚠️ [SYNC] Found wrong payment (2.94) with same order_id, will delete it:', wrongPayment.id);
                        await supabase
                            .from('payments')
                            .delete()
                            .eq('id', wrongPayment.id);
                        console.log('✅ [SYNC] Deleted wrong payment (2.94)');
                    }
                }
            }
        }
        
        // Also check by amount + date (within 5 minutes) to catch duplicates even without payment_id
        // This prevents sync-subscription from creating duplicate if webhook already created one
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
                console.log('🔄 [SYNC] Found recent payment with same amount/date, will update:', existingPayment.id);
                console.log('🔄 [SYNC] This prevents duplicate from sync-subscription if webhook already created payment');
            }
        }
        
        console.log('📝 [SYNC] Creating/updating payment record:', paymentData);
        
        // Use upsert to handle duplicates atomically at database level
        // This prevents race conditions where multiple requests check before insert
        let payment;
        const upsertData = {
            ...paymentData,
            updated_at: new Date().toISOString()
        };
        
        if (extractedPaymentId) {
            // Try to find existing payment first
            const { data: existing } = await supabase
                .from('payments')
                .select('*')
                .eq('payment_id', extractedPaymentId)
                .eq('user_id', userId)
                .maybeSingle();
            
            if (existing) {
                // Update existing payment
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
                    console.log('✅ [SYNC] Payment record updated:', payment);
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
                        console.log('🔄 [SYNC] Duplicate payment detected, fetching existing...');
                        // Fetch existing payment
                        const { data: existingAfterInsert } = await supabase
                            .from('payments')
                            .select('*')
                            .eq('payment_id', extractedPaymentId)
                            .eq('user_id', userId)
                            .single();
                        
                        if (existingAfterInsert) {
                            // Update existing with better data
                            const { data: updated } = await supabase
                                .from('payments')
                                .update(upsertData)
                                .eq('id', existingAfterInsert.id)
                                .select()
                                .single();
                            payment = updated || existingAfterInsert;
                            console.log('✅ [SYNC] Payment record updated (duplicate handled):', payment);
                        } else {
                            console.error('⚠️ Duplicate error but could not find existing payment:', insertError);
                            return res.status(200).json({ 
                                success: true, 
                                message: 'Subscription created but payment record failed (duplicate)',
                                subscription: subscription,
                                paymentError: insertError.message
                            });
                        }
                    } else {
                        console.error('⚠️ Error creating payment record:', insertError);
                        return res.status(200).json({ 
                            success: true, 
                            message: 'Subscription created but payment record failed',
                            subscription: subscription,
                            paymentError: insertError.message
                        });
                    }
                } else {
                    payment = inserted;
                    console.log('✅ [SYNC] Payment record created:', payment);
                }
            }
        } else {
            // For payments without payment_id, use manual check and insert with duplicate handling
            if (existingPayment) {
                // Update existing payment
                const { data: updated, error: updateError } = await supabase
                    .from('payments')
                    .update(upsertData)
                    .eq('id', existingPayment.id)
                    .select()
                    .single();
                
                if (updateError) {
                    console.error('⚠️ Error updating payment record:', updateError);
                    return res.status(200).json({ 
                        success: true, 
                        message: 'Subscription created but payment record update failed',
                        subscription: subscription,
                        paymentError: updateError.message
                    });
                }
                payment = updated;
                console.log('✅ [SYNC] Payment record updated (deduplication):', payment);
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
                        console.log('🔄 [SYNC] Duplicate payment detected, fetching existing...');
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
                            console.log('✅ [SYNC] Payment record updated (duplicate handled):', payment);
                        } else {
                            console.error('⚠️ Duplicate error but could not find existing payment:', insertError);
                            return res.status(200).json({ 
                                success: true, 
                                message: 'Subscription created but payment record failed (duplicate)',
                                subscription: subscription,
                                paymentError: insertError.message
                            });
                        }
                    } else {
                        console.error('⚠️ Error creating payment record:', insertError);
                        return res.status(200).json({ 
                            success: true, 
                            message: 'Subscription created but payment record failed',
                            subscription: subscription,
                            paymentError: insertError.message
                        });
                    }
                } else {
                    payment = inserted;
                    console.log('✅ [SYNC] Payment record created:', payment);
                }
            }
        }
        
        // Send subscription confirmation email via HTTP endpoint (same as registration emails)
        // This ensures consistency and reliability since registration emails work
        console.log('📧 [SYNC] Starting email send process for:', userEmail);
        // Use IIFE to handle async without blocking
        // Store promise to prevent garbage collection
        const emailPromise = (async () => {
            try {
                const planName = planType === 'monthly' ? 'Monthly Premium' : 'Quarterly Premium';
                const userName = userEmail.split('@')[0]; // Use email prefix as name
                
                // Use HTTP endpoint (same as registration emails) for reliability
                const emailApiUrl = process.env.VERCEL_URL 
                    ? `https://${process.env.VERCEL_URL}/api/send-email`
                    : 'https://memo-chess.com/api/send-email';
                
                console.log('📧 [SYNC] Sending subscription confirmation email via HTTP endpoint:', emailApiUrl);
                console.log('📧 [SYNC] Email data:', { planName, amount, currency, to: userEmail, userName });
                
                const emailStartTime = Date.now();
                const response = await fetch(emailApiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'subscription_confirmed',
                        to: userEmail,
                        name: userName,
                        data: { planName, amount, currency }
                    })
                });
                
                const emailDuration = Date.now() - emailStartTime;
                console.log('📧 [SYNC] Email API response:', { status: response.status, ok: response.ok, duration: emailDuration });
                
                if (response.ok) {
                    const result = await response.json();
                    console.log('✅ [SYNC] Subscription confirmation email sent successfully in', emailDuration, 'ms:', result.messageId);
                } else {
                    const errorData = await response.json().catch(() => ({}));
                    console.error('❌ [SYNC] Email sending failed:', response.status, errorData);
                    
                    // Fallback: Try direct call if HTTP endpoint failed
                    console.log('📧 [SYNC] Attempting fallback via direct call...');
                    try {
                        if (typeof sendEmailDirect === 'function') {
                            const directResult = await sendEmailDirect('subscription_confirmed', userEmail, userName, {
                                planName,
                                amount,
                                currency
                            });
                            if (directResult.success) {
                                console.log('✅ [SYNC] Email sent via direct call fallback:', directResult.messageId);
                            } else {
                                console.error('❌ [SYNC] Direct call fallback also failed:', directResult.error);
                            }
                        } else {
                            console.error('❌ [SYNC] sendEmailDirect not available for fallback');
                        }
                    } catch (fallbackError) {
                        console.error('❌ [SYNC] Direct call fallback error:', fallbackError.message);
                    }
                }
            } catch (emailError) {
                // Log full error details for debugging
                console.error('❌ [SYNC] Could not send subscription email:', emailError.message);
                console.error('❌ [SYNC] Email error stack:', emailError.stack);
                console.error('❌ [SYNC] Email error name:', emailError.name);
            }
        })(); // Execute immediately, don't await
        
        // Attach error handler to prevent unhandled rejection
        emailPromise.catch(err => {
            console.error('❌ [SYNC] Unhandled email promise rejection:', err.message);
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

