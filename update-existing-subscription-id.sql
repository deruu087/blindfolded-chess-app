-- Update existing subscription with Dodo Payments subscription ID
-- Replace 'YOUR_DODO_SUBSCRIPTION_ID' with the actual subscription ID from Dodo Payments dashboard

-- First, find your subscription ID in Dodo Payments:
-- 1. Go to Dodo Payments dashboard
-- 2. Find your subscription
-- 3. Copy the subscription ID (it looks like: sub_xxxxx)

-- Then run this SQL, replacing YOUR_DODO_SUBSCRIPTION_ID with the actual ID:
-- UPDATE subscriptions 
-- SET dodo_subscription_id = 'YOUR_DODO_SUBSCRIPTION_ID'
-- WHERE user_id = 'YOUR_USER_ID' AND status = 'active';

-- Or update by email (easier):
UPDATE subscriptions 
SET dodo_subscription_id = 'YOUR_DODO_SUBSCRIPTION_ID'
WHERE email = 'YOUR_EMAIL@example.com' AND status = 'active';

-- To find your subscription ID in Dodo Payments:
-- - Go to Dodo Payments dashboard → Subscriptions
-- - Find your subscription
-- - Copy the ID (starts with "sub_")

