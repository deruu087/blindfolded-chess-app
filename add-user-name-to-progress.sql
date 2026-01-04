-- Add user_name and user_email columns to user_progress table
-- This will allow you to see names instead of UUIDs in the Supabase dashboard

-- Step 1: Add the new columns
ALTER TABLE user_progress 
ADD COLUMN IF NOT EXISTS user_name TEXT,
ADD COLUMN IF NOT EXISTS user_email TEXT;

-- Step 2: Update existing records with user names and emails from auth.users
-- This joins the user_progress table with auth.users to get the name and email
UPDATE user_progress up
SET 
    user_name = COALESCE(
        au.raw_user_meta_data->>'name',
        au.raw_user_meta_data->>'full_name',
        SPLIT_PART(au.email, '@', 1),
        'User'
    ),
    user_email = COALESCE(au.email, '')
FROM auth.users au
WHERE up.user_id = au.id;

-- Step 3: Create a function to automatically update user_name and user_email
-- when a new user_progress record is created or updated
CREATE OR REPLACE FUNCTION update_user_progress_name_email()
RETURNS TRIGGER AS $$
BEGIN
    -- Get user name and email from auth.users
    SELECT 
        COALESCE(
            raw_user_meta_data->>'name',
            raw_user_meta_data->>'full_name',
            SPLIT_PART(email, '@', 1),
            'User'
        ),
        COALESCE(email, '')
    INTO NEW.user_name, NEW.user_email
    FROM auth.users
    WHERE id = NEW.user_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Create a trigger to automatically update name/email on insert or update
-- Note: This will only create the trigger if it doesn't exist
-- If you need to recreate it, you can manually drop it first in Supabase dashboard
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'trigger_update_user_progress_name_email'
    ) THEN
        CREATE TRIGGER trigger_update_user_progress_name_email
            BEFORE INSERT OR UPDATE ON user_progress
            FOR EACH ROW
            EXECUTE FUNCTION update_user_progress_name_email();
    END IF;
END $$;

-- Verify the changes
SELECT user_id, user_name, user_email, total_games_played, current_streak 
FROM user_progress 
ORDER BY updated_at DESC;

