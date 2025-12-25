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
        
        console.log('📥 Dodo Payments webhook received:', JSON.stringify(webhookData, null, 2));
        
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
        
        // Extract amount (Dodo Payments sends in cents)
        const amountRaw = data.total_amount || data.recurring_pre_tax_amount || data.amount || data.settlement_amount || 0;
        const amount = (parseFloat(amountRaw) / 100).toFixed(2); // Convert cents to decimal
        
        const currency = data.currency || data.settlement_currency || 'EUR';
        const status = data.status || 'succeeded';
        
        console.log('📋 Webhook:', eventType, '| Email:', customerEmail, '| Amount:', amount, currency, '| Status:', status);
        
        // Handle successful payment
        if (status === 'completed' || status === 'paid' || status === 'success' || status === 'succeeded' ||
            eventType === 'payment.completed' || eventType === 'payment.succeeded' || 
            eventType === 'order.completed' || eventType === 'subscription.active') {
            
            // Initialize Supabase with service role key (needed to query auth.users)
            
            const supabaseUrl = process.env.SUPABASE_URL || 'https://yaaxydrmuslgzjletzbw.supabase.co';
            // Use service role key for admin operations (finding users by email)
            const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
            
            if (!supabaseServiceKey) {
                console.error('❌ SUPABASE_SERVICE_ROLE_KEY not configured');
                return res.status(500).json({ error: 'Server configuration error' });
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
            try {
                const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
                
                if (userError) {
                    console.error('Error listing users:', userError);
                } else if (users) {
                    const user = users.find(u => u.email === customerEmail);
                    if (user) {
                        userId = user.id;
                        console.log('✅ Found user:', userId, 'for email:', customerEmail);
                    } else {
                        console.log('⚠️ User not found for email:', customerEmail);
                    }
                }
            } catch (error) {
                console.error('Error finding user:', error);
            }
            
            // Determine plan type from amount
            // Monthly: €0.85 (test) or €3.52 (prod), Quarterly: €8.90
            // Amount is already converted from cents to decimal
            const amountNum = parseFloat(amount) || 0;
            let planType = 'monthly';
            
            // Check payment frequency from webhook data
            if (data.payment_frequency_interval === 'Month' && data.payment_frequency_count === 1) {
                planType = 'monthly';
            } else if (data.payment_frequency_interval === 'Month' && data.payment_frequency_count === 3) {
                planType = 'quarterly';
            } else {
                // Fallback to amount-based detection
                if (amountNum >= 8.0 && amountNum <= 12.0) {
                    planType = 'quarterly';
                } else if (amountNum >= 0.5 && amountNum <= 5.0) {
                    planType = 'monthly';
                }
            }
            
            // If we found the user, create/update subscription
            if (userId) {
                // Extract next_billing_date from webhook data if available
                let nextBillingDate = null;
                if (data.next_billing_date) {
                    // Dodo Payments sends ISO string, convert to date
                    nextBillingDate = data.next_billing_date.split('T')[0]; // Extract date part
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
                    currency: currency || 'EUR',
                    payment_method: 'dodo_payments',
                    updated_at: new Date().toISOString()
                };
                
                try {
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
                    
                    // Insert payment record into payments table
                    // Use subscription_id as order_id and transaction_id
                    const subscriptionId = data.subscription_id || orderId;
                    const paymentData = {
                        user_id: userId,
                        email: customerEmail, // Add email for easier querying
                        amount: amountNum,
                        currency: currency || 'EUR',
                        status: 'paid',
                        payment_date: data.created_at || data.previous_billing_date || new Date().toISOString(),
                        invoice_url: `https://checkout.dodopayments.com/account`,
                        order_id: subscriptionId,
                        transaction_id: subscriptionId,
                        payment_method: 'dodo_payments',
                        description: `${planType} subscription payment`
                    };
                    
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
            const supabaseUrl = process.env.SUPABASE_URL || 'https://yaaxydrmuslgzjletzbw.supabase.co';
            const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
            
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

