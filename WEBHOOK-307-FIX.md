# Fixing 307 Redirects for Dodo Payments Webhooks

## Problem
Dodo Payments webhooks are getting 307 redirects instead of reaching the endpoint. This happens at the Vercel/domain level, before the function even runs.

## Root Cause
307 redirects typically happen when:
1. **www vs non-www mismatch** - Dodo is using `www.memo-chess.com` but Vercel redirects to `memo-chess.com` (or vice versa)
2. **HTTP vs HTTPS** - Dodo is using HTTP but Vercel redirects to HTTPS
3. **Trailing slash** - URL mismatch with/without trailing slash

## Solution Steps

### Step 1: Check What URL Dodo Payments is Using
1. Go to Dodo Payments Dashboard
2. Navigate to Webhooks/Settings
3. Check the exact webhook URL configured
4. **It should be exactly**: `https://memo-chess.com/api/dodo-webhook`
   - ✅ Use `https://` (not `http://`)
   - ✅ Use `memo-chess.com` (not `www.memo-chess.com`)
   - ✅ No trailing slash: `/api/dodo-webhook` (not `/api/dodo-webhook/`)

### Step 2: Verify Vercel Domain Configuration
1. Go to Vercel Dashboard → Your Project → Settings → Domains
2. Check which domains are configured:
   - `memo-chess.com` (root domain)
   - `www.memo-chess.com` (www subdomain)
3. **Recommended**: Configure both, but use the root domain for webhooks

### Step 3: Test the Endpoint Manually
Test if the endpoint works with curl:

```bash
# Test GET (health check)
curl -v https://memo-chess.com/api/dodo-webhook

# Test POST (actual webhook)
curl -X POST https://memo-chess.com/api/dodo-webhook \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

**Expected responses:**
- GET: `200 OK` with JSON response
- POST: `200 OK` (even if it fails to process, it should return 200)

### Step 4: Check Vercel Logs
1. Go to Vercel Dashboard → Your Project → Functions → `/api/dodo-webhook` → Logs
2. Look for:
   - `🏥 [WEBHOOK] Health check received` (GET requests)
   - `📥 [WEBHOOK] Dodo Payments webhook received` (POST requests)
3. If you only see 307 redirects, the request never reaches the function

### Step 5: Update Dodo Payments Webhook URL
If the URL in Dodo is wrong:
1. **Update to exactly**: `https://memo-chess.com/api/dodo-webhook`
2. **Save the webhook configuration**
3. **Wait 5-10 minutes** for Dodo to retry
4. **Check Vercel logs again** - you should now see POST requests

## Common Issues

### Issue 1: Dodo is using www.memo-chess.com
**Fix**: Update Dodo webhook URL to `https://memo-chess.com/api/dodo-webhook` (without www)

### Issue 2: Dodo is using HTTP instead of HTTPS
**Fix**: Update Dodo webhook URL to use `https://` (not `http://`)

### Issue 3: Trailing slash in URL
**Fix**: Remove trailing slash - use `/api/dodo-webhook` (not `/api/dodo-webhook/`)

### Issue 4: Vercel is redirecting www to non-www
**Fix**: The redirect rule in `vercel.json` should handle this, but make sure Dodo uses the non-www URL

## Verification Checklist

- [ ] Webhook URL in Dodo is exactly: `https://memo-chess.com/api/dodo-webhook`
- [ ] Manual curl test returns 200 OK for both GET and POST
- [ ] Vercel logs show requests reaching the function (not just 307 redirects)
- [ ] Both `memo-chess.com` and `www.memo-chess.com` are configured in Vercel
- [ ] SSL certificate is valid (green padlock in browser)

## Next Steps After Fix

1. **Wait 5-10 minutes** for Dodo to retry the webhook
2. **Make a test payment** to trigger a webhook
3. **Check Vercel logs** - should see POST requests with webhook data
4. **Check Supabase** - should see new records in `subscriptions` and `payments` tables

## Still Not Working?

If you still see 307 redirects after following these steps:
1. Check Vercel domain settings for any custom redirect rules
2. Verify DNS is correctly configured (no CNAME conflicts)
3. Contact Dodo Payments support to verify their webhook URL format
4. Check if Dodo has any webhook URL validation that's causing issues

