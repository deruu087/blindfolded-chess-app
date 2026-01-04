-- Check the current schema of user_progress table
-- Run this in Supabase SQL Editor to see all columns

SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'user_progress'
ORDER BY ordinal_position;


