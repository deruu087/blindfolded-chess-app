# Step-by-Step: Add Dodo Payments API Key

## Step 1: Create API Key in Dodo Payments

1. **In Dodo Payments Dashboard:**
   - Click "Create New Key" or "Generate API Key"
   - Give it a name (e.g., "Memo Chess Cancel Subscription")
   - Select permissions: Make sure it has permission to **cancel subscriptions** or **manage subscriptions**
   - Click "Create" or "Generate"

2. **Copy the API Key:**
   - ⚠️ **IMPORTANT**: Copy it immediately - you won't be able to see it again!
   - It should look like: `sk_test_...` (for test) or `sk_live_...` (for production)
   - Save it somewhere safe temporarily (like a text file)

## Step 2: Add to Vercel

1. **Go to Vercel:**
   - Open https://vercel.com
   - Log in
   - Click on your project (memo-chess)

2. **Go to Settings:**
   - Click "Settings" tab at the top
   - Click "Environment Variables" in left sidebar

3. **Add the Key:**
   - Click "Add New" button
   - **Key**: `DODO_PAYMENTS_API_KEY`
   - **Value**: Paste your API key (the one you copied from Dodo Payments)
   - **Environments**: Check all three boxes:
     - ✅ Production
     - ✅ Preview  
     - ✅ Development
   - Click "Save"

4. **Add Test Mode Flag (if using test key):**
   - Click "Add New" again
   - **Key**: `DODO_PAYMENTS_TEST_MODE`
   - **Value**: `true` (if your key starts with `sk_test_`) or `false` (if it starts with `sk_live_`)
   - **Environments**: Check all three boxes
   - Click "Save"

## Step 3: Redeploy

1. Go to "Deployments" tab
2. Click "..." (three dots) on latest deployment
3. Click "Redeploy"
4. Wait for deployment to finish (about 1-2 minutes)

## Step 4: Test

1. Go to your website
2. Log in
3. Go to Profile → Billings
4. Click "Cancel Subscription"
5. Confirm in modal
6. Check Vercel logs to see if it worked!

## Troubleshooting

**If the API key doesn't work:**
- Make sure you copied the ENTIRE key (they're long!)
- Check that you selected the right permissions when creating the key
- Verify the key starts with `sk_test_` or `sk_live_`
- Make sure you redeployed after adding the variable

