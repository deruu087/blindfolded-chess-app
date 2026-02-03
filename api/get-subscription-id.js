// Vercel serverless function to get subscription ID from Dodo Payments
// Uses payment/order ID to fetch the actual subscription ID from Dodo Payments API

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
        const { paymentId, orderId } = req.body;
        
        if (!paymentId && !orderId) {
            return res.status(400).json({ error: 'Missing paymentId or orderId' });
        }
        
        const dodoApiKey = process.env.DODO_PAYMENTS_API_KEY?.trim();
        if (!dodoApiKey) {
            console.error('❌ DODO_PAYMENTS_API_KEY not configured');
            return res.status(500).json({ error: 'DODO_PAYMENTS_API_KEY not configured' });
        }
        
        // Determine test vs live based on API key
        const apiBaseUrl = dodoApiKey.startsWith('sk_test_') 
            ? 'https://test.dodopayments.com'
            : 'https://live.dodopayments.com';
        
        console.log('🔍 [GET-SUBSCRIPTION-ID] Fetching subscription ID from Dodo Payments');
        console.log('🔍 [GET-SUBSCRIPTION-ID] API Base URL:', apiBaseUrl);
        console.log('🔍 [GET-SUBSCRIPTION-ID] Payment ID:', paymentId);
        console.log('🔍 [GET-SUBSCRIPTION-ID] Order ID:', orderId);
        
        const idToUse = paymentId || orderId;
        
        // Try payments endpoint first
        let subscriptionId = null;
        try {
            const paymentUrl = `${apiBaseUrl}/payments/${idToUse}`;
            console.log('🔍 [GET-SUBSCRIPTION-ID] Trying payments endpoint:', paymentUrl);
            
            const paymentResponse = await fetch(paymentUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${dodoApiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            
            console.log('🔍 [GET-SUBSCRIPTION-ID] Payment response status:', paymentResponse.status);
            
            if (paymentResponse.ok) {
                const paymentData = await paymentResponse.json();
                console.log('🔍 [GET-SUBSCRIPTION-ID] Payment data:', JSON.stringify(paymentData, null, 2));
                subscriptionId = paymentData.subscription_id || paymentData.subscription?.id || paymentData.subscription_id;
                
                if (subscriptionId) {
                    console.log('✅ [GET-SUBSCRIPTION-ID] Found subscription ID from payments:', subscriptionId);
                    return res.status(200).json({ 
                        success: true, 
                        subscriptionId 
                    });
                }
            } else {
                const errorText = await paymentResponse.text();
                console.log('⚠️ [GET-SUBSCRIPTION-ID] Payment endpoint failed:', paymentResponse.status, errorText);
            }
        } catch (error) {
            console.log('⚠️ [GET-SUBSCRIPTION-ID] Payment endpoint error:', error.message);
        }
        
        // Try orders endpoint
        try {
            const orderUrl = `${apiBaseUrl}/orders/${idToUse}`;
            console.log('🔍 [GET-SUBSCRIPTION-ID] Trying orders endpoint:', orderUrl);
            
            const orderResponse = await fetch(orderUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${dodoApiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            
            console.log('🔍 [GET-SUBSCRIPTION-ID] Order response status:', orderResponse.status);
            
            if (orderResponse.ok) {
                const orderData = await orderResponse.json();
                console.log('🔍 [GET-SUBSCRIPTION-ID] Order data:', JSON.stringify(orderData, null, 2));
                subscriptionId = orderData.subscription_id || orderData.subscription?.id || orderData.subscription_id;
                
                if (subscriptionId) {
                    console.log('✅ [GET-SUBSCRIPTION-ID] Found subscription ID from orders:', subscriptionId);
                    return res.status(200).json({ 
                        success: true, 
                        subscriptionId 
                    });
                }
            } else {
                const errorText = await orderResponse.text();
                console.log('⚠️ [GET-SUBSCRIPTION-ID] Order endpoint failed:', orderResponse.status, errorText);
            }
        } catch (error) {
            console.log('⚠️ [GET-SUBSCRIPTION-ID] Order endpoint error:', error.message);
        }
        
        // Try subscriptions endpoint directly (in case the ID is already a subscription ID)
        try {
            const subscriptionUrl = `${apiBaseUrl}/subscriptions/${idToUse}`;
            console.log('🔍 [GET-SUBSCRIPTION-ID] Trying subscriptions endpoint:', subscriptionUrl);
            
            const subscriptionResponse = await fetch(subscriptionUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${dodoApiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            
            console.log('🔍 [GET-SUBSCRIPTION-ID] Subscription response status:', subscriptionResponse.status);
            
            if (subscriptionResponse.ok) {
                const subscriptionData = await subscriptionResponse.json();
                console.log('🔍 [GET-SUBSCRIPTION-ID] Subscription data:', JSON.stringify(subscriptionData, null, 2));
                subscriptionId = subscriptionData.id || subscriptionData.subscription_id;
                
                if (subscriptionId) {
                    console.log('✅ [GET-SUBSCRIPTION-ID] ID is already a subscription ID:', subscriptionId);
                    return res.status(200).json({ 
                        success: true, 
                        subscriptionId 
                    });
                }
            }
        } catch (error) {
            console.log('⚠️ [GET-SUBSCRIPTION-ID] Subscription endpoint error:', error.message);
        }
        
        console.error('❌ [GET-SUBSCRIPTION-ID] Could not find subscription ID from any endpoint');
        return res.status(404).json({ 
            success: false,
            error: 'Subscription ID not found',
            message: 'Could not find subscription ID from payment/order ID. The webhook should handle this automatically.'
        });
        
    } catch (error) {
        console.error('❌ [GET-SUBSCRIPTION-ID] Error getting subscription ID:', error);
        return res.status(500).json({ 
            success: false,
            error: 'Internal server error',
            message: error.message 
        });
    }
}

