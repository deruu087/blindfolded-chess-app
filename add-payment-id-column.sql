-- Add payment_id column to payments table
-- This stores the Dodo Payments payment ID (e.g., pay_XXX) for constructing invoice URLs
-- Run this in Supabase SQL Editor

-- Add payment_id column if it doesn't exist
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS payment_id TEXT;

-- Create index on payment_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_payments_payment_id ON payments(payment_id);

-- Add comment to column
COMMENT ON COLUMN payments.payment_id IS 'Dodo Payments payment ID (e.g., pay_XXX) used for invoice URLs';

-- Verify the column was added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'payments' AND column_name = 'payment_id';

