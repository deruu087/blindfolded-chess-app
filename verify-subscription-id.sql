-- Verify and update subscription ID
-- Replace 'USER_EMAIL' with the actual email
-- Replace 'SUBSCRIPTION_ID' with the subscription ID from Dodo Payments dashboard

-- First, check current state
SELECT 
  id,
  user_id,
  email,
  dodo_subscription_id,
  status,
  plan_type,
  created_at,
  updated_at
FROM subscriptions
WHERE email = 'USER_EMAIL'
ORDER BY created_at DESC;

-- Then update (uncomment and replace values):
-- UPDATE subscriptions 
-- SET dodo_subscription_id = 'SUBSCRIPTION_ID',
--     updated_at = NOW()
-- WHERE email = 'USER_EMAIL' 
--   AND status = 'active'
-- RETURNING *;
