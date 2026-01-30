# Verification Guide: Supabase Columns

## Columns to Verify:
1. `completed_games` - Array of completed game IDs
2. `completed_puzzles` - Array of completed puzzle IDs  
3. `training_hours` - Total training time in hours (decimal)
4. `current_streak` - Current streak in days (integer)

## How to Verify Each Column:

### 1. completed_games
**Saved in:** `progress-tracker.js` → `saveToSupabase()` → separates games from puzzles
**Saved to:** `supabase-helpers.js` → `saveUserProgress()` → `completed_games` column
**Loaded in:** `profile.html` → `initProfile()` → `supabaseProgressData.completed_games`
**Displayed in:** `profile.html` → `updateStats()` → `completedGamesArray` → NOT directly displayed (used for progress bars)

**Note:** "Games Completed" stat uses `challenge_mode_completions`, not `completed_games`

### 2. completed_puzzles
**Saved in:** `progress-tracker.js` → `saveToSupabase()` → separates puzzles from games
**Saved to:** `supabase-helpers.js` → `saveUserProgress()` → `completed_puzzles` column
**Loaded in:** `profile.html` → `initProfile()` → `supabaseProgressData.completed_puzzles`
**Displayed in:** `profile.html` → `updateStats()` → `completedPuzzlesArray` → `getCompletedCounts()` → `puzzlesCompleted` stat

### 3. training_hours
**Saved in:** `progress-tracker.js` → `saveToSupabase()` → calculates `totalTrainingHours`
**Saved to:** `supabase-helpers.js` → `saveUserProgress()` → `training_hours` column
**Loaded in:** `profile.html` → `initProfile()` → `supabaseProgressData.training_hours`
**Displayed in:** `profile.html` → `updateStats()` → `trainingHours` → `hoursToDisplay` → `trainingHours` stat

### 4. current_streak
**Saved in:** `progress-tracker.js` → `saveToSupabase()` → `userProgress.currentStreak`
**Saved to:** `supabase-helpers.js` → `saveUserProgress()` → `current_streak` column
**Loaded in:** `profile.html` → `initProfile()` → `supabaseProgressData.current_streak`
**Displayed in:** `profile.html` → `updateStats()` → `currentStreak` → `streakToDisplay` → `currentStreak` stat

## Console Logs to Check:

Open browser console (F12) and look for:

1. **On page load:**
   - `✅ Loaded progress from Supabase (source of truth):`
   - `Supabase completed_games: [...]`
   - `Supabase completed_puzzles: [...]`
   - `Supabase training_hours: X.XX`
   - `Supabase current_streak: X`

2. **In updateStats:**
   - `✅ Using Supabase data (source of truth):`
   - `completedGames: X`
   - `completedPuzzles: X`
   - `trainingHours: X.XX`
   - `currentStreak: X`

3. **Training time display:**
   - `🕐 Training time display:`
   - `hoursToDisplay: X.XX`
   - `timeString: "Xh Xm"`

4. **Games/Puzzles count:**
   - `🔍 getCompletedCounts - Total items loaded: X`
   - `✅ Games by moves count: X`
   - `✅ Completed puzzles count from Supabase array: X`


