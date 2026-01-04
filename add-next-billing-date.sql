-- Add next_billing_date column to subscriptions table
-- Run this in Supabase SQL Editor

ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS next_billing_date DATE;

-- Create index on next_billing_date for faster lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_next_billing_date ON subscriptions(next_billing_date);

-- Verify the column was added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'subscriptions'
AND column_name = 'next_billing_date';

