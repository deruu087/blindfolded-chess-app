# Sync Existing Subscription

## Quick Sync

1. **Create `.env.local` file** (if you don't have it):
   ```
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
   ```

2. **Install dependencies** (if needed):
   ```bash
   npm install @supabase/supabase-js dotenv
   ```

3. **Run the sync script:**
   ```bash
   node sync-existing-subscription.js your-email@example.com 3.52 monthly 2024-01-15
   ```

**Parameters:**
- `your-email@example.com` - Your user email (required)
- `3.52` - Payment amount (optional, defaults to 3.52)
- `monthly` - Plan type: `monthly` or `quarterly` (optional, defaults to monthly)
- `2024-01-15` - Payment date in YYYY-MM-DD format (optional, defaults to today)

**Examples:**
```bash
# Monthly subscription, €3.52, paid today
node sync-existing-subscription.js user@example.com

# Quarterly subscription, €8.90, paid on Jan 15, 2024
node sync-existing-subscription.js user@example.com 8.90 quarterly 2024-01-15

# Monthly subscription, €3.52, paid on Dec 1, 2024
node sync-existing-subscription.js user@example.com 3.52 monthly 2024-12-01
```

## Verify

After running, check Supabase:
1. Go to Table Editor → `subscriptions` - should see your subscription
2. Go to Table Editor → `payments` - should see your payment record

## Future Payments

After syncing, all new payments will be automatically synced via the webhook!

