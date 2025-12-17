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
        const eventType = webhookData.event || webhookData.type || webhookData.status;
        const orderId = webhookData.order_id || webhookData.transaction_id || webhookData.id;
        const customerEmail = webhookData.customer?.email || webhookData.email || webhookData.customer_email;
        const amount = webhookData.amount || webhookData.total || webhookData.price;
        const currency = webhookData.currency || 'USD';
        const status = webhookData.status || webhookData.payment_status;
        
        console.log('Event type:', eventType);
        console.log('Order ID:', orderId);
        console.log('Customer email:', customerEmail);
        console.log('Status:', status);
        
        // Handle successful payment
        if (status === 'completed' || status === 'paid' || status === 'success' || 
            eventType === 'payment.completed' || eventType === 'order.completed') {
            
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
                console.error('No customer email in webhook data');
                return res.status(400).json({ error: 'No customer email provided' });
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
            // Monthly: €3.52 or $3.49, Quarterly: €8.90 or $8.90
            const amountNum = parseFloat(amount) || 0;
            let planType = 'monthly';
            if (amountNum >= 8.0 && amountNum <= 12.0) {
                planType = 'quarterly';
            } else if (amountNum >= 3.0 && amountNum <= 4.0) {
                planType = 'monthly';
            }
            
            // If we found the user, create/update subscription
            if (userId) {
                const subscriptionData = {
                    user_id: userId,
                    plan_type: planType,
                    status: 'active',
                    start_date: new Date().toISOString().split('T')[0],
                    end_date: null, // No end date for recurring subscriptions
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
                    const paymentData = {
                        user_id: userId,
                        amount: amountNum,
                        currency: currency || 'EUR',
                        status: 'paid',
                        payment_date: new Date().toISOString(),
                        invoice_url: `https://checkout.dodopayments.com/account`,
                        order_id: orderId,
                        transaction_id: orderId,
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

