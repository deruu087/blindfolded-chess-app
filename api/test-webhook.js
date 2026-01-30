// Simple test endpoint to verify webhook is accessible
// Usage: GET https://your-domain.com/api/test-webhook

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    if (req.method === 'GET') {
        return res.status(200).json({
            success: true,
            message: 'Webhook endpoint is accessible',
            timestamp: new Date().toISOString(),
            method: req.method,
            url: req.url
        });
    }
    
    // Also accept POST for testing
    if (req.method === 'POST') {
        return res.status(200).json({
            success: true,
            message: 'Webhook endpoint received POST request',
            timestamp: new Date().toISOString(),
            body: req.body,
            headers: Object.keys(req.headers)
        });
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
}

