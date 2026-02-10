// API endpoint to update existing payment records with invoice URLs from Dodo Payments
// This can be called manually to update old payment records

import { createClient } from '@supabase/supabase-js';

/**
 * Helper function to get invoice URL from Dodo Payments API
 */
async function getInvoiceUrlFromDodo(paymentId, orderId, subscriptionId) {
    const dodoApiKey = process.env.DODO_PAYMENTS_API_KEY?.trim();
    if (!dodoApiKey) {
        console.warn('⚠️ [INVOICE] DODO_PAYMENTS_API_KEY not configured');
        return null;
    }
    
    const apiBaseUrl = dodoApiKey.startsWith('sk_test_') 
        ? 'https://test.dodopayments.com'
        : 'https://live.dodopayments.com';
    
    const idsToTry = [paymentId, orderId, subscriptionId].filter(Boolean);
    
    for (const id of idsToTry) {
        // Try payments endpoint
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
                console.log('📄 [INVOICE] Payment data:', JSON.stringify(paymentData, null, 2));
                
                const invoiceUrl = paymentData.invoice_url || 
                                   paymentData.invoice?.url ||
                                   paymentData.invoice_link ||
                                   paymentData.receipt_url ||
                                   paymentData.receipt?.url ||
                                   paymentData.payment_url ||
                                   paymentData.download_url ||
                                   paymentData.url ||
                                   paymentData.invoice_pdf_url ||
                                   paymentData.receipt_pdf_url ||
                                   paymentData.checkout_url;
                
                if (invoiceUrl) {
                    console.log('✅ [INVOICE] Found invoice URL:', invoiceUrl);
                    return invoiceUrl;
                }
            }
        } catch (error) {
            console.warn('⚠️ [INVOICE] Error fetching from payments:', error.message);
        }
        
        // Try orders endpoint
        try {
            const orderUrl = `${apiBaseUrl}/orders/${id}`;
            const response = await fetch(orderUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${dodoApiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const orderData = await response.json();
                const invoiceUrl = orderData.invoice_url || 
                                   orderData.invoice?.url ||
                                   orderData.invoice_link ||
                                   orderData.receipt_url ||
                                   orderData.receipt?.url ||
                                   orderData.payment_url ||
                                   orderData.download_url ||
                                   orderData.url ||
                                   orderData.invoice_pdf_url ||
                                   orderData.receipt_pdf_url ||
                                   orderData.checkout_url;
                
                if (invoiceUrl) {
                    console.log('✅ [INVOICE] Found invoice URL from orders:', invoiceUrl);
                    return invoiceUrl;
                }
            }
        } catch (error) {
            console.warn('⚠️ [INVOICE] Error fetching from orders:', error.message);
        }
    }
    
    // Construct invoice URL using Dodo Payments pattern: /invoices/payments/{payment_id}
    // IMPORTANT: Must use payment_id (pay_XXX), NOT subscription_id (sub_XXX)
    // Format: https://test.dodopayments.com/invoices/payments/pay_XXX
    // or: https://live.dodopayments.com/invoices/payments/pay_XXX
    
    // Find the first ID that looks like a payment ID (pay_XXX)
    let paymentId = null;
    for (const id of idsToTry) {
        if (id && id.startsWith('pay_')) {
            paymentId = id;
            break;
        }
    }
    
    // Only construct URL if we have a valid payment_id
    if (paymentId) {
        const constructedUrl = `${apiBaseUrl}/invoices/payments/${paymentId}`;
        console.log('🔧 [INVOICE] Constructing invoice URL using payment_id:', constructedUrl);
        return constructedUrl;
    } else {
        console.warn('⚠️ [INVOICE] No payment_id (pay_XXX) found in IDs. Cannot construct invoice URL.');
        console.warn('⚠️ [INVOICE] IDs tried:', idsToTry);
        console.warn('⚠️ [INVOICE] Invoice URL must use payment_id, not subscription_id or order_id');
    }
    
    return null;
}

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
        
        // Get all payments with the default invoice URL that have a payment_id
        // IMPORTANT: Only update payments that have payment_id (pay_XXX), not subscription_id (sub_XXX)
        const { data: payments, error: paymentsError } = await supabase
            .from('payments')
            .select('*')
            .eq('invoice_url', 'https://checkout.dodopayments.com/account')
            .not('payment_id', 'is', null)
            .like('payment_id', 'pay_%'); // Only payments with payment_id starting with pay_
        
        if (paymentsError) {
            console.error('❌ Error fetching payments:', paymentsError);
            return res.status(500).json({ error: 'Failed to fetch payments', details: paymentsError.message });
        }
        
        if (!payments || payments.length === 0) {
            return res.status(200).json({ 
                success: true, 
                message: 'No payments found with default invoice URL',
                updated: 0
            });
        }
        
        console.log(`📋 Found ${payments.length} payments to update`);
        
        let updated = 0;
        let failed = 0;
        
        // Update each payment
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
                    console.log(`⚠️ Could not find invoice URL for payment ${payment.id}`);
                    failed++;
                }
            } catch (error) {
                console.error(`❌ Error processing payment ${payment.id}:`, error);
                failed++;
            }
        }
        
        return res.status(200).json({
            success: true,
            message: `Updated ${updated} payments, ${failed} failed`,
            updated,
            failed,
            total: payments.length
        });
        
    } catch (error) {
        console.error('❌ Error in update-invoice-urls:', error);
        return res.status(500).json({ 
            error: 'Internal server error', 
            details: error.message 
        });
    }
}

