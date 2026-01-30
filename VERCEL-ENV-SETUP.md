# How to Add Environment Variables to Vercel

## Step-by-Step Instructions

### Step 1: Go to Your Vercel Project
1. Open your browser and go to [vercel.com](https://vercel.com)
2. Log in to your account
3. Find your project (memo-chess) and click on it

### Step 2: Navigate to Settings
1. Click on the **"Settings"** tab at the top of your project page
2. In the left sidebar, click on **"Environment Variables"**

### Step 3: Add DODO_PAYMENTS_API_KEY
1. Click the **"Add New"** button (or "Add" button)
2. In the **"Key"** field, type: `DODO_PAYMENTS_API_KEY`
3. In the **"Value"** field, paste your Dodo Payments API key
   - You can find this in your Dodo Payments dashboard
   - Go to Dodo Payments → Settings → API Keys
   - Copy your API key (it should look like: `sk_test_...` or `sk_live_...`)
4. Select which environments to apply it to:
   - ✅ **Production** (for live website)
   - ✅ **Preview** (for test deployments)
   - ✅ **Development** (optional, for local testing)
5. Click **"Save"**

### Step 4: Add DODO_PAYMENTS_TEST_MODE (Optional)
1. Click **"Add New"** again
2. In the **"Key"** field, type: `DODO_PAYMENTS_TEST_MODE`
3. In the **"Value"** field, type: `true` (if using test mode) or `false` (if using production)
   - If your API key starts with `sk_test_`, use `true`
   - If your API key starts with `sk_live_`, use `false` or don't add this variable
4. Select environments (same as above)
5. Click **"Save"**

### Step 5: Redeploy Your Application
After adding environment variables, you need to redeploy:
1. Go to the **"Deployments"** tab
2. Find your latest deployment
3. Click the **"..."** (three dots) menu
4. Click **"Redeploy"**
5. Or make a small change and push to GitHub (this will trigger a new deployment)

## How to Find Your Dodo Payments API Key

1. Log in to your Dodo Payments account
2. Go to **Settings** → **API Keys** (or **Developer** → **API Keys**)
3. You'll see:
   - **Test API Key** (starts with `sk_test_`) - for testing
   - **Live API Key** (starts with `sk_live_`) - for production
4. Copy the key you need (use Test key if you're still testing, Live key for production)

## Important Notes

- **Never share your API keys publicly** - they're secret!
- Environment variables are only available to your serverless functions (backend code)
- They are NOT accessible from the frontend (browser)
- After adding variables, you MUST redeploy for them to take effect

## Troubleshooting

**Q: I can't find the Environment Variables section**
- Make sure you're in the **Settings** tab, not Deployments or other tabs
- Look for "Environment Variables" in the left sidebar

**Q: My API calls are failing**
- Make sure you redeployed after adding the variables
- Check that the variable names are exactly: `DODO_PAYMENTS_API_KEY` (case-sensitive)
- Verify your API key is correct in Dodo Payments dashboard

**Q: Should I use test or live key?**
- Use **test key** (`sk_test_...`) if you're still testing payments
- Use **live key** (`sk_live_...`) when you're ready for real payments
- Set `DODO_PAYMENTS_TEST_MODE=true` for test mode, or don't set it for production

