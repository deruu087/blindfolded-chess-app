-- Add email column to subscriptions table
-- Run this in Supabase SQL Editor

-- Add email column to subscriptions
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS email TEXT;

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_email ON subscriptions(email);

-- Add email column to payments table
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS email TEXT;

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_payments_email ON payments(email);

-- Update existing records with email from auth.users (optional - backfill)
UPDATE subscriptions s
SET email = u.email
FROM auth.users u
WHERE s.user_id = u.id AND s.email IS NULL;

UPDATE payments p
SET email = u.email
FROM auth.users u
WHERE p.user_id = u.id AND p.email IS NULL;

-- Verify the columns were added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name IN ('subscriptions', 'payments')
AND column_name = 'email'
ORDER BY table_name;

