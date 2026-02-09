# Fix Vercel Domain Redirect for Webhooks

## Problem
Vercel is automatically redirecting `memo-chess.com` → `www.memo-chess.com`, causing 307 redirects. Dodo Payments doesn't follow redirects, so webhooks fail.

## Solution: Configure Vercel Domain Settings

You need to configure Vercel to make `memo-chess.com` the primary domain (not redirecting to www).

### Steps:

1. **Go to Vercel Dashboard**
   - Navigate to your project
   - Go to **Settings** → **Domains**

2. **Check Domain Configuration**
   - You should see both:
     - `memo-chess.com` (root domain)
     - `www.memo-chess.com` (www subdomain)

3. **Set Primary Domain**
   - Look for a "Primary Domain" or "Default Domain" setting
   - Set `memo-chess.com` as the primary domain
   - This should prevent redirects from non-www to www

4. **Alternative: Remove www Redirect**
   - If there's a redirect rule, remove it
   - Or configure it to redirect www → non-www (opposite direction)

5. **Save Changes**

6. **Wait 5-10 minutes** for changes to propagate

7. **Test the Endpoint**
   ```bash
   curl -v https://memo-chess.com/api/dodo-webhook
   ```
   - Should return `200 OK` directly (no redirect)
   - Response should show `"host":"memo-chess.com"` (not www)

8. **Update Dodo Payments** (if needed)
   - Keep webhook URL as: `https://memo-chess.com/api/dodo-webhook`
   - Wait for Dodo to retry (5-10 minutes)

## If Vercel Doesn't Allow This Configuration

If you can't prevent the redirect in Vercel settings, you have two options:

### Option 1: Use www in Dodo Payments
Update Dodo Payments webhook URL to:
```
https://www.memo-chess.com/api/dodo-webhook
```

### Option 2: Contact Vercel Support
Ask Vercel support to configure your domain to not redirect www to non-www (or vice versa) for API routes.

## Verification

After making changes:
1. Test with curl: `curl -v https://memo-chess.com/api/dodo-webhook`
2. Should see `200 OK` (not `307 Temporary Redirect`)
3. Check Vercel logs - should see POST requests from Dodo
4. Make a test payment - webhook should fire successfully

