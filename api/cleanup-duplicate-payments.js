// API endpoint to clean up duplicate payment records
// Keeps the payment with the correct invoice URL (not the default account page)
// Run this manually via POST request to clean up existing duplicates

import { createClient } from '@supabase/supabase-js';

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
        // Initialize Supabase with service role key
        const supabaseUrl = process.env.SUPABASE_URL;
        if (!supabaseUrl) {
            return res.status(500).json({ error: 'SUPABASE_URL not configured' });
        }
        
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
        if (!supabaseServiceKey) {
            return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' });
        }
        
        const supabase = createClient(supabaseUrl, supabaseServiceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });
        
        console.log('🧹 [CLEANUP] Starting duplicate payment cleanup...');
        
        // Find duplicate payments (same user, same amount, same date, different invoice URLs)
        // Group by user_id, amount, and payment_date (same day)
        const { data: allPayments, error: fetchError } = await supabase
            .from('payments')
            .select('*')
            .order('payment_date', { ascending: false });
        
        if (fetchError) {
            console.error('❌ [CLEANUP] Error fetching payments:', fetchError);
            return res.status(500).json({ error: 'Failed to fetch payments', details: fetchError.message });
        }
        
        if (!allPayments || allPayments.length === 0) {
            return res.status(200).json({ 
                success: true, 
                message: 'No payments found',
                deleted: 0
            });
        }
        
        // Group payments by user_id, amount, and date (same day)
        const paymentGroups = {};
        for (const payment of allPayments) {
            const dateKey = new Date(payment.payment_date).toISOString().split('T')[0]; // YYYY-MM-DD
            const groupKey = `${payment.user_id}_${payment.amount}_${dateKey}`;
            
            if (!paymentGroups[groupKey]) {
                paymentGroups[groupKey] = [];
            }
            paymentGroups[groupKey].push(payment);
        }
        
        // Find groups with duplicates (more than 1 payment)
        const duplicates = [];
        for (const [groupKey, payments] of Object.entries(paymentGroups)) {
            if (payments.length > 1) {
                duplicates.push({
                    groupKey,
                    payments,
                    count: payments.length
                });
            }
        }
        
        console.log(`🔍 [CLEANUP] Found ${duplicates.length} groups with duplicate payments`);
        
        let deletedCount = 0;
        let keptCount = 0;
        const deletedIds = [];
        const keptIds = [];
        
        for (const duplicate of duplicates) {
            const { payments } = duplicate;
            
            // Sort by: 1) Has payment_id (pay_XXX), 2) Has correct invoice URL (not default account page), 3) Most recent
            payments.sort((a, b) => {
                // Prefer payments with payment_id
                const aHasPaymentId = a.payment_id && a.payment_id.startsWith('pay_');
                const bHasPaymentId = b.payment_id && b.payment_id.startsWith('pay_');
                if (aHasPaymentId && !bHasPaymentId) return -1;
                if (!aHasPaymentId && bHasPaymentId) return 1;
                
                // Prefer payments with correct invoice URL (not default account page)
                const aHasCorrectUrl = a.invoice_url && 
                                       !a.invoice_url.includes('checkout.dodopayments.com/account') &&
                                       a.invoice_url.includes('/invoices/payments/');
                const bHasCorrectUrl = b.invoice_url && 
                                       !b.invoice_url.includes('checkout.dodopayments.com/account') &&
                                       b.invoice_url.includes('/invoices/payments/');
                if (aHasCorrectUrl && !bHasCorrectUrl) return -1;
                if (!aHasCorrectUrl && bHasCorrectUrl) return 1;
                
                // Prefer most recent
                return new Date(b.payment_date) - new Date(a.payment_date);
            });
            
            // Keep the first one (best payment), delete the rest
            const paymentToKeep = payments[0];
            const paymentsToDelete = payments.slice(1);
            
            console.log(`🔄 [CLEANUP] Group ${duplicate.groupKey}:`);
            console.log(`   ✅ Keeping: ${paymentToKeep.id} (amount: ${paymentToKeep.amount}, invoice_url: ${paymentToKeep.invoice_url?.substring(0, 50)}...)`);
            
            for (const paymentToDelete of paymentsToDelete) {
                console.log(`   🗑️  Deleting: ${paymentToDelete.id} (amount: ${paymentToDelete.amount}, invoice_url: ${paymentToDelete.invoice_url?.substring(0, 50)}...)`);
                
                const { error: deleteError } = await supabase
                    .from('payments')
                    .delete()
                    .eq('id', paymentToDelete.id);
                
                if (deleteError) {
                    console.error(`   ❌ Error deleting payment ${paymentToDelete.id}:`, deleteError);
                } else {
                    deletedCount++;
                    deletedIds.push(paymentToDelete.id);
                }
            }
            
            keptCount++;
            keptIds.push(paymentToKeep.id);
        }
        
        console.log(`✅ [CLEANUP] Cleanup complete: Deleted ${deletedCount} duplicate payments, kept ${keptCount} payments`);
        
        return res.status(200).json({
            success: true,
            message: `Cleanup complete: Deleted ${deletedCount} duplicate payments, kept ${keptCount} payments`,
            deleted: deletedCount,
            kept: keptCount,
            deletedIds,
            keptIds,
            duplicateGroups: duplicates.length
        });
        
    } catch (error) {
        console.error('❌ [CLEANUP] General error:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Internal server error', 
            details: error.message 
        });
    }
}

