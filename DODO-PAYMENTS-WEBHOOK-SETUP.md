# Dodo Payments Webhook Setup Guide

## Step 1: Deploy to Vercel

Your webhook endpoint is already set up at `/api/dodo-webhook.js`. Make sure it's deployed to Vercel.

1. **Deploy your project to Vercel** (if not already deployed):
   ```bash
   vercel deploy
   ```

2. **Your webhook URL will be:**
   ```
   https://your-project.vercel.app/api/dodo-webhook
   ```

## Step 2: Set Environment Variables in Vercel

Go to your Vercel project dashboard → Settings → Environment Variables and add:

1. **SUPABASE_URL**
   - Value: `https://yaaxydrmuslgzjletzbw.supabase.co`

2. **SUPABASE_SERVICE_ROLE_KEY**
   - Get this from: Supabase Dashboard → Settings → API → `service_role` key (NOT the anon key!)
   - ⚠️ Keep this secret - it has admin access

3. **DODO_WEBHOOK_SECRET** (optional, if Dodo Payments provides webhook signing)
   - Get this from Dodo Payments dashboard when setting up webhooks

## Step 3: Configure Webhook in Dodo Payments Dashboard

1. **Log into Dodo Payments Dashboard**
2. **Navigate to Webhooks/Settings** (exact location depends on Dodo Payments interface)
3. **Add a new webhook endpoint:**
   - **URL**: `https://your-project.vercel.app/api/dodo-webhook`
   - **Events to subscribe to:**
     - `payment.completed` or `payment.success`
     - `payment.cancelled` or `subscription.cancelled`
     - `order.completed`
   - **HTTP Method**: POST
   - **Content Type**: application/json

4. **Save the webhook configuration**

## Step 4: Test the Webhook

### Option A: Test with Dodo Payments Test Mode
1. Make a test payment in Dodo Payments
2. Check Vercel logs: Vercel Dashboard → Your Project → Functions → `/api/dodo-webhook` → Logs
3. Check Supabase: Verify that records appear in `subscriptions` and `payments` tables

### Option B: Manual Webhook Test (using curl or Postman)
```bash
curl -X POST https://your-project.vercel.app/api/dodo-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event": "payment.completed",
    "order_id": "test_order_123",
    "customer": {
      "email": "test@example.com"
    },
    "amount": 3.52,
    "currency": "EUR",
    "status": "completed"
  }'
```

**Note**: Replace `test@example.com` with an email that exists in your Supabase auth.users table.

## Step 5: Verify Webhook is Working

1. **Check Vercel Function Logs:**
   - Go to Vercel Dashboard → Your Project → Functions
   - Click on `/api/dodo-webhook`
   - View logs for webhook requests

2. **Check Supabase Tables:**
   - Go to Supabase Dashboard → Table Editor
   - Check `subscriptions` table for new/updated records
   - Check `payments` table for payment history

3. **Expected Behavior:**
   - When a payment is completed → Creates/updates subscription + inserts payment record
   - When a subscription is cancelled → Updates subscription status to 'cancelled'

## Troubleshooting

### Webhook not receiving requests:
- ✅ Verify webhook URL is correct in Dodo Payments dashboard
- ✅ Check Vercel deployment is live
- ✅ Verify webhook is enabled in Dodo Payments

### User not found errors:
- ✅ Ensure user email in payment matches email in Supabase auth.users
- ✅ Check webhook logs for the email being sent

### Database errors:
- ✅ Verify SUPABASE_SERVICE_ROLE_KEY is set correctly in Vercel
- ✅ Check Supabase RLS policies allow service role access
- ✅ Verify tables exist: `subscriptions` and `payments`

### Webhook signature verification:
- Currently disabled (TODO in code)
- If Dodo Payments provides webhook signing, add verification:
  ```javascript
  // Add after line 26 in dodo-webhook.js
  const signature = req.headers['x-dodo-signature'];
  const webhookSecret = process.env.DODO_WEBHOOK_SECRET;
  // Verify signature using Dodo Payments' method
  ```

## Current Webhook Flow

1. **Payment Completed** → 
   - Finds user by email
   - Creates/updates `subscriptions` table
   - Inserts record into `payments` table
   - Returns success

2. **Payment Cancelled** →
   - Finds user by email
   - Updates subscription status to 'cancelled'
   - Returns success

3. **User Not Found** →
   - Logs warning
   - Returns success (to prevent retries)
   - User will be matched when they visit payment-success.html

## Next Steps

- [ ] Deploy to Vercel
- [ ] Set environment variables
- [ ] Configure webhook in Dodo Payments dashboard
- [ ] Test with a real payment
- [ ] Monitor logs for any errors
- [ ] Add webhook signature verification (if Dodo Payments supports it)

