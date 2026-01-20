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
        console.log('📧 [EMAIL API] Request received:', {
            method: req.method,
            body: req.body,
            hasApiKey: !!resendApiKey
        });
        
        const { type, to, name, data } = req.body;
        
        if (!type || !to) {
            console.error('❌ [EMAIL API] Missing required fields:', { type, to });
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
        
        console.log('📧 [EMAIL API] Attempting to send email via Resend...');
        const { data: emailData, error } = await resend.emails.send({
            from: 'Memo Chess <hello@memo-chess.com>',
            to: [to],
            subject: emailContent.subject,
            html: emailContent.html,
        });
        
        if (error) {
            console.error('❌ [EMAIL API] Resend API error:', error);
            console.error('❌ [EMAIL API] Error details:', JSON.stringify(error, null, 2));
            return res.status(500).json({ error: 'Failed to send email', details: error });
        }
        
        console.log('✅ [EMAIL API] Email sent successfully:', emailData);
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
        subject: 'Welcome to Memo Chess',
        html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to Memo Chess</title>
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; line-height: 1.6; color: #2c3e50;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border: 1px solid #e0e0e0; max-width: 600px;">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 30px 40px; text-align: center; border-bottom: 1px solid #e5e7eb;">
                            <h1 style="font-size: 2rem; font-weight: 400; color: #1e3a8a; margin: 0; padding: 0;">Welcome to Memo Chess</h1>
                        </td>
                    </tr>
                    
                    <!-- Main Content -->
                    <tr>
                        <td style="padding: 30px 40px;">
                            <p style="font-size: 18px; color: #2c3e50; margin-bottom: 20px;">Hi ${name},</p>
                            <p style="font-size: 16px; color: #4b5563; margin-bottom: 30px; line-height: 1.7;">Welcome to Memo Chess! We're excited to have you join our community of blindfold chess players.</p>
                            
                            <div style="background-color: #f5f5f5; padding: 25px; border-radius: 8px; margin-bottom: 30px; border: 1px solid #e5e7eb;">
                                <h2 style="font-size: 1.25rem; font-weight: 400; color: #1e3a8a; margin-bottom: 20px; margin-top: 0;">What's Next?</h2>
                                <table width="100%" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td style="padding-bottom: 15px;">
                                            <p style="margin: 0; font-size: 16px; color: #2c3e50;">
                                                <strong style="color: #1e3a8a;">Explore Games:</strong> Practice with famous chess games and learn from grandmaster strategies
                                            </p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding-bottom: 15px;">
                                            <p style="margin: 0; font-size: 16px; color: #2c3e50;">
                                                <strong style="color: #1e3a8a;">Solve Puzzles:</strong> Sharpen your tactical skills with challenging chess puzzles
                                            </p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding-bottom: 15px;">
                                            <p style="margin: 0; font-size: 16px; color: #2c3e50;">
                                                <strong style="color: #1e3a8a;">Create Custom Games:</strong> Build your own games and share them with the community
                                            </p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="margin: 0; font-size: 16px; color: #2c3e50;">
                                                <strong style="color: #1e3a8a;">Track Progress:</strong> Monitor your improvement with detailed statistics
                                            </p>
                                        </td>
                                    </tr>
                                </table>
                            </div>
                            
                            <!-- CTA Button -->
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td align="center" style="padding: 20px 0;">
                                        <a href="https://memo-chess.com/games.html" style="display: inline-block; background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Start Playing Now</a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 30px 40px; border-top: 1px solid #e5e7eb; background-color: #f5f5f5; border-radius: 0 0 12px 12px;">
                            <p style="font-size: 14px; color: #4b5563; margin: 0 0 10px 0;">Happy training!</p>
                            <p style="font-size: 14px; color: #4b5563; margin: 0 0 20px 0;">The Memo Chess Team</p>
                            <p style="font-size: 14px; color: #4b5563; margin: 0;">
                                <a href="https://memo-chess.com" style="color: #1e3a8a; text-decoration: none;">Visit Memo Chess</a> | 
                                <a href="https://memo-chess.com/profile.html" style="color: #1e3a8a; text-decoration: none;">Your Profile</a>
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
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
        subject: 'Subscription Confirmed - Memo Chess',
        html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Subscription Confirmed</title>
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; line-height: 1.6; color: #2c3e50;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border: 1px solid #e0e0e0; max-width: 600px;">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 30px 40px; text-align: center; border-bottom: 1px solid #e5e7eb;">
                            <h1 style="font-size: 2rem; font-weight: 400; color: #1e3a8a; margin: 0; padding: 0;">Subscription Confirmed</h1>
                        </td>
                    </tr>
                    
                    <!-- Main Content -->
                    <tr>
                        <td style="padding: 30px 40px;">
                            <p style="font-size: 18px; color: #2c3e50; margin-bottom: 20px;">Hi ${name},</p>
                            <p style="font-size: 16px; color: #4b5563; margin-bottom: 30px; line-height: 1.7;">Thank you for subscribing to Memo Chess Premium! Your subscription has been successfully activated.</p>
                            
                            <div style="background-color: #f5f5f5; padding: 25px; border-radius: 8px; margin-bottom: 30px; border: 1px solid #e5e7eb;">
                                <h2 style="font-size: 1.25rem; font-weight: 400; color: #1e3a8a; margin-bottom: 20px; margin-top: 0;">Subscription Details</h2>
                                <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
                                    <tr>
                                        <td style="padding: 8px 0; font-weight: 500; color: #2c3e50; font-size: 16px;">Plan:</td>
                                        <td style="padding: 8px 0; color: #4b5563; font-size: 16px;">${planName}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; font-weight: 500; color: #2c3e50; font-size: 16px;">Amount:</td>
                                        <td style="padding: 8px 0; color: #4b5563; font-size: 16px;">${amount} ${currency}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; font-weight: 500; color: #2c3e50; font-size: 16px;">Status:</td>
                                        <td style="padding: 8px 0; color: #1e3a8a; font-size: 16px; font-weight: 500;">Active</td>
                                    </tr>
                                </table>
                            </div>
                            
                            <!-- CTA Button -->
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td align="center" style="padding: 20px 0;">
                                        <a href="https://memo-chess.com/games.html" style="display: inline-block; background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Start Training</a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 30px 40px; border-top: 1px solid #e5e7eb; background-color: #f5f5f5; border-radius: 0 0 12px 12px;">
                            <p style="font-size: 14px; color: #4b5563; margin: 0 0 20px 0;">You can manage your subscription anytime from your <a href="https://memo-chess.com/profile.html" style="color: #1e3a8a; text-decoration: none;">profile page</a>.</p>
                            <p style="font-size: 14px; color: #4b5563; margin: 0;">The Memo Chess Team</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
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
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; line-height: 1.6; color: #2c3e50;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border: 1px solid #e0e0e0; max-width: 600px;">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 30px 40px; text-align: center; border-bottom: 1px solid #e5e7eb;">
                            <h1 style="font-size: 2rem; font-weight: 400; color: #1e3a8a; margin: 0; padding: 0;">Subscription Cancelled</h1>
                        </td>
                    </tr>
                    
                    <!-- Main Content -->
                    <tr>
                        <td style="padding: 30px 40px;">
                            <p style="font-size: 18px; color: #2c3e50; margin-bottom: 20px;">Hi ${name},</p>
                            <p style="font-size: 16px; color: #4b5563; margin-bottom: 15px; line-height: 1.7;">Your Memo Chess subscription has been cancelled. We're sorry to see you go!</p>
                            <p style="font-size: 16px; color: #4b5563; margin-bottom: 30px; line-height: 1.7;">You'll continue to have access to premium features until the end of your current billing period.</p>
                            
                            <!-- CTA Button -->
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td align="center" style="padding: 20px 0;">
                                        <a href="https://memo-chess.com/subscription.html" style="display: inline-block; background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Resubscribe</a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 30px 40px; border-top: 1px solid #e5e7eb; background-color: #f5f5f5; border-radius: 0 0 12px 12px;">
                            <p style="font-size: 14px; color: #4b5563; margin: 0 0 20px 0;">If you have any questions or feedback, please don't hesitate to reach out.</p>
                            <p style="font-size: 14px; color: #4b5563; margin: 0;">The Memo Chess Team</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
        `
    };
}

