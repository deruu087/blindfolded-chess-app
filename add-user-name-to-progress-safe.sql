-- SAFE VERSION: Add user_name and user_email columns to user_progress table
-- Run this step by step if Supabase warns about destructive operations

-- ============================================
-- STEP 1: Add the new columns (SAFE - only adds, doesn't remove anything)
-- ============================================
ALTER TABLE user_progress 
ADD COLUMN IF NOT EXISTS user_name TEXT,
ADD COLUMN IF NOT EXISTS user_email TEXT;

-- ============================================
-- STEP 2: Update existing records with names/emails (SAFE - only updates)
-- ============================================
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
WHERE up.user_id = au.id
  AND (up.user_name IS NULL OR up.user_email IS NULL); -- Only update if empty

-- ============================================
-- STEP 3: Create function (SAFE - uses CREATE OR REPLACE)
-- ============================================
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

-- ============================================
-- STEP 4: Create trigger (SAFE - checks if exists first)
-- ============================================
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

-- ============================================
-- STEP 5: Verify the changes (READ-ONLY - just shows data)
-- ============================================
SELECT user_id, user_name, user_email, total_games_played, current_streak 
FROM user_progress 
ORDER BY updated_at DESC;

