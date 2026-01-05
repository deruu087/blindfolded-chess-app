-- Create payments table for storing payment history
-- This table stores individual payment records (second div in billing section)
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    currency TEXT DEFAULT 'EUR',
    status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'pending', 'failed', 'refunded')),
    payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    invoice_url TEXT,
    order_id TEXT,
    transaction_id TEXT,
    payment_method TEXT DEFAULT 'dodo_payments',
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);

-- Create index on payment_date for sorting
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments(payment_date DESC);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- Create index on order_id for webhook lookups
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);

-- Enable Row Level Security (RLS)
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid errors on re-run)
DROP POLICY IF EXISTS "Users can view their own payments" ON payments;
DROP POLICY IF EXISTS "Users can insert their own payments" ON payments;
DROP POLICY IF EXISTS "Users can update their own payments" ON payments;

-- Create policy: Users can only read their own payments
CREATE POLICY "Users can view their own payments"
    ON payments FOR SELECT
    USING (auth.uid() = user_id);

-- Create policy: Users can insert their own payments
CREATE POLICY "Users can insert their own payments"
    ON payments FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Create policy: Users can update their own payments
CREATE POLICY "Users can update their own payments"
    ON payments FOR UPDATE
    USING (auth.uid() = user_id);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;

-- Create trigger to update updated_at on row update
CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_payments_updated_at();

-- Verify the table was created
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'payments'
ORDER BY ordinal_position;

