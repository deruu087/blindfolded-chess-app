-- Add dodo_subscription_id column to subscriptions table
-- This stores the subscription ID from Dodo Payments for API calls

ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS dodo_subscription_id TEXT;

-- Create index on dodo_subscription_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_dodo_subscription_id ON subscriptions(dodo_subscription_id);

-- Verify the column was added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'subscriptions'
AND column_name = 'dodo_subscription_id';

