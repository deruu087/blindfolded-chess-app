# Debugging: No Records in Supabase

If you're not seeing records in the `subscriptions` and `payments` tables, follow these steps:

## Step 1: Test Webhook Endpoint is Accessible

1. **Test the webhook endpoint:**
   ```
   https://your-domain.com/api/test-webhook
   ```
   - Should return: `{"success": true, "message": "Webhook endpoint is accessible"}`

2. **If this fails:**
   - Check Vercel deployment is live
   - Check the endpoint URL is correct

## Step 2: Check Vercel Logs

1. Go to **Vercel Dashboard** → Your Project → **Functions** → `/api/dodo-webhook`
2. Click on **Logs** tab
3. Look for:
   - `📥 [WEBHOOK] Dodo Payments webhook received` - means webhook was called
   - `✅ Subscription created/updated` - means subscription was created
   - `✅ Payment record created` - means payment was created
   - Any `❌` errors

## Step 3: Check if Webhook is Configured in Dodo Payments

1. Log into **Dodo Payments Dashboard**
2. Go to **Webhooks/Settings**
3. Verify:
   - Webhook URL is set to: `https://your-domain.com/api/dodo-webhook`
   - Webhook is **enabled**
   - Events subscribed: `payment.completed`, `payment.succeeded`, `order.completed`

## Step 4: Check Payment Success Page

1. After making a payment, check browser console (F12)
2. Look for logs starting with:
   - `💰 [PAYMENT SUCCESS]` - page loaded
   - `🔄 Attempting to sync subscription via API` - trying to sync
   - `✅ Subscription synced successfully` - sync worked

## Step 5: Check Supabase Tables Directly

1. Go to **Supabase Dashboard** → **Table Editor**
2. Check `subscriptions` table:
   - Should have records with `user_id`, `plan_type`, `amount_paid`, `status`
3. Check `payments` table:
   - Should have records with `user_id`, `amount`, `currency`, `status`

## Step 6: Common Issues

### Issue: Webhook not being called
**Symptoms:**
- No logs in Vercel for `/api/dodo-webhook`
- Test endpoint works but no webhook logs

**Solutions:**
- Verify webhook URL in Dodo Payments dashboard
- Check webhook is enabled
- Make a test payment and check if webhook fires

### Issue: Webhook called but fails early
**Symptoms:**
- See `📥 [WEBHOOK] Dodo Payments webhook received` in logs
- But see errors like `Missing required field: amount` or `Missing required field: currency`

**Solutions:**
- Check webhook payload format in Vercel logs
- Dodo Payments might be sending data in different format
- The webhook now has better field extraction - check logs for what fields are available

### Issue: User not found
**Symptoms:**
- See `❌ User not found for email: ...` in logs

**Solutions:**
- Ensure user email in payment matches email in Supabase `auth.users` table
- Check Supabase Dashboard → Authentication → Users

### Issue: Database errors
**Symptoms:**
- See `❌ Error creating/updating subscription` or `❌ Error creating payment record`

**Solutions:**
- Check Supabase RLS policies allow service role access
- Verify tables exist: `subscriptions` and `payments`
- Check `SUPABASE_SERVICE_ROLE_KEY` is set correctly in Vercel

### Issue: Payment-success page not syncing
**Symptoms:**
- See `⚠️ Payment amount not found in URL` in browser console

**Solutions:**
- Dodo Payments might not be sending amount in redirect URL
- Webhook should handle this, but check Vercel logs
- Payment-success page now waits 3 seconds and checks again

## Step 7: Manual Test

Test the webhook manually with curl:

```bash
curl -X POST https://your-domain.com/api/dodo-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event": "payment.completed",
    "order_id": "test_order_123",
    "customer": {
      "email": "your-actual-user-email@example.com"
    },
    "amount": 4.99,
    "currency": "EUR",
    "status": "completed",
    "payment_frequency_interval": "Month",
    "payment_frequency_count": 1
  }'
```

**Replace `your-actual-user-email@example.com` with a real email from your Supabase auth.users table.**

## Step 8: Check Environment Variables

In Vercel Dashboard → Settings → Environment Variables, verify:

1. **SUPABASE_URL** - Should be your Supabase project URL
2. **SUPABASE_SERVICE_ROLE_KEY** - Should be the service_role key (NOT anon key)

## What to Look For in Logs

### Successful Webhook:
```
📥 [WEBHOOK] Dodo Payments webhook received
📋 [WEBHOOK] Parsed data: { amount: '4.99', currency: 'EUR', ... }
✅ Found user: [user-id] for email: [email]
📝 [WEBHOOK] Creating subscription record...
✅ Subscription created/updated successfully
📝 [WEBHOOK] Creating payment record...
✅ Payment record created successfully
✅ [WEBHOOK] Success summary:
  - Subscription: ✅ Created
  - Payment: ✅ Created
```

### Failed Webhook:
```
📥 [WEBHOOK] Dodo Payments webhook received
❌ No amount found in webhook data
OR
❌ User not found for email: ...
OR
❌ Error creating/updating subscription: ...
```

## Next Steps

1. **Check Vercel logs first** - this will tell you exactly what's happening
2. **Check if webhook is being called** - look for `📥 [WEBHOOK]` logs
3. **Check what data webhook receives** - look for `📋 [WEBHOOK] Parsed data` logs
4. **Check for errors** - look for any `❌` in logs

If you see webhook logs but no records, share the log output and we can debug further.

