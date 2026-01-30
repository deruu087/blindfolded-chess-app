# Local Webhook Testing Guide

## Step 1: Install Dependencies

```bash
npm install @supabase/supabase-js dotenv
```

Or if you prefer yarn:
```bash
yarn add @supabase/supabase-js dotenv
```

## Step 2: Create Environment File

Create a `.env.local` file in the project root:

```bash
SUPABASE_URL=https://yaaxydrmuslgzjletzbw.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

**To get your service role key:**
1. Go to Supabase Dashboard
2. Settings → API
3. Copy the `service_role` key (NOT the anon key!)

## Step 3: Start Local Webhook Server

```bash
node local-webhook-server.js
```

You should see:
```
🚀 Local webhook server running on http://localhost:3002
```

## Step 4: Expose Local Server to Internet

You need to expose your local server so Dodo Payments can reach it. Use **ngrok**:

### Install ngrok:
```bash
# macOS
brew install ngrok

# Or download from https://ngrok.com/download
```

### Run ngrok:
```bash
ngrok http 3002
```

You'll get a public URL like:
```
Forwarding  https://abc123.ngrok.io -> http://localhost:3002
```

## Step 5: Configure Dodo Payments Webhook

1. Log into Dodo Payments Dashboard
2. Go to Webhooks/Settings
3. Add webhook URL: `https://abc123.ngrok.io/api/dodo-webhook`
   - (Use the ngrok URL from step 4)
4. Subscribe to events:
   - `payment.completed`
   - `payment.cancelled`
5. Save

## Step 6: Test the Webhook

### Option A: Test with Real Payment
1. Make a test payment in Dodo Payments
2. Check the terminal running `local-webhook-server.js` for logs
3. Check Supabase tables for new records

### Option B: Test Locally with curl

Update `test-webhook.json` with a real user email from your Supabase:

```json
{
  "event": "payment.completed",
  "order_id": "test_order_123",
  "customer": {
    "email": "your-actual-user@email.com"
  },
  "amount": 3.52,
  "currency": "EUR",
  "status": "completed"
}
```

Then run:
```bash
curl -X POST http://localhost:3002/api/dodo-webhook \
  -H "Content-Type: application/json" \
  -d @test-webhook.json
```

### Option C: Test with Postman
1. POST to `http://localhost:3002/api/dodo-webhook`
2. Body: Raw JSON
3. Use the content from `test-webhook.json`

## Step 7: Verify Results

1. **Check Terminal Logs:**
   - Should see: `✅ Subscription created/updated`
   - Should see: `✅ Payment record created`

2. **Check Supabase:**
   - Go to Table Editor
   - Check `subscriptions` table for new/updated record
   - Check `payments` table for new payment record

## Troubleshooting

### "SUPABASE_SERVICE_ROLE_KEY not set"
- ✅ Make sure `.env.local` exists in project root
- ✅ Check the key is correct (service_role, not anon key)

### "User not found"
- ✅ Make sure the email in test data matches an email in Supabase auth.users
- ✅ Check Supabase Dashboard → Authentication → Users

### "Error creating/updating subscription"
- ✅ Verify tables exist: Run the SQL files in Supabase
- ✅ Check RLS policies allow service role access

### ngrok not working
- ✅ Make sure ngrok is running: `ngrok http 3002`
- ✅ Use the HTTPS URL (not HTTP)
- ✅ Free ngrok URLs change on restart - update Dodo Payments if you restart ngrok

## What to Test

1. ✅ Payment completed → Creates subscription + payment record
2. ✅ Payment cancelled → Updates subscription status
3. ✅ User not found → Logs warning but doesn't fail
4. ✅ Invalid data → Returns error gracefully

## Next Steps

Once local testing works:
1. Deploy to Vercel
2. Update Dodo Payments webhook URL to Vercel URL
3. Test with real payments

