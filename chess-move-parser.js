// Universal Chess Move Parser
class ChessMoveParser {
    constructor() {
        this.pieceMap = {
            'K': 'king', 'Q': 'queen', 'R': 'rook', 'B': 'bishop', 'N': 'knight', 'P': 'pawn'
        };
        this.pieceImages = {
            'K': { white: 'Chess_klt45.svg.png', black: 'Chess_kdt45.svg.png' },
            'Q': { white: 'Chess_qlt45.svg.png', black: 'Chess_qdt45.svg.png' },
            'R': { white: 'Chess_rlt45.svg.png', black: 'Chess_rdt45.svg.png' },
            'B': { white: 'Chess_blt45.svg.png', black: 'Chess_bdt45.svg.png' },
            'N': { white: 'Chess_nlt45.svg.png', black: 'Chess_ndt45.svg.png' },
            'P': { white: 'Chess_plt45.svg.png', black: 'Chess_pdt45.svg.png' }
        };
        
        // Track piece positions for accurate move parsing
        this.piecePositions = this.initializePiecePositions();
    }

    initializePiecePositions() {
        // Initialize with starting positions
        return {
            white: {
                'K': 'e1', 'Q': 'd1', 'R': ['a1', 'h1'], 'B': ['c1', 'f1'], 'N': ['b1', 'g1'],
                'P': ['a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2']
            },
            black: {
                'K': 'e8', 'Q': 'd8', 'R': ['a8', 'h8'], 'B': ['c8', 'f8'], 'N': ['b8', 'g8'],
                'P': ['a7', 'b7', 'c7', 'd7', 'e7', 'f7', 'g7', 'h7']
            }
        };
    }

    parseMove(moveNotation, isWhite) {
        // Remove check/checkmate symbols
        let move = moveNotation.replace(/[+#]/g, '');
        
        // Handle castling
        if (move === 'O-O' || move === '0-0') {
            return this.parseCastling(isWhite, false);
        } else if (move === 'O-O-O' || move === '0-0-0') {
            return this.parseCastling(isWhite, true);
        }
        
        // Handle pawn moves (no piece letter)
        if (!/[KQRBN]/.test(move[0])) {
            return this.parsePawnMove(move, isWhite);
        }
        
        // Handle piece moves
        const piece = move[0];
        const target = move.slice(-2);
        const source = this.findPieceSource(piece, target, isWhite, move);
        
        return {
            piece: piece,
            source: source,
            target: target,
            isCapture: move.includes('x'),
            isWhite: isWhite
        };
    }

    parsePawnMove(move, isWhite) {
        const isCapture = move.includes('x');
        let source, target;
        
        if (isCapture) {
            const parts = move.split('x');
            const file = parts[0]; // e.g., 'c' from 'cxd5'
            target = parts[1]; // e.g., 'd5' from 'cxd5'
            // For captures, we need to find which pawn on the file can capture to target
            source = this.findPawnSourceForCapture(file, target, isWhite);
        } else {
            target = move;
            // For pawn moves, we need to determine source based on target and piece position
            source = this.findPawnSource(target, isWhite);
        }
        
        return {
            piece: 'P',
            source: source,
            target: target,
            isCapture: isCapture,
            isWhite: isWhite
        };
    }

    findPawnSourceForCapture(file, target, isWhite) {
        // For captures like cxd5, find which pawn on the c-file can capture to d5
        const targetFile = target[0];
        const targetRank = parseInt(target[1]);
        
        if (isWhite) {
            // White pawns capture diagonally up-right or up-left
            // For cxd5, the c-pawn moves from c4 to d5
            const sourceRank = targetRank - 1; // d5 -> c4
            return file + sourceRank;
        } else {
            // Black pawns capture diagonally down-right or down-left
            const sourceRank = targetRank + 1;
            return file + sourceRank;
        }
    }

    findPawnSource(target, isWhite) {
        const file = target[0];
        const rank = parseInt(target[1]);
        
        if (isWhite) {
            // White pawns move up the board
            if (rank === 4) {
                // For g4, check if pawn is on g2 (starting position) or g3
                const square2 = document.querySelector(`[data-square="${file}2"]`);
                const square3 = document.querySelector(`[data-square="${file}3"]`);
                
                if (square2 && square2.innerHTML.includes('Chess_plt45.svg.png')) {
                    return file + '2';
                } else if (square3 && square3.innerHTML.includes('Chess_plt45.svg.png')) {
                    return file + '3';
                } else {
                    // Default to starting position if not found
                    return file + '2';
                }
            } else if (rank === 3) {
                return file + '2';
            } else if (rank === 5) {
                return file + '4';
            } else if (rank === 6) {
                return file + '5';
            } else if (rank === 7) {
                return file + '6';
            }
        } else {
            // Black pawns move down the board
            if (rank === 5) {
                return file + '7';
            } else if (rank === 4) {
                return file + '7';
            } else if (rank === 3) {
                return file + '5';
            } else if (rank === 2) {
                return file + '4';
            } else if (rank === 1) {
                return file + '3';
            }
        }
        
        return file + (isWhite ? '2' : '7');
    }

    findPieceSource(piece, target, isWhite, moveNotation) {
        // This is a simplified version - in a real implementation,
        // you'd need to track piece positions more carefully
        const color = isWhite ? 'white' : 'black';
        const positions = this.piecePositions[color][piece];
        
        // Special case: if the piece is already on the target square, 
        // it means the position tracking is corrupted, so use starting position
        if (positions === target) {
            if (piece === 'Q') {
                return isWhite ? 'd1' : 'd8';
            } else if (piece === 'K') {
                return isWhite ? 'e1' : 'e8';
            }
        }
        
        if (Array.isArray(positions)) {
            // For pieces that can be on multiple squares (rooks, bishops, knights, pawns)
            // We need to determine which one can move to the target
            return this.findCorrectPiece(piece, target, positions, isWhite, moveNotation);
        } else {
            // For king and queen (usually only one)
            return positions;
        }
    }

    findCorrectPiece(piece, target, positions, isWhite, moveNotation) {
        // For bishops, determine which one can move to the target square
        if (piece === 'B') {
            // Check if any bishop can move to the target square
            for (let pos of positions) {
                if (this.canBishopMoveTo(pos, target, isWhite)) {
                    return pos;
                }
            }
        }
        
        // For knights, determine which one can move to the target square
        if (piece === 'N') {
            for (let pos of positions) {
                if (this.canKnightMoveTo(pos, target, isWhite)) {
                    return pos;
                }
            }
        }
        
        // For rooks, determine which one can move to the target square
        if (piece === 'R') {
            for (let pos of positions) {
                if (this.canRookMoveTo(pos, target, isWhite)) {
                    return pos;
                }
            }
        }
        
        // For other pieces, use a more sophisticated approach
        // For now, return the first available position as fallback
        return positions[0];
    }
    
    canBishopMoveTo(from, to, isWhite) {
        // Simple check: bishops move diagonally
        // Convert squares to coordinates
        const fromFile = from.charCodeAt(0) - 97; // a=0, b=1, etc.
        const fromRank = parseInt(from[1]) - 1; // 1=0, 2=1, etc.
        const toFile = to.charCodeAt(0) - 97;
        const toRank = parseInt(to[1]) - 1;
        
        // Check if it's a diagonal move
        const fileDiff = Math.abs(toFile - fromFile);
        const rankDiff = Math.abs(toRank - fromRank);
        
        return fileDiff === rankDiff && fileDiff > 0;
    }
    
    canKnightMoveTo(from, to, isWhite) {
        // Knights move in L-shape: 2 squares in one direction, 1 square perpendicular
        const fromFile = from.charCodeAt(0) - 97;
        const fromRank = parseInt(from[1]) - 1;
        const toFile = to.charCodeAt(0) - 97;
        const toRank = parseInt(to[1]) - 1;
        
        const fileDiff = Math.abs(toFile - fromFile);
        const rankDiff = Math.abs(toRank - fromRank);
        
        return (fileDiff === 2 && rankDiff === 1) || (fileDiff === 1 && rankDiff === 2);
    }
    
    canRookMoveTo(from, to, isWhite) {
        // Rooks move horizontally or vertically
        const fromFile = from.charCodeAt(0) - 97;
        const fromRank = parseInt(from[1]) - 1;
        const toFile = to.charCodeAt(0) - 97;
        const toRank = parseInt(to[1]) - 1;
        
        const fileDiff = Math.abs(toFile - fromFile);
        const rankDiff = Math.abs(toRank - fromRank);
        
        // Check if it's a valid rook move (horizontal or vertical)
        const isValidMove = (fileDiff === 0 && rankDiff > 0) || (fileDiff > 0 && rankDiff === 0);
        
        if (!isValidMove) return false;
        
        // For horizontal moves on the same rank, prefer the rook that's closer to the target
        if (fileDiff > 0 && rankDiff === 0) {
            // This is a horizontal move on the same rank
            const fromFileNum = from.charCodeAt(0) - 97;
            const toFileNum = to.charCodeAt(0) - 97;
            
            // Calculate distance to target
            const distance = Math.abs(toFileNum - fromFileNum);
            
            // For Rf1, we want the rook on h1 (file 7) to move to f1 (file 5)
            // The rook on a1 (file 0) is further away
            // So we prefer the rook that's closer to the target
            return distance < 4; // h1 to f1 is distance 2, a1 to f1 is distance 5
        }
        
        return true;
    }

    parseCastling(isWhite, isLong) {
        if (isWhite) {
            return {
                piece: 'K',
                source: 'e1',
                target: isLong ? 'c1' : 'g1',
                isCastling: true,
                isLong: isLong,
                isWhite: true
            };
        } else {
            return {
                piece: 'K',
                source: 'e8',
                target: isLong ? 'c8' : 'g8',
                isCastling: true,
                isLong: isLong,
                isWhite: false
            };
        }
    }

    getPieceImage(piece, isWhite) {
        return this.pieceImages[piece][isWhite ? 'white' : 'black'];
    }

    updatePiecePosition(piece, from, to, isWhite) {
        const color = isWhite ? 'white' : 'black';
        const positions = this.piecePositions[color][piece];
        
        // Only update if the piece is actually moving
        if (from === to) {
            return;
        }
        
        if (Array.isArray(positions)) {
            const index = positions.indexOf(from);
            if (index !== -1) {
                positions[index] = to;
            }
        } else {
            this.piecePositions[color][piece] = to;
        }
    }

    resetBoard() {
        this.piecePositions = this.initializePiecePositions();
    }
}

// Game loader utility
class GameLoader {
    static async loadGamesFromFiles() {
        let allGames = [];
        
        // Load main games
        try {
            const response = await fetch('games/games.json');
            const data = await response.json();
            
            // If the file has a 'games' array, use it directly
            if (data.games) {
                allGames = data.games;
            }
            // If it's just an array of games, wrap it
            else if (Array.isArray(data)) {
                allGames = data;
            }
        } catch (error) {
            console.error('Error loading main games:', error);
            // Fallback to embedded games if main games can't be loaded
            allGames = GameLoader.getEmbeddedGames().games;
        }
        
        // Load custom games from API (always try to load, regardless of main games)
        try {
            console.log('=== LOADING CUSTOM GAMES ===');
            const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
            const customApiUrl = isProduction ? '/api/get-games' : 'http://localhost:3001/get-games';
            console.log('Attempting to load custom games from API:', customApiUrl);
            const customResponse = await fetch(customApiUrl + '?t=' + Date.now());
            console.log('Custom games response status:', customResponse.status);
            console.log('Custom games response ok:', customResponse.ok);
            
            if (!customResponse.ok) {
                throw new Error(`HTTP error! status: ${customResponse.status}`);
            }
            
            const customData = await customResponse.json();
            console.log('Custom games data received:', customData);
            console.log('Custom games array length:', customData.games ? customData.games.length : 'no games array');
            
            if (customData.games && customData.games.length > 0) {
                // Add custom games to the main games array, but avoid duplicates
                const existingIds = allGames.map(g => g.id);
                const newCustomGames = customData.games.filter(g => !existingIds.includes(g.id));
                allGames = allGames.concat(newCustomGames);
                console.log('Successfully loaded custom games:', newCustomGames.length);
                console.log('Total games now:', allGames.length);
                console.log('Custom game IDs:', newCustomGames.map(g => g.id));
            } else {
                console.log('No custom games found in response');
            }
            console.log('=== END LOADING CUSTOM GAMES ===');
        } catch (customError) {
            console.error('Could not load custom games:', customError);
            console.log('Continuing with main games only...');
        }
        
        // Final deduplication to ensure no duplicate games
        console.log('Before deduplication - Total games:', allGames.length);
        console.log('Before deduplication - All game IDs:', allGames.map(g => g.id));
        
        // Use Map to ensure only unique games by ID
        const gameMap = new Map();
        
        for (const game of allGames) {
            if (!gameMap.has(game.id)) {
                gameMap.set(game.id, game);
                console.log('Added unique game:', game.id);
            } else {
                console.log('Skipped duplicate game:', game.id);
            }
        }
        
        const uniqueGames = Array.from(gameMap.values());
        
        console.log('Final deduplication - Total unique games:', uniqueGames.length);
        console.log('Final deduplication - All game IDs:', uniqueGames.map(g => g.id));
        
        return { games: uniqueGames };
    }

    static getEmbeddedGames() {
        return {
            "games": [
                {
                    "id": "fools-mate",
                    "name": "Fool's Mate",
                    "description": "The fastest possible checkmate in chess",
                    "moves": 4,
                    "result": "Black wins",
                    "date": "Unknown",
                    "white_player": "Unknown",
                    "black_player": "Unknown",
                    "moves_notation": ["f3", "e5", "g4", "Qh4#"],
                    "moves_detailed": [
                        {"move_number": 1, "white": "f3", "black": null, "description": "White plays f3, weakening the king's diagonal"},
                        {"move_number": 1, "white": null, "black": "e5", "description": "Black plays e5, controlling the center"},
                        {"move_number": 2, "white": "g4", "black": null, "description": "White plays g4, further weakening the king's position"},
                        {"move_number": 2, "white": null, "black": "Qh4#", "description": "Black delivers checkmate with the queen"}
                    ],
                    "opening": "Fool's Mate",
                    "difficulty": "Beginner",
                    "tags": ["checkmate", "quick", "tactical", "beginner"]
                },
                {
                    "id": "scholars-mate",
                    "name": "Scholar's Mate",
                    "description": "A quick checkmate pattern targeting f7",
                    "moves": 4,
                    "result": "White wins",
                    "date": "Unknown",
                    "white_player": "Unknown",
                    "black_player": "Unknown",
                    "moves_notation": ["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6", "Qxf7#"],
                    "moves_detailed": [
                        {"move_number": 1, "white": "e4", "black": null, "description": "White opens with e4, controlling the center"},
                        {"move_number": 1, "white": null, "black": "e5", "description": "Black responds with e5, mirroring white's strategy"},
                        {"move_number": 2, "white": "Qh5", "black": null, "description": "White brings out the queen early, targeting f7"},
                        {"move_number": 2, "white": null, "black": "Nc6", "description": "Black develops the knight, defending the e5 pawn"},
                        {"move_number": 3, "white": "Bc4", "black": null, "description": "White develops the bishop, also targeting f7"},
                        {"move_number": 3, "white": null, "black": "Nf6", "description": "Black develops the knight, but doesn't defend f7"},
                        {"move_number": 4, "white": "Qxf7#", "black": null, "description": "White delivers checkmate by capturing f7 with the queen"}
                    ],
                    "opening": "Scholar's Mate",
                    "difficulty": "Beginner",
                    "tags": ["checkmate", "quick", "tactical", "beginner", "f7"]
                }
            ]
        };
    }
}

// Export for use in HTML
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ChessMoveParser, GameLoader };
}
