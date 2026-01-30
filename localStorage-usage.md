# localStorage Usage Guidelines

## ✅ KEEP in localStorage (Static/Semi-Static Content):

1. **Auth State (Temporary UI State Only)**
   - `isLoggedIn` - UI state flag (Supabase session is source of truth)
   - `userEmail` - Cached for quick UI display (Supabase session is source of truth)
   - `userName` - Cached for quick UI display (Supabase session is source of truth)
   - **Note:** These are cleared on logout and synced from Supabase on login

2. **Subscription Cache (Semi-Static)**
   - `cachedSubscriptionStatus` - Cached subscription status (refreshed from Supabase)
   - `cachedSubscriptionPlan` - Cached plan type (refreshed from Supabase)
   - `subscriptionPlan` - UI preference
   - `pendingSubscription` - Temporary state during subscription flow

3. **UI Preferences (Static)**
   - Theme settings (if implemented)
   - Last-opened page (navigation state)
   - UI preferences (if any)

4. **Supabase Session Keys (Managed by Supabase)**
   - `sb-*` keys - Supabase auth session tokens (managed automatically)

## ❌ REMOVE from localStorage (User-Specific State → Supabase):

1. **Progress Data** - `chessProgress`
   - All game/puzzle completions
   - Training hours
   - Streaks
   - Achievements
   - **→ Store in Supabase `user_progress` table**

2. **User Statistics**
   - Games played count
   - Puzzles completed count
   - Training time
   - Current streak
   - **→ Store in Supabase `user_progress` table**

## Implementation:

- `progress-tracker.js`: Only saves to localStorage for guest/offline mode
- `profile.html`: Loads all user data from Supabase, never from localStorage
- `supabase-helpers.js`: All user progress saved to Supabase only


