// Vercel serverless function to send emails via Resend
// This is a standalone endpoint - does not depend on other code

import { Resend } from 'resend';

// Check if API key is set
const resendApiKey = process.env.RESEND_API_KEY;
if (!resendApiKey) {
    console.error('❌ RESEND_API_KEY is not set in environment variables!');
}

const resend = resendApiKey ? new Resend(resendApiKey) : null;

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
    
    // Check if Resend is initialized
    if (!resend) {
        console.error('❌ Resend client not initialized - RESEND_API_KEY missing');
        return res.status(500).json({ 
            error: 'Email service not configured', 
            details: 'RESEND_API_KEY environment variable is not set' 
        });
    }
    
    try {
        const { type, to, name, data } = req.body;
        
        if (!type || !to) {
            return res.status(400).json({ error: 'Missing required fields: type and to' });
        }
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(to)) {
            return res.status(400).json({ error: 'Invalid email address' });
        }
        
        let emailContent;
        
        switch (type) {
            case 'welcome':
                emailContent = getWelcomeEmail(name || 'Chess Player');
                break;
            case 'subscription_confirmed':
                emailContent = getSubscriptionConfirmedEmail(name || 'Chess Player', data);
                break;
            case 'subscription_cancelled':
                emailContent = getSubscriptionCancelledEmail(name || 'Chess Player');
                break;
            default:
                return res.status(400).json({ error: 'Invalid email type' });
        }
        
        const { data: emailData, error } = await resend.emails.send({
            from: 'Memo Chess <hello@memo-chess.com>',
            to: [to],
            subject: emailContent.subject,
            html: emailContent.html,
        });
        
        if (error) {
            console.error('❌ Resend API error:', error);
            return res.status(500).json({ error: 'Failed to send email', details: error });
        }
        
        console.log('✅ Email sent successfully:', emailData);
        return res.status(200).json({ success: true, messageId: emailData?.id });
        
    } catch (error) {
        console.error('❌ Exception in send-email handler:', error);
        return res.status(500).json({ 
            error: 'Internal server error', 
            details: error.message
        });
    }
}

// Email Templates

function getWelcomeEmail(name) {
    return {
        subject: 'Welcome to Memo Chess! 🎉',
        html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to Memo Chess</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #2563eb; margin-bottom: 10px;">🎯 Welcome to Memo Chess!</h1>
    </div>
    
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <p style="font-size: 18px; margin-bottom: 15px;">Hi ${name},</p>
        <p>Welcome to Memo Chess! We're excited to have you join our community of blindfold chess players.</p>
    </div>
    
    <div style="margin-bottom: 30px;">
        <h2 style="color: #2563eb; font-size: 20px; margin-bottom: 15px;">What's Next?</h2>
        <ul style="list-style: none; padding: 0;">
            <li style="margin-bottom: 15px; padding-left: 25px; position: relative;">
                <span style="position: absolute; left: 0;">♟️</span>
                <strong>Explore Games:</strong> Practice with famous chess games and learn from grandmaster strategies
            </li>
            <li style="margin-bottom: 15px; padding-left: 25px; position: relative;">
                <span style="position: absolute; left: 0;">🧩</span>
                <strong>Solve Puzzles:</strong> Sharpen your tactical skills with challenging chess puzzles
            </li>
            <li style="margin-bottom: 15px; padding-left: 25px; position: relative;">
                <span style="position: absolute; left: 0;">✏️</span>
                <strong>Create Custom Games:</strong> Build your own games and share them with the community
            </li>
            <li style="margin-bottom: 15px; padding-left: 25px; position: relative;">
                <span style="position: absolute; left: 0;">📊</span>
                <strong>Track Progress:</strong> Monitor your improvement with detailed statistics
            </li>
        </ul>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
        <a href="https://memo-chess.com/games.html" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Start Playing Now</a>
    </div>
    
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280;">
        <p>Happy training!</p>
        <p>The Memo Chess Team</p>
        <p style="margin-top: 20px;">
            <a href="https://memo-chess.com" style="color: #2563eb;">Visit Memo Chess</a> | 
            <a href="https://memo-chess.com/profile.html" style="color: #2563eb;">Your Profile</a>
        </p>
    </div>
</body>
</html>
        `
    };
}

function getSubscriptionConfirmedEmail(name, data) {
    const planName = data?.planName || 'Premium';
    const amount = data?.amount || 'N/A';
    const currency = data?.currency || 'EUR';
    
    return {
        subject: 'Subscription Confirmed - Memo Chess 🎉',
        html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Subscription Confirmed</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #10b981; margin-bottom: 10px;">✅ Subscription Confirmed!</h1>
    </div>
    
    <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #10b981;">
        <p style="font-size: 18px; margin-bottom: 15px;">Hi ${name},</p>
        <p>Thank you for subscribing to Memo Chess Premium! Your subscription has been successfully activated.</p>
    </div>
    
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="color: #2563eb; font-size: 20px; margin-bottom: 15px;">Subscription Details</h2>
        <table style="width: 100%; border-collapse: collapse;">
            <tr>
                <td style="padding: 8px 0; font-weight: bold;">Plan:</td>
                <td style="padding: 8px 0;">${planName}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0; font-weight: bold;">Amount:</td>
                <td style="padding: 8px 0;">${amount} ${currency}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0; font-weight: bold;">Status:</td>
                <td style="padding: 8px 0; color: #10b981;">Active</td>
            </tr>
        </table>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
        <a href="https://memo-chess.com/games.html" style="display: inline-block; background-color: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Start Training</a>
    </div>
    
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280;">
        <p>You can manage your subscription anytime from your <a href="https://memo-chess.com/profile.html" style="color: #2563eb;">profile page</a>.</p>
        <p style="margin-top: 20px;">The Memo Chess Team</p>
    </div>
</body>
</html>
        `
    };
}

function getSubscriptionCancelledEmail(name) {
    return {
        subject: 'Subscription Cancelled - Memo Chess',
        html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Subscription Cancelled</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #6b7280; margin-bottom: 10px;">Subscription Cancelled</h1>
    </div>
    
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <p style="font-size: 18px; margin-bottom: 15px;">Hi ${name},</p>
        <p>Your Memo Chess subscription has been cancelled. We're sorry to see you go!</p>
        <p>You'll continue to have access to premium features until the end of your current billing period.</p>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
        <a href="https://memo-chess.com/subscription.html" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Resubscribe</a>
    </div>
    
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280;">
        <p>If you have any questions or feedback, please don't hesitate to reach out.</p>
        <p style="margin-top: 20px;">The Memo Chess Team</p>
    </div>
</body>
</html>
        `
    };
}

