#!/usr/bin/env node

// Local webhook server for testing Dodo Payments webhooks
// Run: node local-webhook-server.js
// Then use ngrok to expose: ngrok http 3002

import http from 'http';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables from .env file if it exists
dotenv.config({ path: '.env.local' });

const PORT = 3002;

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://yaaxydrmuslgzjletzbw.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseServiceKey) {
    console.error('❌ ERROR: SUPABASE_SERVICE_ROLE_KEY not set!');
    console.error('Create a .env.local file with:');
    console.error('SUPABASE_URL=https://yaaxydrmuslgzjletzbw.supabase.co');
    console.error('SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

// Webhook handler function (same logic as Vercel version)
async function handleWebhook(webhookData) {
    console.log('📥 Webhook received:', JSON.stringify(webhookData, null, 2));
    
    const eventType = webhookData.event || webhookData.type || webhookData.status;
    const orderId = webhookData.order_id || webhookData.transaction_id || webhookData.id;
    const customerEmail = webhookData.customer?.email || webhookData.email || webhookData.customer_email;
    const amount = webhookData.amount || webhookData.total || webhookData.price;
    const currency = webhookData.currency || 'EUR';
    const status = webhookData.status || webhookData.payment_status;
    
    console.log('Event type:', eventType);
    console.log('Order ID:', orderId);
    console.log('Customer email:', customerEmail);
    console.log('Status:', status);
    
    // Handle successful payment
    if (status === 'completed' || status === 'paid' || status === 'success' || 
        eventType === 'payment.completed' || eventType === 'order.completed') {
        
        if (!customerEmail) {
            console.error('❌ No customer email in webhook data');
            return { success: false, error: 'No customer email provided' };
        }
        
        // Find user by email
        let userId = null;
        try {
            const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
            
            if (userError) {
                console.error('❌ Error listing users:', userError);
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
            console.error('❌ Error finding user:', error);
        }
        
        // Determine plan type from amount
        const amountNum = parseFloat(amount) || 0;
        let planType = 'monthly';
        if (amountNum >= 8.0 && amountNum <= 12.0) {
            planType = 'quarterly';
        } else if (amountNum >= 3.0 && amountNum <= 4.0) {
            planType = 'monthly';
        }
        
        if (userId) {
            const subscriptionData = {
                user_id: userId,
                plan_type: planType,
                status: 'active',
                start_date: new Date().toISOString().split('T')[0],
                end_date: null,
                amount_paid: amountNum,
                currency: currency || 'EUR',
                payment_method: 'dodo_payments',
                updated_at: new Date().toISOString()
            };
            
            try {
                // Update subscription
                const { data: subscription, error: subError } = await supabase
                    .from('subscriptions')
                    .upsert(subscriptionData, {
                        onConflict: 'user_id'
                    })
                    .select()
                    .single();
                
                if (subError) {
                    console.error('❌ Error creating/updating subscription:', subError);
                    return { success: false, error: subError.message };
                }
                
                // Insert payment record
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
                    console.error('⚠️ Error creating payment record:', paymentError);
                } else {
                    console.log('✅ Payment record created:', payment);
                }
                
                console.log('✅ Subscription created/updated:', subscription);
                console.log('✅ Payment successful for:', customerEmail);
                console.log('💰 Amount:', amount, currency);
                console.log('📦 Plan:', planType);
                
                return { 
                    success: true, 
                    message: 'Webhook processed successfully',
                    orderId: orderId,
                    subscription: subscription
                };
            } catch (error) {
                console.error('❌ Error saving subscription:', error);
                return { success: false, error: error.message };
            }
        } else {
            console.log('⚠️ User not found for email:', customerEmail);
            return { 
                success: true, 
                message: 'Webhook received - user will be matched on payment-success page',
                orderId: orderId
            };
        }
    } else if (status === 'cancelled' || eventType === 'payment.cancelled' || eventType === 'subscription.cancelled') {
        // Handle cancellation
        if (customerEmail) {
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
        return { success: true, message: 'Payment cancellation processed' };
    } else {
        console.log('ℹ️ Unknown webhook event:', eventType, status);
        return { success: true, message: 'Webhook received but not processed' };
    }
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
    }
    
    let body = '';
    
    req.on('data', chunk => {
        body += chunk.toString();
    });
    
    req.on('end', async () => {
        try {
            const webhookData = JSON.parse(body);
            const result = await handleWebhook(webhookData);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        } catch (error) {
            console.error('❌ Webhook processing error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                error: 'Internal server error',
                message: error.message 
            }));
        }
    });
});

server.listen(PORT, () => {
    console.log('🚀 Local webhook server running on http://localhost:' + PORT);
    console.log('');
    console.log('📋 Next steps:');
    console.log('1. Install ngrok: brew install ngrok (or download from ngrok.com)');
    console.log('2. Run: ngrok http ' + PORT);
    console.log('3. Copy the ngrok URL (e.g., https://abc123.ngrok.io)');
    console.log('4. Use this URL in Dodo Payments webhook settings: https://abc123.ngrok.io');
    console.log('5. Or test locally using: curl -X POST http://localhost:' + PORT + ' -H "Content-Type: application/json" -d @test-webhook.json');
    console.log('');
    console.log('✅ Server ready to receive webhooks!');
});

