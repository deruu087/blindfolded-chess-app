#!/usr/bin/env node

// Script to sync existing subscription and payment to Supabase
// Usage: node sync-existing-subscription.js your-email@example.com 3.52 monthly

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const email = process.argv[2];
const amount = parseFloat(process.argv[3]) || 3.52;
const planType = process.argv[4] || 'monthly'; // 'monthly' or 'quarterly'
const paymentDate = process.argv[5] || new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

if (!email) {
    console.error('❌ Usage: node sync-existing-subscription.js your-email@example.com [amount] [planType] [paymentDate]');
    console.error('Example: node sync-existing-subscription.js user@example.com 3.52 monthly 2024-01-15');
    process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL || 'https://yaaxydrmuslgzjletzbw.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY not set in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function syncSubscription() {
    console.log('🔄 Syncing existing subscription...');
    console.log('Email:', email);
    console.log('Amount:', amount);
    console.log('Plan:', planType);
    console.log('Payment Date:', paymentDate);
    console.log('');
    
    // Find user
    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
    
    if (userError) {
        console.error('❌ Error finding user:', userError);
        return;
    }
    
    const user = users?.find(u => u.email === email);
    
    if (!user) {
        console.error('❌ User not found:', email);
        console.log('Available users:', users?.map(u => u.email).join(', '));
        return;
    }
    
    console.log('✅ Found user:', user.id);
    
    // Calculate start date (use payment date as start date)
    const startDate = paymentDate;
    
    // Update/Create subscription
    const subscriptionData = {
        user_id: user.id,
        plan_type: planType,
        status: 'active',
        start_date: startDate,
        end_date: null,
        amount_paid: amount,
        currency: 'EUR',
        payment_method: 'dodo_payments',
        updated_at: new Date().toISOString()
    };
    
    const { data: subscription, error: subError } = await supabase
        .from('subscriptions')
        .upsert(subscriptionData, {
            onConflict: 'user_id'
        })
        .select()
        .single();
    
    if (subError) {
        console.error('❌ Error syncing subscription:', subError);
        return;
    }
    
    console.log('✅ Subscription synced:', subscription);
    
    // Insert payment record
    const paymentData = {
        user_id: user.id,
        amount: amount,
        currency: 'EUR',
        status: 'paid',
        payment_date: paymentDate + 'T00:00:00Z', // Add time for timestamp
        invoice_url: 'https://checkout.dodopayments.com/account',
        order_id: 'existing_payment_' + Date.now(),
        transaction_id: 'existing_payment_' + Date.now(),
        payment_method: 'dodo_payments',
        description: `${planType} subscription payment (synced)`
    };
    
    const { data: payment, error: payError } = await supabase
        .from('payments')
        .insert(paymentData)
        .select()
        .single();
    
    if (payError) {
        console.error('❌ Error syncing payment:', payError);
        return;
    }
    
    console.log('✅ Payment synced:', payment);
    console.log('');
    console.log('✅ Sync complete! Check Supabase tables:');
    console.log('  - subscriptions table');
    console.log('  - payments table');
}

syncSubscription().catch(console.error);

