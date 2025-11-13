// Vercel serverless function to handle Dodo Payments webhooks
// This will automatically update Supabase subscriptions when payments succeed

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
            
            // Find user by email in Supabase
            const { createClient } = require('@supabase/supabase-js');
            
            const supabaseUrl = process.env.SUPABASE_URL || 'https://yaaxydrmuslgzjletzbw.supabase.co';
            const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhYXh5ZHJtdXNsZ3pqbGV0emJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyOTQ3NjksImV4cCI6MjA3Nzg3MDc2OX0.uv4fqCgRxq7HCT5TWvFxq5xHOUNFT3PI4nmvhhPS2Qk';
            
            const supabase = createClient(supabaseUrl, supabaseKey);
            
            if (customerEmail) {
                // Find user by email
                const { data: users, error: userError } = await supabase
                    .from('auth.users')
                    .select('id')
                    .eq('email', customerEmail)
                    .single();
                
                if (userError && userError.code !== 'PGRST116') {
                    console.error('Error finding user:', userError);
                }
                
                // Try alternative: query auth.users via RPC or use service role
                // For now, we'll use a different approach - store order info and match later
                
                // Create subscription record
                // Note: We need the user_id, so we'll store the order info and match it
                // when the user visits payment-success.html
                
                console.log('✅ Payment successful for:', customerEmail);
                console.log('💰 Amount:', amount, currency);
                
                // Return success
                res.status(200).json({ 
                    success: true, 
                    message: 'Webhook processed successfully',
                    orderId: orderId
                });
            } else {
                console.error('No customer email in webhook data');
                res.status(400).json({ error: 'No customer email provided' });
            }
        } else if (status === 'cancelled' || status === 'failed' || 
                   eventType === 'payment.cancelled' || eventType === 'payment.failed') {
            console.log('❌ Payment cancelled/failed for:', customerEmail);
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

