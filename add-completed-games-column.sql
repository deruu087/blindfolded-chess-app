-- Add completed_games column to user_progress table
-- Run this in Supabase SQL Editor if the column doesn't exist

ALTER TABLE user_progress
ADD COLUMN IF NOT EXISTS completed_games TEXT[] DEFAULT '{}';

-- Verify the column was added
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'user_progress' 
  AND column_name = 'completed_games';


