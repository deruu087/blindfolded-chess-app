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
        // Check action parameter
        const { action = 'cleanup' } = req.body || {};
        
        // Handle update-invoices action (from update-invoice-urls.js)
        if (action === 'update-invoices') {
            // Import the getInvoiceUrlFromDodo function logic
            const getInvoiceUrlFromDodo = async (paymentId, orderId, subscriptionId) => {
                const dodoApiKey = process.env.DODO_PAYMENTS_API_KEY?.trim();
                if (!dodoApiKey) return null;
                
                const apiBaseUrl = dodoApiKey.startsWith('sk_test_') 
                    ? 'https://test.dodopayments.com'
                    : 'https://live.dodopayments.com';
                
                const idsToTry = [paymentId, orderId, subscriptionId].filter(Boolean);
                
                for (const id of idsToTry) {
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
                            const invoiceUrl = paymentData.invoice_url || paymentData.invoice?.url;
                            if (invoiceUrl) return invoiceUrl;
                        }
                    } catch (error) {
                        console.warn('Error fetching invoice URL:', error.message);
                    }
                }
                
                // Construct URL if we have payment_id
                let validPaymentId = null;
                for (const id of idsToTry) {
                    if (id && id.startsWith('pay_')) {
                        validPaymentId = id;
                        break;
                    }
                }
                
                if (validPaymentId) {
                    return `${apiBaseUrl}/invoices/payments/${validPaymentId}`;
                }
                
                return null;
            };
            
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
            
            // Get all payments with default invoice URL that have payment_id
            const { data: payments, error: paymentsError } = await supabase
                .from('payments')
                .select('*')
                .eq('invoice_url', 'https://checkout.dodopayments.com/account')
                .not('payment_id', 'is', null)
                .like('payment_id', 'pay_%');
            
            if (paymentsError) {
                return res.status(500).json({ error: 'Failed to fetch payments', details: paymentsError.message });
            }
            
            if (!payments || payments.length === 0) {
                return res.status(200).json({ 
                    success: true, 
                    message: 'No payments found with default invoice URL',
                    updated: 0
                });
            }
            
            let updated = 0;
            let failed = 0;
            
            for (const payment of payments) {
                try {
                    const invoiceUrl = await getInvoiceUrlFromDodo(
                        payment.payment_id,
                        payment.order_id,
                        payment.transaction_id
                    );
                    
                    if (invoiceUrl && invoiceUrl !== 'https://checkout.dodopayments.com/account') {
                        const { error: updateError } = await supabase
                            .from('payments')
                            .update({ invoice_url: invoiceUrl })
                            .eq('id', payment.id);
                        
                        if (updateError) {
                            console.error(`❌ Error updating payment ${payment.id}:`, updateError);
                            failed++;
                        } else {
                            console.log(`✅ Updated payment ${payment.id} with invoice URL: ${invoiceUrl}`);
                            updated++;
                        }
                    } else {
                        failed++;
                    }
                } catch (error) {
                    console.error(`❌ Error processing payment ${payment.id}:`, error);
                    failed++;
                }
            }
            
            return res.status(200).json({
                success: true,
                message: `Updated ${updated} invoice URLs, ${failed} failed`,
                updated,
                failed,
                total: payments.length
            });
        }
        
        // Default action: cleanup duplicates (original cleanup logic)
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
        
        // Group payments by user_id and date (same day) - allow different amounts
        // This catches payments made on the same day even if amounts differ slightly
        const paymentGroups = {};
        for (const payment of allPayments) {
            const dateKey = new Date(payment.payment_date).toISOString().split('T')[0]; // YYYY-MM-DD
            // Group by user and date only - amounts can differ (tax, discounts, etc.)
            const groupKey = `${payment.user_id}_${dateKey}`;
            
            if (!paymentGroups[groupKey]) {
                paymentGroups[groupKey] = [];
            }
            paymentGroups[groupKey].push(payment);
        }
        
        // Find groups with potential duplicates (more than 1 payment on same day)
        // Also check if they have the same payment_id, order_id, or transaction_id
        const duplicates = [];
        for (const [groupKey, payments] of Object.entries(paymentGroups)) {
            if (payments.length > 1) {
                // Check if they share any common identifier (payment_id, order_id, transaction_id)
                const hasCommonId = payments.some((p1, i) => 
                    payments.slice(i + 1).some(p2 => 
                        (p1.payment_id && p2.payment_id && p1.payment_id === p2.payment_id) ||
                        (p1.order_id && p2.order_id && p1.order_id === p2.order_id) ||
                        (p1.transaction_id && p2.transaction_id && p1.transaction_id === p2.transaction_id)
                    )
                );
                
                // Or if amounts are very close (within 1 EUR) - likely same payment with tax adjustment
                const amountsClose = payments.length === 2 && 
                    Math.abs(parseFloat(payments[0].amount) - parseFloat(payments[1].amount)) < 1.0;
                
                if (hasCommonId || amountsClose) {
                    duplicates.push({
                        groupKey,
                        payments,
                        count: payments.length,
                        hasCommonId,
                        amountsClose
                    });
                }
            }
        }
        
        console.log(`🔍 [CLEANUP] Found ${duplicates.length} groups with duplicate payments`);
        
        let deletedCount = 0;
        let keptCount = 0;
        const deletedIds = [];
        const keptIds = [];
        
        for (const duplicate of duplicates) {
            const { payments } = duplicate;
            
            // Sort by: 1) Correct amount (3.49 for monthly), 2) Has payment_id (pay_XXX), 3) Has correct invoice URL, 4) Most recent
            payments.sort((a, b) => {
                // Prefer correct amount (3.49 for monthly, 8.90 for quarterly)
                const aAmount = parseFloat(a.amount);
                const bAmount = parseFloat(b.amount);
                const correctAmounts = [3.49, 8.90];
                const aIsCorrectAmount = correctAmounts.includes(aAmount);
                const bIsCorrectAmount = correctAmounts.includes(bAmount);
                if (aIsCorrectAmount && !bIsCorrectAmount) return -1;
                if (!aIsCorrectAmount && bIsCorrectAmount) return 1;
                
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
                
                // Prefer higher amount (in case of tax adjustments, keep the full amount)
                if (aAmount !== bAmount) {
                    return bAmount - aAmount;
                }
                
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

