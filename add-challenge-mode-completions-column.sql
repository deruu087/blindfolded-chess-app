-- Add challenge_mode_completions column to user_progress table
-- This column stores game IDs that were completed in test/challenge mode (from "By Moves" tab)

ALTER TABLE user_progress 
ADD COLUMN IF NOT EXISTS challenge_mode_completions TEXT[] DEFAULT '{}';

-- Add comment to document the column
COMMENT ON COLUMN user_progress.challenge_mode_completions IS 'Array of game IDs completed in test/challenge mode from "By Moves" tab';


