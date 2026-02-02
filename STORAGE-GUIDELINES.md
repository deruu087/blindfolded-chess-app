# Storage Guidelines: localStorage vs Supabase

## ✅ localStorage (Static/Semi-Static Content Only)

Use localStorage ONLY for:
- **Auth UI State** (temporary, synced from Supabase):
  - `isLoggedIn` - UI flag (Supabase session is source of truth)
  - `userEmail` - Cached for quick display
  - `userName` - Cached for quick display
  
- **Subscription Cache** (semi-static, refreshed from Supabase):
  - `cachedSubscriptionStatus` - Cached subscription status
  - `cachedSubscriptionPlan` - Cached plan type
  - `subscriptionPlan` - UI preference
  - `pendingSubscription` - Temporary subscription flow state

- **UI Preferences** (static):
  - Theme settings
  - Last-opened page
  - UI preferences

- **Supabase Session Keys** (managed by Supabase):
  - `sb-*` keys - Auth tokens (auto-managed)

## ❌ Supabase (All User-Specific State)

Store in Supabase `user_progress` table:
- `completed_games` - Games from "By Moves" completed in test mode
- `completed_puzzles` - Puzzles from "By Difficulty" completed in test mode
- `challenge_mode_completions` - Games completed in test mode
- `training_hours` - Total training time
- `current_streak` - Current streak in days
- `total_games_played` - Total games played count

## Implementation Rules:

1. **Never save user progress to localStorage for logged-in users**
   - `progress-tracker.js`: Only saves to localStorage for guest/offline mode
   - `profile.html`: Never saves progress to localStorage

2. **Never load user progress from localStorage for logged-in users**
   - `progress-tracker.js`: Returns empty progress if user is logged in
   - `profile.html`: Always loads from Supabase first

3. **Clear localStorage progress on login/logout**
   - Login: Clear `chessProgress` to prevent data leakage
   - Logout: Clear all user-specific data

4. **Supabase is the single source of truth for all user progress**


