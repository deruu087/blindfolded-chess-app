# Payment Flow Verification Checklist

This document outlines the complete payment flow verification process for Supabase, Dodo Payments, and the billing section.

## ✅ Fixed Issues

1. **Price Consistency Fixed**
   - ✅ `payment-success.html`: Updated from `3.52` to `3.49` for monthly plan
   - ✅ `subscription.html`: Updated prices to match correct amounts ($3.49 monthly, $8.90 quarterly)
   - ✅ All prices now consistent: Monthly = $3.49, Quarterly = $8.90

## 📋 Database Schema Verification

### Required SQL Migrations (Run in Supabase SQL Editor)

1. **Base Tables** (if not already created):
   ```sql
   -- Run: create-subscriptions-table.sql
   -- Run: create-payments-table.sql
   ```

2. **Additional Columns** (required for full functionality):
   ```sql
   -- Run: add-email-columns.sql (adds email to subscriptions and payments)
   -- Run: add-dodo-subscription-id.sql (adds dodo_subscription_id to subscriptions)
   -- Run: add-next-billing-date-column.sql (adds next_billing_date to subscriptions)
   ```

### Verify Schema Completeness

**Subscriptions Table Should Have:**
- ✅ `id` (UUID, PRIMARY KEY)
- ✅ `user_id` (UUID, REFERENCES auth.users)
- ✅ `plan_type` (TEXT: 'monthly' or 'quarterly')
- ✅ `status` (TEXT: 'active', 'cancelled', 'expired')
- ✅ `start_date` (DATE)
- ✅ `end_date` (DATE, nullable)
- ✅ `amount_paid` (DECIMAL(10, 2))
- ✅ `currency` (TEXT, default 'EUR')
- ✅ `payment_method` (TEXT, default 'dodo_payments')
- ✅ `email` (TEXT, nullable) - **REQUIRED for webhook matching**
- ✅ `dodo_subscription_id` (TEXT, nullable) - **REQUIRED for cancellation**
- ✅ `next_billing_date` (DATE, nullable) - **REQUIRED for billing display**
- ✅ `created_at` (TIMESTAMPTZ)
- ✅ `updated_at` (TIMESTAMPTZ)

**Payments Table Should Have:**
- ✅ `id` (UUID, PRIMARY KEY)
- ✅ `user_id` (UUID, REFERENCES auth.users)
- ✅ `amount` (DECIMAL(10, 2))
- ✅ `currency` (TEXT, default 'EUR')
- ✅ `status` (TEXT: 'paid', 'pending', 'failed', 'refunded')
- ✅ `payment_date` (TIMESTAMPTZ)
- ✅ `invoice_url` (TEXT, nullable)
- ✅ `order_id` (TEXT, nullable)
- ✅ `transaction_id` (TEXT, nullable)
- ✅ `payment_method` (TEXT, default 'dodo_payments')
- ✅ `description` (TEXT, nullable)
- ✅ `email` (TEXT, nullable) - **REQUIRED for webhook matching**
- ✅ `created_at` (TIMESTAMPTZ)
- ✅ `updated_at` (TIMESTAMPTZ)

## 🔄 Dodo Payments Webhook Verification

### Webhook Endpoint
- **URL**: `https://your-domain.com/api/dodo-webhook`
- **Method**: POST
- **Location**: `api/dodo-webhook.js`

### Webhook Functionality Checklist

1. **Email Extraction** ✅
   - Extracts email from: `data.customer?.email || data.customer_email || webhookData.customer?.email || webhookData.email`
   - Handles nested structure correctly

2. **Amount Processing** ✅
   - Converts from cents to decimal (divides by 100)
   - Handles multiple field names: `total_amount`, `recurring_pre_tax_amount`, `amount`, etc.

3. **Plan Type Detection** ✅
   - Primary: Uses `payment_frequency_interval` and `payment_frequency_count`
   - Fallback: Uses amount matching ($3.49 = monthly, $8.90 = quarterly)
   - Validates plan type is 'monthly' or 'quarterly'

4. **User Matching** ✅
   - Uses Supabase Admin API to find user by email
   - Handles case where user not found (returns 200, logs for manual processing)

5. **Subscription Creation** ✅
   - Creates/updates subscription in `subscriptions` table
   - Uses `upsert` with `onConflict: 'user_id'`
   - Stores: `dodo_subscription_id`, `next_billing_date`, `email`

6. **Payment Record Creation** ✅
   - Creates payment record in `payments` table
   - Links to subscription via `order_id` and `transaction_id`
   - Stores email for easier querying

7. **Status Handling** ✅
   - Handles: 'completed', 'paid', 'success', 'succeeded'
   - Handles cancellation: 'cancelled', 'cancelled'
   - Returns 200 for all webhook events (prevents retries)

8. **Error Handling** ✅
   - Logs all errors with detailed information
   - Returns appropriate HTTP status codes
   - Non-blocking email sending (wrapped in try-catch)

## 💳 Payment Flow End-to-End Test

### Test Scenario 1: New Subscription

1. **User clicks "Subscribe Monthly"**
   - ✅ Redirects to Dodo Payments checkout
   - ✅ Uses correct product ID (test: `pdt_pvTND4gU6MdigzfFWNppx`)
   - ✅ Includes redirect URL to `payment-success.html`

2. **User completes payment on Dodo Payments**
   - ✅ Dodo Payments processes payment
   - ✅ Dodo Payments sends webhook to `/api/dodo-webhook`
   - ✅ Dodo Payments redirects user to `payment-success.html`

3. **Webhook Processing**
   - ✅ Webhook receives payment data
   - ✅ Extracts customer email
   - ✅ Finds user in Supabase by email
   - ✅ Creates subscription record in `subscriptions` table
   - ✅ Creates payment record in `payments` table
   - ✅ Sends confirmation email (non-blocking)

4. **Payment Success Page**
   - ✅ Checks if subscription already exists (webhook may have created it)
   - ✅ If not, calls `/api/sync-subscription` as fallback
   - ✅ Updates localStorage cache
   - ✅ Redirects to `profile.html`

5. **Profile Billing Section**
   - ✅ Displays subscription information
   - ✅ Shows plan type, status, amount, next billing date
   - ✅ Displays payment history table
   - ✅ Shows all payments from `payments` table

### Test Scenario 2: Subscription Cancellation

1. **User clicks "Cancel Subscription"**
   - ✅ Calls `/api/cancel-subscription`
   - ✅ Authenticates user via JWT token

2. **Cancel Subscription API**
   - ✅ Fetches user's active subscription
   - ✅ Gets `dodo_subscription_id` from subscription
   - ✅ Calls Dodo Payments API: `PATCH /subscriptions/{id}` with `status: 'cancelled'`
   - ✅ Updates Supabase: `status = 'cancelled'`, sets `end_date`
   - ✅ Sends cancellation email (non-blocking)

3. **Billing Section Update**
   - ✅ Shows subscription status as "Cancelled"
   - ✅ Shows access end date
   - ✅ Payment history remains visible

## 📊 Billing Section Verification

### Location
- **File**: `profile.html`
- **Function**: `loadBillingInfo()`
- **Tab**: "Billings" section

### Display Requirements

1. **Subscription Information** (First Section)
   - ✅ Plan Type: "Monthly" or "Quarterly"
   - ✅ Status: "Active" or "Cancelled" (with color coding)
   - ✅ Amount: Formatted with currency symbol
   - ✅ Billing Frequency: "billed monthly" or "billed quarterly"
   - ✅ Next Billing Date: Calculated from `next_billing_date` or `start_date`
   - ✅ Cancel Button: Only shown for active subscriptions

2. **Payment History** (Second Section)
   - ✅ Table with columns: Amount, Status, Date, Invoice
   - ✅ Fetched from `payments` table via `getPaymentHistory()`
   - ✅ Ordered by `payment_date` DESC (most recent first)
   - ✅ Filters out test data (amount = 3.52)
   - ✅ Shows "No payment history" if empty

3. **Error Handling**
   - ✅ Shows loading state while fetching
   - ✅ Shows error message if Supabase not initialized
   - ✅ Shows error message if user not authenticated
   - ✅ Shows empty state if no subscription found

## 🔧 Environment Variables Required

### Vercel Environment Variables

1. **Supabase**
   - `SUPABASE_URL` - Your Supabase project URL
   - `SUPABASE_ANON_KEY` - Your Supabase anon key
   - `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key (for webhook)

2. **Dodo Payments**
   - `DODO_PAYMENTS_API_KEY` - Your Dodo Payments API key (test or live)

3. **Email (Optional)**
   - `RESEND_API_KEY` - For sending confirmation emails

## 🧪 Testing Checklist

### Manual Testing Steps

1. **Database Setup**
   - [ ] Run all SQL migration files in Supabase SQL Editor
   - [ ] Verify all columns exist in `subscriptions` table
   - [ ] Verify all columns exist in `payments` table
   - [ ] Test RLS policies allow user to read their own data

2. **Webhook Testing**
   - [ ] Configure webhook URL in Dodo Payments dashboard
   - [ ] Test webhook with sample payment data
   - [ ] Verify subscription created in Supabase
   - [ ] Verify payment record created in Supabase
   - [ ] Check webhook logs in Vercel dashboard

3. **Payment Flow Testing**
   - [ ] Test monthly subscription purchase
   - [ ] Test quarterly subscription purchase
   - [ ] Verify subscription appears in billing section
   - [ ] Verify payment history appears
   - [ ] Test subscription cancellation
   - [ ] Verify cancellation reflected in billing section

4. **Billing Section Testing**
   - [ ] Test with active subscription
   - [ ] Test with cancelled subscription
   - [ ] Test with no subscription (free user)
   - [ ] Verify payment history displays correctly
   - [ ] Test error states (not logged in, Supabase error)

## 🐛 Common Issues & Solutions

### Issue 1: Webhook Not Creating Subscription
**Symptoms**: Payment succeeds but no subscription in database
**Solutions**:
- Check webhook URL is correct in Dodo Payments dashboard
- Verify `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel
- Check webhook logs in Vercel dashboard
- Verify user email matches in Dodo Payments and Supabase

### Issue 2: User Not Found in Webhook
**Symptoms**: Webhook logs show "User not found"
**Solutions**:
- Verify user email in Dodo Payments matches Supabase auth.users email
- Check email is extracted correctly from webhook payload
- Payment-success page will handle sync as fallback

### Issue 3: Billing Section Shows No Data
**Symptoms**: Billing section shows "No subscription" or empty
**Solutions**:
- Verify user is authenticated
- Check `getUserSubscription()` returns data
- Verify RLS policies allow user to read their subscription
- Check browser console for errors

### Issue 4: Payment History Not Showing
**Symptoms**: Payment history table is empty
**Solutions**:
- Verify `getPaymentHistory()` function works
- Check payments table has records for user
- Verify RLS policies allow user to read their payments
- Check payment records have correct `user_id`

### Issue 5: Cancellation Not Working
**Symptoms**: Cancel button doesn't work or subscription not cancelled
**Solutions**:
- Verify `dodo_subscription_id` is stored in subscription
- Check `DODO_PAYMENTS_API_KEY` is set correctly
- Verify API key has permission to cancel subscriptions
- Check API key matches subscription type (test vs live)

## 📝 Notes

- All prices are in USD: Monthly = $3.49, Quarterly = $8.90
- Webhook uses service role key to bypass RLS for user lookup
- Payment success page has fallback sync mechanism if webhook fails
- Email sending is non-blocking and won't break payment flow
- Test data with amount = 3.52 is automatically filtered out

