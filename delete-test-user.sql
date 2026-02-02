-- Delete test user data from Supabase
-- Run this in Supabase SQL Editor to clean up test accounts

-- Step 1: Delete user progress data for specific email
-- Replace 'your-email@example.com' with the email you want to delete
DELETE FROM user_progress
WHERE user_id IN (
    SELECT id FROM auth.users WHERE email = 'your-email@example.com'
);

-- Step 2: Delete the user from auth.users (requires admin access)
-- This will delete the user account completely
-- Replace 'your-email@example.com' with the email you want to delete
DELETE FROM auth.users
WHERE email = 'your-email@example.com';

-- Alternative: If you want to delete ALL test users (be careful!)
-- Uncomment the lines below:

-- DELETE FROM user_progress;
-- DELETE FROM auth.users WHERE email LIKE '%@proton%' OR email LIKE '%@test%';

-- To see what users exist before deleting:
-- SELECT id, email, created_at FROM auth.users ORDER BY created_at DESC;

-- To see what progress records exist:
-- SELECT up.user_id, au.email, up.total_games_played, up.training_hours 
-- FROM user_progress up
-- JOIN auth.users au ON up.user_id = au.id
-- ORDER BY up.updated_at DESC;


