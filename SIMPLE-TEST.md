# Simple Webhook Test (No ngrok needed!)

## Option 1: Test Database Logic Directly (Easiest)

Just test if the database updates work:

1. **Create `.env.local` file:**
   ```
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

2. **Run the test:**
   ```bash
   npm install @supabase/supabase-js dotenv
   node simple-webhook-test.js your-email@example.com
   ```

3. **Check Supabase** - Look at `subscriptions` and `payments` tables

That's it! This tests if your database logic works without needing webhooks.

## Option 2: Just Deploy to Vercel (Even Easier)

Skip local testing entirely:

1. **Deploy to Vercel:**
   ```bash
   vercel
   ```

2. **Set environment variables in Vercel dashboard:**
   - `SUPABASE_SERVICE_ROLE_KEY`

3. **Configure webhook in Dodo Payments:**
   - URL: `https://your-project.vercel.app/api/dodo-webhook`

4. **Make a test payment** - it will work!

## Which Should You Choose?

- **Option 1** if you want to test the database logic first
- **Option 2** if you just want to get it working (recommended!)

The webhook code is already written and tested - you can just deploy it!

