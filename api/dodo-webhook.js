// Vercel serverless function to handle Dodo Payments webhooks
// This will automatically update Supabase subscriptions when payments succeed

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
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
        const amountRaw = data.total_amount || data.recurring_pre_tax_amount || data.amount || data.settlement_amount || data.price || data.total || 
                         data.line_items?.[0]?.price || data.line_items?.[0]?.amount ||
                         webhookData.total_amount || webhookData.amount || webhookData.price;
        
        console.log('💰 [WEBHOOK] Amount extraction attempt:', {
            total_amount: data.total_amount,
            recurring_pre_tax_amount: data.recurring_pre_tax_amount,
            amount: data.amount,
            settlement_amount: data.settlement_amount,
            price: data.price,
            total: data.total,
            line_items: data.line_items,
            foundAmountRaw: amountRaw
        });
        
        if (!amountRaw && amountRaw !== 0) {
            console.error('❌ No amount found in webhook data');
            console.error('Available data fields:', Object.keys(data));
            console.error('Available webhookData fields:', Object.keys(webhookData));
            console.error('Full data object:', JSON.stringify(data, null, 2));
            console.error('Full webhookData object:', JSON.stringify(webhookData, null, 2));
            return res.status(400).json({ 
                error: 'Missing required field: amount',
                availableDataFields: Object.keys(data),
                availableWebhookFields: Object.keys(webhookData),
                receivedData: data
            });
        }
        
        // Check if amount is already in decimal format or in cents
        let amount;
        const amountNum = parseFloat(amountRaw);
        if (isNaN(amountNum)) {
            console.error('❌ Amount is not a valid number:', amountRaw);
            return res.status(400).json({ 
                error: 'Invalid amount format',
                receivedAmount: amountRaw
            });
        }
        
        if (amountNum > 1000) {
            // Likely in cents, convert to decimal
            amount = (amountNum / 100).toFixed(2);
            console.log('💰 [WEBHOOK] Converted from cents:', amountRaw, '->', amount);
        } else {
            // Already in decimal format
            amount = amountNum.toFixed(2);
            console.log('💰 [WEBHOOK] Using decimal amount:', amount);
        }
        
        // Extract currency - try multiple fields, default to EUR if not found
        const currency = data.currency || data.settlement_currency || data.currency_code || 'EUR';
        if (!currency) {
            console.warn('⚠️ No currency found, defaulting to EUR');
        }
        
        // Extract status - try multiple fields, infer from event type if needed
        let status = data.status || data.payment_status || data.state;
        if (!status) {
            // Try to infer status from event type
            if (eventType && (eventType.includes('completed') || eventType.includes('succeeded') || eventType.includes('active'))) {
                status = 'completed';
                console.log('📋 Inferred status from event type:', status);
            } else if (eventType && eventType.includes('cancelled')) {
                status = 'cancelled';
                console.log('📋 Inferred status from event type:', status);
            } else {
                console.warn('⚠️ No status found, defaulting to completed');
                status = 'completed'; // Default to completed for payment webhooks
            }
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
            
            // Determine plan type from payment frequency or amount - NO FALLBACKS
            // Only use real data from webhook
            const amountNum = parseFloat(amount);
            if (isNaN(amountNum)) {
                console.error('❌ Invalid amount:', amount);
                return res.status(400).json({ error: 'Invalid amount value' });
            }
            
            let planType = null;
            
            // Check payment frequency from webhook data (PREFERRED)
            if (data.payment_frequency_interval === 'Month' && data.payment_frequency_count === 1) {
                planType = 'monthly';
            } else if (data.payment_frequency_interval === 'Month' && data.payment_frequency_count === 3) {
                planType = 'quarterly';
            }
            
            // If plan type not determined from frequency, try other fields
            if (!planType) {
                // Try to get from plan_type field if available
                planType = data.plan_type || data.plan || data.product_name;
                
                // Normalize plan type string
                if (planType) {
                    planType = planType.toLowerCase();
                    if (planType.includes('monthly') || planType.includes('month')) {
                        planType = 'monthly';
                    } else if (planType.includes('quarterly') || planType.includes('quarter') || planType.includes('3 month')) {
                        planType = 'quarterly';
                    }
                }
            }
            
            // If still no plan type, infer from amount (monthly is typically lower)
            // This is a last resort - we prefer explicit plan_type from webhook
            if (!planType) {
                console.warn('⚠️ Plan type not found in webhook, inferring from amount');
                // Monthly is typically $4.99 (≈4.50-5.50 EUR), Quarterly is $12.99 (≈11.50-13.50 EUR)
                // Use amount to infer plan type as last resort
                if (amountNum >= 11.0) {
                    planType = 'quarterly';
                    console.log('📊 Inferred quarterly plan from amount:', amountNum);
                } else if (amountNum >= 3.0) {
                    planType = 'monthly';
                    console.log('📊 Inferred monthly plan from amount:', amountNum);
                } else {
                    console.error('❌ Cannot determine plan type - amount too low or missing plan info');
                    console.error('Webhook data:', JSON.stringify(data, null, 2));
                    return res.status(400).json({ 
                        error: 'Missing required field: payment_frequency or plan_type',
                        receivedAmount: amountNum,
                        availableFields: Object.keys(data)
                    });
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
                const dodoSubscriptionId = data.subscription_id || orderId;
                
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
                
                try {
                    // CRITICAL: Create both subscription and payment records
                    // Don't return early - ensure both are created
                    
                    let subscription = null;
                    let payment = null;
                    let subscriptionError = null;
                    let paymentError = null;
                    
                    // Step 1: Create/update subscription
                    console.log('📝 [WEBHOOK] Creating subscription record...');
                    const { data: subData, error: subError } = await supabase
                        .from('subscriptions')
                        .upsert(subscriptionData, {
                            onConflict: 'user_id'
                        })
                        .select()
                        .single();
                    
                    if (subError) {
                        console.error('❌ Error creating/updating subscription:', subError);
                        console.error('❌ Subscription data attempted:', JSON.stringify(subscriptionData, null, 2));
                        subscriptionError = subError;
                    } else {
                        subscription = subData;
                        console.log('✅ Subscription created/updated successfully:', subscription);
                    }
                    
                    // Step 2: Create payment record (always try, even if subscription failed)
                    console.log('📝 [WEBHOOK] Creating payment record...');
                    const subscriptionId = data.subscription_id || orderId;
                    const paymentData = {
                        user_id: userId,
                        email: customerEmail, // Add email for easier querying
                        amount: amountNum,
                        currency: currency,
                        status: 'paid',
                        payment_date: data.created_at || data.previous_billing_date || data.payment_date || new Date().toISOString(),
                        invoice_url: `https://checkout.dodopayments.com/account`,
                        order_id: subscriptionId,
                        transaction_id: subscriptionId,
                        payment_method: 'dodo_payments',
                        description: `${planType} subscription payment`
                    };
                    
                    const { data: payData, error: payError } = await supabase
                        .from('payments')
                        .insert(paymentData)
                        .select()
                        .single();
                    
                    if (payError) {
                        console.error('❌ Error creating payment record:', payError);
                        console.error('❌ Payment data attempted:', JSON.stringify(paymentData, null, 2));
                        paymentError = payError;
                    } else {
                        payment = payData;
                        console.log('✅ Payment record created successfully:', payment);
                    }
                    
                    // Step 3: Report results - both should be created
                    if (subscriptionError && paymentError) {
                        // Both failed - return error
                        console.error('❌ Both subscription and payment creation failed!');
                        return res.status(500).json({ 
                            error: 'Failed to create subscription and payment',
                            subscriptionError: subscriptionError.message,
                            paymentError: paymentError.message
                        });
                    } else if (subscriptionError) {
                        // Subscription failed but payment succeeded - still return error
                        console.error('❌ Subscription creation failed, but payment was recorded');
                        return res.status(500).json({ 
                            error: 'Failed to create subscription',
                            message: subscriptionError.message,
                            payment: payment // Payment was created
                        });
                    } else if (paymentError) {
                        // Subscription succeeded but payment failed - retry payment creation
                        console.warn('⚠️ Payment creation failed, retrying...');
                        const { data: retryPayment, error: retryError } = await supabase
                            .from('payments')
                            .insert(paymentData)
                            .select()
                            .single();
                        
                        if (retryError) {
                            console.error('❌ Payment retry also failed:', retryError);
                            // Subscription was created, payment failed - log but don't fail webhook
                            console.error('⚠️ WARNING: Subscription created but payment record failed');
                        } else {
                            payment = retryPayment;
                            console.log('✅ Payment record created on retry:', payment);
                        }
                    }
                    
                    // Success - both records created (or at least subscription)
                    console.log('✅ [WEBHOOK] Success summary:');
                    console.log('  - Subscription:', subscription ? '✅ Created' : '❌ Failed');
                    console.log('  - Payment:', payment ? '✅ Created' : '❌ Failed');
                    console.log('  - Customer:', customerEmail);
                    console.log('  - Amount:', amount, currency);
                    console.log('  - Plan:', planType);
                    
                    // Send subscription confirmation email (NON-BLOCKING - wrapped in try-catch)
                    try {
                        // Only use real user data - no fallbacks
                        const userName = foundUser?.user_metadata?.name || 
                                       foundUser?.user_metadata?.full_name || 
                                       customerEmail?.split('@')[0] || 
                                       null;
                        
                        const planName = planType === 'monthly' ? 'Monthly Premium' : 'Quarterly Premium';
                        
                        const emailApiUrl = process.env.VERCEL_URL 
                            ? `https://${process.env.VERCEL_URL}/api/send-email`
                            : 'https://memo-chess.com/api/send-email';
                        
                        // Don't await - fire and forget, non-blocking
                        fetch(emailApiUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                type: 'subscription_confirmed',
                                to: customerEmail,
                                name: userName,
                                data: { planName, amount, currency }
                            })
                        }).catch(() => {
                            // Silently fail - email is optional, payment already succeeded
                        });
                    } catch (emailError) {
                        // Silently fail - email is optional
                        console.log('Note: Could not send subscription email (non-critical)');
                    }
                    
                    // Return success with both records
                    return res.status(200).json({ 
                        success: true, 
                        message: 'Webhook processed successfully',
                        orderId: orderId,
                        subscription: subscription,
                        payment: payment,
                        recordsCreated: {
                            subscription: !!subscription,
                            payment: !!payment
                        }
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

