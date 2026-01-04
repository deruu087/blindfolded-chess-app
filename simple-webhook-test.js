#!/usr/bin/env node

// Simple test script - just tests the database update logic
// Run: node simple-webhook-test.js your-email@example.com

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const email = process.argv[2] || 'test@example.com';
const amount = parseFloat(process.argv[3]) || 3.52;

const supabaseUrl = process.env.SUPABASE_URL || 'https://yaaxydrmuslgzjletzbw.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
    console.error('❌ Create .env.local with:');
    console.error('SUPABASE_SERVICE_ROLE_KEY=your_key_here');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function test() {
    console.log('🧪 Testing webhook logic...');
    console.log('Email:', email);
    console.log('Amount:', amount);
    
    // Find user
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const user = users?.find(u => u.email === email);
    
    if (!user) {
        console.error('❌ User not found:', email);
        console.log('Available users:', users?.map(u => u.email).join(', '));
        return;
    }
    
    console.log('✅ Found user:', user.id);
    
    // Determine plan
    const planType = amount >= 8.0 ? 'quarterly' : 'monthly';
    
    // Update subscription
    const { data: sub, error: subError } = await supabase
        .from('subscriptions')
        .upsert({
            user_id: user.id,
            plan_type: planType,
            status: 'active',
            start_date: new Date().toISOString().split('T')[0],
            amount_paid: amount,
            currency: 'EUR',
            payment_method: 'dodo_payments'
        }, { onConflict: 'user_id' })
        .select()
        .single();
    
    if (subError) {
        console.error('❌ Subscription error:', subError);
        return;
    }
    
    console.log('✅ Subscription updated:', sub);
    
    // Insert payment
    const { data: payment, error: payError } = await supabase
        .from('payments')
        .insert({
            user_id: user.id,
            amount: amount,
            currency: 'EUR',
            status: 'paid',
            payment_date: new Date().toISOString(),
            order_id: 'test_' + Date.now(),
            payment_method: 'dodo_payments',
            description: `${planType} subscription payment`
        })
        .select()
        .single();
    
    if (payError) {
        console.error('❌ Payment error:', payError);
        return;
    }
    
    console.log('✅ Payment created:', payment);
    console.log('');
    console.log('✅ Test complete! Check Supabase tables.');
}

test().catch(console.error);

