// Progress Tracker for Blindfold Chess Training App
// This file handles all progress tracking, achievements, and training time management

class ProgressTracker {
    constructor() {
        this.userProgress = this.loadUserProgress();
        this.currentSession = {
            startTime: null,
            endTime: null,
            totalTime: 0,
            isActive: false,
            type: null, // 'game'
            isIdle: false,
            idleTimer: null,
            idleTimeout: 10 * 1000 // 10 seconds in milliseconds
        };
        this.trainingTimer = {
            isRunning: false,
            startTime: null,
            totalTime: 0,
            idleTimer: null,
            idleTimeout: 10 * 1000 // 10 seconds
        };
        this.achievements = this.initializeAchievements();
        this.init();
    }

    // Initialize the progress tracker
    init() {
        this.setupIdleDetection();
        this.setupSessionTracking();
        this.checkForNewAchievements();
        this.updateStreak(); // Check streak on every page load/visit
    }

    // Load user progress from localStorage
    loadUserProgress() {
        const defaultProgress = {
            // Basic Stats
            totalGamesPlayed: 0,
            totalTrainingHours: 0,
            currentStreak: 0,
            longestStreak: 0,
            lastPlayDate: null,
            
            // Detailed Progress
            gamesByDifficulty: { beginner: 0, intermediate: 0, advanced: 0 },
            averageGameTime: 0,
            
            // Session Data
            totalActiveTime: 0,
            totalIdleTime: 0,
            idleCount: 0,
            averageIdleLength: 0,
            sessionHistory: [],
            
            // Achievements
            unlockedAchievements: [],
            achievementProgress: {},
            
            // Completed games tracking
            completedGames: [],
            
            // Skill Metrics
            accuracy: 0,
            speedRating: 0,
            consistency: 0,
            
            // Daily/Weekly/Monthly tracking
            todayHours: 0,
            thisWeekHours: 0,
            thisMonthHours: 0,
            dailyHours: [],
            longestSession: 0,
            averageSessionLength: 0
        };

        const stored = localStorage.getItem('chessProgress');
        return stored ? { ...defaultProgress, ...JSON.parse(stored) } : defaultProgress;
    }

    // Save user progress to localStorage
    saveUserProgress() {
        localStorage.setItem('chessProgress', JSON.stringify(this.userProgress));
    }

    // Start training timer when user clicks on games pages
    startTrainingTimer() {
        if (!this.trainingTimer.isRunning) {
            this.trainingTimer.isRunning = true;
            this.trainingTimer.startTime = Date.now();
            console.log('Training timer started');
        }
        this.resetTrainingIdleTimer();
    }

    // Stop training timer
    stopTrainingTimer() {
        if (this.trainingTimer.isRunning) {
            const sessionTime = Date.now() - this.trainingTimer.startTime;
            this.trainingTimer.totalTime += sessionTime;
            this.userProgress.totalTrainingHours += sessionTime / (1000 * 60 * 60); // Convert to hours
            this.trainingTimer.isRunning = false;
            this.trainingTimer.startTime = null;
            this.saveUserProgress();
            console.log('Training timer stopped. Session time:', this.formatTime(sessionTime));
        }
        this.clearTrainingIdleTimer();
    }

    // Reset training idle timer (called on any user activity)
    resetTrainingIdleTimer() {
        this.clearTrainingIdleTimer();
        this.trainingTimer.idleTimer = setTimeout(() => {
            console.log('Training timer stopped due to inactivity');
            this.stopTrainingTimer();
        }, this.trainingTimer.idleTimeout);
    }

    // Clear training idle timer
    clearTrainingIdleTimer() {
        if (this.trainingTimer.idleTimer) {
            clearTimeout(this.trainingTimer.idleTimer);
            this.trainingTimer.idleTimer = null;
        }
    }

    // Format time in a readable format (days, hours, minutes, seconds)
    formatTime(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        const remainingHours = hours % 24;
        const remainingMinutes = minutes % 60;
        const remainingSeconds = seconds % 60;

        let result = '';
        if (days > 0) result += `${days}d `;
        if (remainingHours > 0) result += `${remainingHours}h `;
        if (remainingMinutes > 0) result += `${remainingMinutes}m `;
        if (remainingSeconds > 0) result += `${remainingSeconds}s`;

        return result.trim() || '0s';
    }

    // Get detailed training time breakdown
    getDetailedTrainingTime() {
        const totalMs = this.userProgress.totalTrainingHours * 60 * 60 * 1000;
        const currentSessionMs = this.trainingTimer.isRunning ? 
            Date.now() - this.trainingTimer.startTime : 0;
        const totalWithCurrent = totalMs + currentSessionMs;

        return {
            total: this.formatTime(totalWithCurrent),
            currentSession: this.formatTime(currentSessionMs),
            isActive: this.trainingTimer.isRunning,
            totalHours: this.userProgress.totalTrainingHours,
            totalMinutes: Math.floor(this.userProgress.totalTrainingHours * 60),
            totalSeconds: Math.floor(this.userProgress.totalTrainingHours * 3600)
        };
    }

    // Initialize achievement definitions
    initializeAchievements() {
        return {
            // Game Achievements
            firstGame: {
                id: 'first-game',
                name: 'First Steps',
                description: 'Complete your first blindfold game',
                icon: '🎯',
                category: 'games',
                requirement: { gamesPlayed: 1 },
                unlocked: false
            },
            tenGames: {
                id: 'ten-games',
                name: 'Getting Started',
                description: 'Complete 10 blindfold games',
                icon: '🎮',
                category: 'games',
                requirement: { gamesPlayed: 10 },
                unlocked: false
            },
            fiftyGames: {
                id: 'fifty-games',
                name: 'Dedicated Player',
                description: 'Complete 50 blindfold games',
                icon: '🏆',
                category: 'games',
                requirement: { gamesPlayed: 50 },
                unlocked: false
            },
            hundredGames: {
                id: 'hundred-games',
                name: 'Chess Master',
                description: 'Complete 100 blindfold games',
                icon: '👑',
                category: 'games',
                requirement: { gamesPlayed: 100 },
                unlocked: false
            },

            // Puzzle Achievements

            // Time Achievements
            oneHour: {
                id: 'one-hour',
                name: 'First Hour',
                description: 'Train for 1 hour total',
                icon: '⏰',
                category: 'time',
                requirement: { totalTrainingHours: 1 },
                unlocked: false
            },
            tenHours: {
                id: 'ten-hours',
                name: 'Dedicated Learner',
                description: 'Train for 10 hours total',
                icon: '📚',
                category: 'time',
                requirement: { totalTrainingHours: 10 },
                unlocked: false
            },
            fiftyHours: {
                id: 'fifty-hours',
                name: 'Serious Student',
                description: 'Train for 50 hours total',
                icon: '🎓',
                category: 'time',
                requirement: { totalTrainingHours: 50 },
                unlocked: false
            },
            hundredHours: {
                id: 'hundred-hours',
                name: 'Training Champion',
                description: 'Train for 100 hours total',
                icon: '🏅',
                category: 'time',
                requirement: { totalTrainingHours: 100 },
                unlocked: false
            },

            // Streak Achievements
            threeDayStreak: {
                id: 'three-day-streak',
                name: 'Daily Player',
                description: 'Train for 3 days in a row',
                icon: '🔥',
                category: 'streak',
                requirement: { currentStreak: 3 },
                unlocked: false
            },
            sevenDayStreak: {
                id: 'seven-day-streak',
                name: 'Dedicated',
                description: 'Train for 7 days in a row',
                icon: '💪',
                category: 'streak',
                requirement: { currentStreak: 7 },
                unlocked: false
            },
            thirtyDayStreak: {
                id: 'thirty-day-streak',
                name: 'Unstoppable',
                description: 'Train for 30 days in a row',
                icon: '⚡',
                category: 'streak',
                requirement: { currentStreak: 30 },
                unlocked: false
            },

            // Session Achievements
            marathonSession: {
                id: 'marathon-session',
                name: 'Marathon Player',
                description: 'Train for 2+ hours in one session',
                icon: '🏃',
                category: 'session',
                requirement: { longestSession: 120 }, // 2 hours in minutes
                unlocked: false
            },
            quickStudy: {
                id: 'quick-study',
                name: 'Quick Study',
                description: 'Complete a 15-minute training session',
                icon: '⚡',
                category: 'session',
                requirement: { sessionLength: 15 },
                unlocked: false
            }
        };
    }

    // Setup idle detection system
    setupIdleDetection() {
        // This will be implemented to detect user inactivity
        // and pause training time after 3 minutes of no moves
    }

    // Setup session tracking
    setupSessionTracking() {
        // This will be implemented to track training sessions
        // and calculate training hours
    }

    // Check for new achievements
    checkForNewAchievements() {
        // This will be implemented to check if user has earned new achievements
    }

    // Start a training session
    startSession(type) {
        this.currentSession.startTime = Date.now();
        this.currentSession.isActive = true;
        this.currentSession.type = type;
        this.currentSession.isIdle = false;
        this.resetIdleTimer();
    }

    // End a training session
    endSession() {
        if (this.currentSession.isActive) {
            this.currentSession.endTime = Date.now();
            this.currentSession.totalTime = this.currentSession.endTime - this.currentSession.startTime;
            this.addTrainingTime(this.currentSession.totalTime);
            this.currentSession.isActive = false;
        }
    }

    // Add training time to user progress
    addTrainingTime(timeInMs) {
        const timeInMinutes = timeInMs / (1000 * 60);
        const timeInHours = timeInMinutes / 60;
        
        this.userProgress.totalTrainingHours += timeInHours;
        this.userProgress.todayHours += timeInHours;
        
        // Update session history
        this.userProgress.sessionHistory.push({
            date: new Date().toISOString(),
            duration: timeInMinutes,
            type: this.currentSession.type
        });
        
        // Update longest session
        if (timeInMinutes > this.userProgress.longestSession) {
            this.userProgress.longestSession = timeInMinutes;
        }
        
        this.saveUserProgress();
        this.checkForNewAchievements();
    }

    // Reset idle timer after user action
    resetIdleTimer() {
        if (this.currentSession.idleTimer) {
            clearTimeout(this.currentSession.idleTimer);
        }
        
        this.currentSession.idleTimer = setTimeout(() => {
            this.pauseTraining();
        }, this.currentSession.idleTimeout);
    }

    // Pause training due to inactivity
    pauseTraining() {
        this.currentSession.isIdle = true;
        this.userProgress.idleCount++;
        // Add visual feedback for paused state
    }

    // Resume training after user action
    resumeTraining() {
        this.currentSession.isIdle = false;
        this.resetIdleTimer();
        // Add visual feedback for resumed state
    }

    // Record a game completion
    recordGameCompletion(difficulty = 'intermediate', gameId = null) {
        this.userProgress.totalGamesPlayed++;
        this.userProgress.gamesByDifficulty[difficulty]++;
        
        // Add to completed games list if gameId provided
        if (gameId && !this.userProgress.completedGames.includes(gameId)) {
            this.userProgress.completedGames.push(gameId);
            console.log('Added game to completed list:', gameId);
            console.log('Completed games now:', this.userProgress.completedGames);
        }
        
        // Streak is now only updated on daily login, not on game completion
        this.saveUserProgress();
        this.checkForNewAchievements();
    }


    // Update user streak based on daily login
    updateStreak() {
        const today = new Date().toDateString();
        const lastPlayDate = this.userProgress.lastPlayDate;
        
        // If already visited today, no change to streak
        if (lastPlayDate === today) {
            return;
        }
        
        // Calculate days since last visit
        const lastVisit = lastPlayDate ? new Date(lastPlayDate) : null;
        const daysSinceLastVisit = lastVisit ? 
            Math.floor((new Date() - lastVisit) / (1000 * 60 * 60 * 24)) : 
            Infinity;
        
        if (daysSinceLastVisit === 1) {
            // Consecutive day, increment streak
            this.userProgress.currentStreak++;
            console.log('Streak continued! Current streak:', this.userProgress.currentStreak);
        } else if (daysSinceLastVisit > 1) {
            // Missed one or more days, reset streak
            this.userProgress.currentStreak = 1;
            console.log('Streak reset due to missed days. New streak:', this.userProgress.currentStreak);
        } else {
            // First time or same day, set to 1
            this.userProgress.currentStreak = Math.max(1, this.userProgress.currentStreak);
            console.log('First visit or same day. Streak:', this.userProgress.currentStreak);
        }
        
        // Update longest streak if current is higher
        if (this.userProgress.currentStreak > this.userProgress.longestStreak) {
            this.userProgress.longestStreak = this.userProgress.currentStreak;
            console.log('New longest streak!', this.userProgress.longestStreak);
        }
        
        // Update last play date to today
        this.userProgress.lastPlayDate = today;
        
        // Save the updated progress
        this.saveUserProgress();
    }

    // Get user progress summary
    getProgressSummary() {
        return {
            totalGames: this.userProgress.totalGamesPlayed,
            totalHours: Math.round(this.userProgress.totalTrainingHours * 10) / 10,
            currentStreak: this.userProgress.currentStreak,
            longestStreak: this.userProgress.longestStreak,
            unlockedAchievements: this.userProgress.unlockedAchievements.length,
            totalAchievements: Object.keys(this.achievements).length,
            completedGames: this.userProgress.completedGames
        };
    }
    
    // Get completed games as a Set
    getCompletedGamesSet() {
        console.log('Getting completed games set:', this.userProgress.completedGames);
        return new Set(this.userProgress.completedGames);
    }
    
    // Get all completed challenges (games) as a Set
    getAllCompletedChallengesSet() {
        const allCompleted = [...this.userProgress.completedGames];
        console.log('Getting all completed challenges set:', allCompleted);
        return new Set(allCompleted);
    }

    // Get achievements by category
    getAchievementsByCategory(category) {
        return Object.values(this.achievements).filter(achievement => 
            achievement.category === category
        );
    }

    // Check if achievement is unlocked
    isAchievementUnlocked(achievementId) {
        return this.userProgress.unlockedAchievements.includes(achievementId);
    }

    // Get achievement progress
    getAchievementProgress(achievementId) {
        const achievement = this.achievements[achievementId];
        if (!achievement) return null;
        
        const requirement = achievement.requirement;
        const key = Object.keys(requirement)[0];
        const currentValue = this.userProgress[key] || 0;
        const requiredValue = requirement[key];
        
        return {
            current: currentValue,
            required: requiredValue,
            progress: Math.min((currentValue / requiredValue) * 100, 100),
            unlocked: currentValue >= requiredValue
        };
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProgressTracker;
}
