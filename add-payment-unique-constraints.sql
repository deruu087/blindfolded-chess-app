-- Add unique constraints to prevent duplicate payments
-- Run this in Supabase SQL Editor

-- Add unique constraint on payment_id (if payment_id exists, it must be unique)
-- This prevents duplicate payments with the same payment_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_payment_id_unique 
ON payments(payment_id) 
WHERE payment_id IS NOT NULL;

-- Add unique constraint on (user_id, order_id, amount, payment_date) 
-- This prevents duplicate payments for the same order
-- Only apply if order_id is not null
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_user_order_amount_date_unique 
ON payments(user_id, order_id, amount, payment_date) 
WHERE order_id IS NOT NULL;

-- Add unique constraint on (user_id, transaction_id, amount, payment_date)
-- This prevents duplicate payments for the same transaction
-- Only apply if transaction_id is not null
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_user_transaction_amount_date_unique 
ON payments(user_id, transaction_id, amount, payment_date) 
WHERE transaction_id IS NOT NULL;

-- Verify the indexes were created
SELECT 
    indexname, 
    indexdef 
FROM pg_indexes 
WHERE tablename = 'payments' 
AND indexname LIKE '%unique%'
ORDER BY indexname;

