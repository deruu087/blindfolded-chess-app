// Custom Games Handler
// This file will handle custom made chess games

let customGameMode = false;
let currentTurn = 'white'; // 'white' or 'black'
let customGameMoves = [];
let customGamePosition = {};
let customMoveIndex = 0; // Track current position in custom game moves

// Helper: parse algebraic square like "e5" -> {file: 'e', rank: 5}
function parseSquare(sq) {
    return { file: sq[0], rank: parseInt(sq[1], 10) };
}

// Helper to convert file letter -> 0-based index
function fileIndex(fileChar) {
    return fileChar.charCodeAt(0) - 'a'.charCodeAt(0);
}

// Convert algebraic square to 0-based coordinates [rank, file]
function squareToCoords(square) {
    const file = square[0].charCodeAt(0) - 'a'.charCodeAt(0); // 0-7
    const rank = 8 - parseInt(square[1]); // 0-7 (0 = rank 8, 7 = rank 1)
    return [rank, file];
}

// Convert 0-based coordinates to algebraic square
function coordsToSquare(coords) {
    const [rank, file] = coords;
    const fileChar = String.fromCharCode('a'.charCodeAt(0) + file);
    const rankNum = 8 - rank;
    return fileChar + rankNum;
}

// Simplified en passant detection function
function checkEnPassantAvailable(pawnPos, targetPos, lastMoveFrom, lastMoveTo, lastMovePiece, lastMoveColor, currentColor) {
    console.log('=== CHECKING EN PASSANT ===');
    console.log('Pawn pos:', pawnPos);
    console.log('Target pos:', targetPos);
    console.log('Last move from:', lastMoveFrom);
    console.log('Last move to:', lastMoveTo);
    console.log('Last move piece:', lastMovePiece);
    console.log('Last move color:', lastMoveColor);
    console.log('Current color:', currentColor);
    
    // Check if last move was a double pawn move (2 squares)
    const lastMoveRankDiff = Math.abs(lastMoveTo[0] - lastMoveFrom[0]);
    const lastMoveFileDiff = Math.abs(lastMoveTo[1] - lastMoveFrom[1]);
    
    console.log('Last move rank diff:', lastMoveRankDiff, 'file diff:', lastMoveFileDiff);
    
    if (!lastMovePiece || lastMovePiece.toLowerCase() !== 'p' || lastMoveRankDiff !== 2 || lastMoveFileDiff !== 0) {
        console.log('FAIL: Last move was not a double pawn move');
        return { isEnPassantAvailable: false };
    }
    
    // Check if current move is diagonal (en passant capture)
    const currentMoveRankDiff = Math.abs(targetPos[0] - pawnPos[0]);
    const currentMoveFileDiff = Math.abs(targetPos[1] - pawnPos[1]);
    
    console.log('Current move rank diff:', currentMoveRankDiff, 'file diff:', currentMoveFileDiff);
    
    if (currentMoveRankDiff !== 1 || currentMoveFileDiff !== 1) {
        console.log('FAIL: Current move is not diagonal');
        return { isEnPassantAvailable: false };
    }
    
    // Check if the capturing pawn is on the same rank as the opponent's pawn after the double move
    const [pawnRank, pawnFile] = pawnPos;
    const [lastMoveToRank, lastMoveToFile] = lastMoveTo;
    
    console.log('Pawn rank:', pawnRank, 'file:', pawnFile);
    console.log('Last move to rank:', lastMoveToRank, 'file:', lastMoveToFile);
    console.log('Same rank?', lastMoveToRank === pawnRank);
    console.log('File diff:', Math.abs(lastMoveToFile - pawnFile));
    
    if (lastMoveToRank !== pawnRank || Math.abs(lastMoveToFile - pawnFile) !== 1) {
        console.log('FAIL: Capturing pawn not adjacent to opponent pawn');
        return { isEnPassantAvailable: false };
    }
    
    // Check if the target square is the "passed-through" square
    const passedThroughRank = (lastMoveFrom[0] + lastMoveTo[0]) / 2;
    const passedThroughFile = lastMoveTo[1];
    
    console.log('Target rank:', targetPos[0], 'file:', targetPos[1]);
    console.log('Passed through rank:', passedThroughRank, 'file:', passedThroughFile);
    console.log('Target matches passed through?', targetPos[0] === passedThroughRank && targetPos[1] === passedThroughFile);
    
    if (targetPos[0] !== passedThroughRank || targetPos[1] !== passedThroughFile) {
        console.log('FAIL: Not moving to passed-through square');
        return { isEnPassantAvailable: false };
    }
    
    // All conditions met - en passant is available
    console.log('SUCCESS: En passant conditions met!');
    return {
        isEnPassantAvailable: true,
        captured: lastMoveTo // The square containing the pawn to be removed
    };
}

// Function to initialize custom game mode
function initializeCustomGameMode() {
    console.log('Initializing custom game mode...');
    
    customGameMode = true;
    window.customGameMode = true;
    currentTurn = 'white';
    customGameMoves = [];
    customMoveIndex = 0;
    
    // Clear any existing game selection and highlight the Add Game button
    document.querySelectorAll('.submenu-button').forEach(btn => {
        btn.classList.remove('selected');
    });
    const addGameButton = document.getElementById('add-game-my-btn');
    if (addGameButton) {
        addGameButton.classList.add('selected');
    }
    
    // Set up the board with all pieces in starting position
    setupCustomGameBoard();
    
    // Add event listeners for piece movement
    addCustomGameEventListeners();
    
    // Set up the moves display (but keep it hidden initially)
    setupCustomMovesDisplay();
    
    // Hide the moves list initially - it will appear after first move
    const movesList = document.getElementById('moves-list');
    if (movesList) {
        movesList.style.display = 'none';
    }
    
    // Hide the custom game info section initially - it will appear after first move
    const customGameInfo = document.getElementById('custom-game-info');
    if (customGameInfo) {
        customGameInfo.style.display = 'none';
    }
    
    // Don't show the custom game info section yet - it will appear after first move
    
    // Hide comment section for custom game mode
    const commentSection = document.getElementById('comment-section');
    if (commentSection) {
        commentSection.style.display = 'none';
    }
    
    // Hide any existing game info sections from previous games
    const gameHeader = document.getElementById('game-header');
    const gameDetails = document.getElementById('game-details');
    if (gameHeader) {
        gameHeader.style.display = 'none';
    }
    if (gameDetails) {
        gameDetails.style.display = 'none';
    }
    
    // Hide the custom commentary section initially - it will appear after first move
    if (typeof hideCustomCommentarySection === 'function') {
        hideCustomCommentarySection();
    }
    
    // Hide the delete game button - it should never appear in Add Game mode
    const deleteGameSection = document.getElementById('delete-game-section');
    if (deleteGameSection) {
        deleteGameSection.style.display = 'none';
    }
}

// Function to set up the custom game board with all pieces
function setupCustomGameBoard() {
    console.log('Setting up custom game board with all pieces...');
    
    // Get the main chess board
    const board = document.getElementById('chess-board');
    if (!board) {
        console.error('Chess board not found');
        return;
    }
    
    // Clear the board first
    clearBoard();
    
    // Set up the initial position with all pieces
    const initialPosition = getInitialPosition();
    
    // Place pieces on the board
    Object.keys(initialPosition).forEach(square => {
        const piece = initialPosition[square];
        if (piece) {
            placePieceOnSquare(square, piece);
        }
    });
    
    console.log('Custom game board setup complete!');
}

// Function to clear the board
function clearBoard() {
    const board = document.getElementById('chess-board');
    if (!board) return;
    
    // Clear all squares
    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
            const square = document.querySelector(`[data-square="${String.fromCharCode(97 + j)}${8 - i}"]`);
            if (square) {
                square.innerHTML = '';
            }
        }
    }
}

// Function to get the initial chess position (starting position)
function getInitialPosition() {
    return {
        'a8': 'r', 'b8': 'n', 'c8': 'b', 'd8': 'q', 'e8': 'k', 'f8': 'b', 'g8': 'n', 'h8': 'r',
        'a7': 'p', 'b7': 'p', 'c7': 'p', 'd7': 'p', 'e7': 'p', 'f7': 'p', 'g7': 'p', 'h7': 'p',
        'a6': '', 'b6': '', 'c6': '', 'd6': '', 'e6': '', 'f6': '', 'g6': '', 'h6': '',
        'a5': '', 'b5': '', 'c5': '', 'd5': '', 'e5': '', 'f5': '', 'g5': '', 'h5': '',
        'a4': '', 'b4': '', 'c4': '', 'd4': '', 'e4': '', 'f4': '', 'g4': '', 'h4': '',
        'a3': '', 'b3': '', 'c3': '', 'd3': '', 'e3': '', 'f3': '', 'g3': '', 'h3': '',
        'a2': 'P', 'b2': 'P', 'c2': 'P', 'd2': 'P', 'e2': 'P', 'f2': 'P', 'g2': 'P', 'h2': 'P',
        'a1': 'R', 'b1': 'N', 'c1': 'B', 'd1': 'Q', 'e1': 'K', 'f1': 'B', 'g1': 'N', 'h1': 'R'
    };
}

// Function to place a piece on a specific square
function placePieceOnSquare(square, piece) {
    const squareElement = document.querySelector(`[data-square="${square}"]`);
    if (!squareElement) {
        console.error(`Square ${square} not found`);
        return;
    }
    
    // Create piece element
    const pieceElement = document.createElement('div');
    pieceElement.className = 'piece';
    pieceElement.draggable = true;
    pieceElement.dataset.piece = piece;
    pieceElement.dataset.square = square;
    
    // Set piece image based on piece type
    const pieceImages = {
        'K': 'Chess_klt45.svg.png', 'Q': 'Chess_qlt45.svg.png', 'R': 'Chess_rlt45.svg.png',
        'B': 'Chess_blt45.svg.png', 'N': 'Chess_nlt45.svg.png', 'P': 'Chess_plt45.svg.png',
        'k': 'Chess_kdt45.svg.png', 'q': 'Chess_qdt45.svg.png', 'r': 'Chess_rdt45.svg.png',
        'b': 'Chess_bdt45.svg.png', 'n': 'Chess_ndt45.svg.png', 'p': 'Chess_pdt45.svg.png'
    };
    
    pieceElement.style.backgroundImage = `url('pieces/${pieceImages[piece]}')`;
    pieceElement.style.backgroundSize = 'contain';
    pieceElement.style.backgroundRepeat = 'no-repeat';
    pieceElement.style.backgroundPosition = 'center';
    pieceElement.style.width = '100%';
    pieceElement.style.height = '100%';
    pieceElement.style.cursor = 'grab';
    
    squareElement.appendChild(pieceElement);
}

// Function to add event listeners for custom game
function addCustomGameEventListeners() {
    // Add click event listeners to all pieces
    const pieces = document.querySelectorAll('.piece');
    pieces.forEach(piece => {
        // Remove main game event listeners to prevent conflicts
        piece.removeEventListener('dragstart', handleDragStart);
        piece.removeEventListener('dragend', handleDragEnd);
        piece.removeEventListener('click', handlePieceClick);
        
        // Add custom game event listeners
        piece.addEventListener('click', handleCustomPieceClick);
        piece.addEventListener('dragstart', handleCustomDragStart);
        piece.addEventListener('dragend', handleCustomDragEnd);
    });
    
    // Add click event listeners to all squares
    const squares = document.querySelectorAll('[data-square]');
    squares.forEach(square => {
        square.addEventListener('click', handleCustomSquareClick);
        // Add drag and drop event listeners
        square.addEventListener('dragover', handleCustomDragOver);
        square.addEventListener('drop', handleCustomDragDrop);
    });
}

// Function to handle piece clicks in custom game mode
function handleCustomPieceClick(e) {
    if (!customGameMode) return;
    
    e.stopPropagation();
    const piece = e.target;
    const pieceType = piece.dataset.piece;
    const square = piece.dataset.square;
    
    // Check if it's the correct turn
    const isWhitePiece = pieceType === pieceType.toUpperCase();
    const isBlackPiece = pieceType === pieceType.toLowerCase();
    
    if ((currentTurn === 'white' && !isWhitePiece) || (currentTurn === 'black' && !isBlackPiece)) {
        console.log(`It's ${currentTurn}'s turn, not ${isWhitePiece ? 'white' : 'black'}'s turn`);
        return;
    }
    
    // Highlight valid moves for this piece
    highlightValidMovesForPiece(square, pieceType);
    
    // Store selected piece
    window.selectedCustomPiece = piece;
    window.selectedCustomSquare = square;
}

// Function to handle square clicks in custom game mode
function handleCustomSquareClick(e) {
    if (!customGameMode) return;
    
    const square = e.currentTarget;
    const squareNotation = square.dataset.square;
    
    // If we have a selected piece, try to move it
    if (window.selectedCustomPiece && window.selectedCustomSquare) {
        const fromSquare = window.selectedCustomSquare;
        const piece = window.selectedCustomPiece;
        const pieceType = piece.dataset.piece;
        
        // Check if this is a valid move
        if (isValidMove(fromSquare, squareNotation, pieceType)) {
            makeCustomMove(fromSquare, squareNotation, pieceType);
        }
        
        // Clear selection
        clearCustomSelection();
    }
}

// Function to highlight valid moves for a piece
function highlightValidMovesForPiece(fromSquare, pieceType) {
    // Clear previous highlights
    clearHighlights();
    
    // Get all possible moves for this piece
    const validMoves = getValidMovesForPiece(fromSquare, pieceType);
    
    // Highlight valid destination squares
    validMoves.forEach(square => {
        const squareElement = document.querySelector(`[data-square="${square}"]`);
        if (squareElement) {
            squareElement.classList.add('valid-move');
        }
    });
}

// Function to get valid moves for a piece
function getValidMovesForPiece(fromSquare, pieceType) {
    const validMoves = [];
    const fromFile = fromSquare.charCodeAt(0) - 97; // a=0, b=1, etc.
    const fromRank = parseInt(fromSquare[1]) - 1; // 1=0, 2=1, etc.
    
    // Get current position
    const currentPosition = getCurrentCustomPosition();
    
    // Basic move validation (simplified for now)
    for (let file = 0; file < 8; file++) {
        for (let rank = 0; rank < 8; rank++) {
            const toSquare = String.fromCharCode(97 + file) + (rank + 1);
            
            if (toSquare !== fromSquare && isValidMove(fromSquare, toSquare, pieceType)) {
                validMoves.push(toSquare);
            }
        }
    }
    
    return validMoves;
}

// Function to check if a move is valid
function isValidMove(fromSquare, toSquare, pieceType) {
    const currentPosition = getCurrentCustomPosition();
    const targetPiece = currentPosition[toSquare];
    
    // Check if target square has a piece of the same color
    const isWhitePiece = pieceType === pieceType.toUpperCase();
    const isTargetWhite = targetPiece && targetPiece === targetPiece.toUpperCase();
    
    if (targetPiece && isWhitePiece === isTargetWhite) {
        return false; // Can't capture own piece
    }
    
    // Basic piece movement validation
    const fromFile = fromSquare.charCodeAt(0) - 97; // a=0, b=1, etc.
    const fromRank = parseInt(fromSquare[1]) - 1; // 1=0, 2=1, etc.
    const toFile = toSquare.charCodeAt(0) - 97;
    const toRank = parseInt(toSquare[1]) - 1;
    
    const fileDiff = Math.abs(toFile - fromFile);
    const rankDiff = Math.abs(toRank - fromRank);
    
    // Pawn movement
    if (pieceType.toLowerCase() === 'p') {
        const direction = isWhitePiece ? 1 : -1;
        const startRank = isWhitePiece ? 1 : 6;
        
        // Forward move (one square)
        if (fileDiff === 0 && toRank === fromRank + direction && !targetPiece) {
            return true;
        }
        
        // Forward move (two squares from start)
        if (fileDiff === 0 && fromRank === startRank && toRank === fromRank + 2 * direction && !targetPiece) {
            return true;
        }
        
        // Diagonal capture
        if (fileDiff === 1 && toRank === fromRank + direction && targetPiece) {
            return true;
        }
        
        // Check for en passant capture (diagonal move to empty square)
        if (fileDiff === 1 && toRank === fromRank + direction && !targetPiece && customGameMoves.length > 0) {
            console.log('=== CHECKING EN PASSANT IN isValidMove ===');
            console.log('From:', fromSquare, 'To:', toSquare);
            console.log('Current turn:', currentTurn);
            
            const lastMove = customGameMoves[customGameMoves.length - 1];
            console.log('Last move:', lastMove);
            
            // Convert to coordinates
            const fromCoords = squareToCoords(fromSquare);
            const toCoords = squareToCoords(toSquare);
            const lastMoveFrom = squareToCoords(lastMove.from);
            const lastMoveTo = squareToCoords(lastMove.to);
            
            console.log('From coords:', fromCoords, 'To coords:', toCoords);
            console.log('Last move from:', lastMoveFrom, 'Last move to:', lastMoveTo);
            
            // Check if last move was a double pawn move
            const lastMoveRankDiff = Math.abs(lastMoveTo[0] - lastMoveFrom[0]);
            const lastMoveFileDiff = Math.abs(lastMoveTo[1] - lastMoveFrom[1]);
            
            console.log('Last move rank diff:', lastMoveRankDiff, 'file diff:', lastMoveFileDiff);
            
            if (lastMove.piece && lastMove.piece.toLowerCase() === 'p' && lastMoveRankDiff === 2 && lastMoveFileDiff === 0) {
                console.log('Last move was a double pawn move!');
                
                // Check if the capturing pawn is on the same rank as the opponent's pawn after the double move
                const [pawnRank, pawnFile] = fromCoords;
                const [lastMoveToRank, lastMoveToFile] = lastMoveTo;
                
                console.log('Pawn rank:', pawnRank, 'file:', pawnFile);
                console.log('Last move to rank:', lastMoveToRank, 'file:', lastMoveToFile);
                console.log('Same rank?', lastMoveToRank === pawnRank);
                console.log('File diff:', Math.abs(lastMoveToFile - pawnFile));
                
                if (lastMoveToRank === pawnRank && Math.abs(lastMoveToFile - pawnFile) === 1) {
                    console.log('Capturing pawn is adjacent to opponent pawn!');
                    
                    // Check if the target square is the "passed-through" square
                    const passedThroughRank = (lastMoveFrom[0] + lastMoveTo[0]) / 2;
                    const passedThroughFile = lastMoveTo[1];
                    
                    console.log('Target rank:', toCoords[0], 'file:', toCoords[1]);
                    console.log('Passed through rank:', passedThroughRank, 'file:', passedThroughFile);
                    console.log('Target matches passed through?', toCoords[0] === passedThroughRank && toCoords[1] === passedThroughFile);
                    
                    if (toCoords[0] === passedThroughRank && toCoords[1] === passedThroughFile) {
                        console.log('✅ EN PASSANT IS VALID!');
                        return true;
                    }
                }
            }
            
            console.log('En passant not valid');
        }
        
        return false;
    }
    
    // Rook movement
    if (pieceType.toLowerCase() === 'r') {
        return (fileDiff === 0 || rankDiff === 0) && isPathClear(fromSquare, toSquare, currentPosition);
    }
    
    // Bishop movement
    if (pieceType.toLowerCase() === 'b') {
        return fileDiff === rankDiff && isPathClear(fromSquare, toSquare, currentPosition);
    }
    
    // Queen movement
    if (pieceType.toLowerCase() === 'q') {
        return (fileDiff === rankDiff || fileDiff === 0 || rankDiff === 0) && isPathClear(fromSquare, toSquare, currentPosition);
    }
    
    // King movement
    if (pieceType.toLowerCase() === 'k') {
        return fileDiff <= 1 && rankDiff <= 1;
    }
    
    // Knight movement
    if (pieceType.toLowerCase() === 'n') {
        return (fileDiff === 2 && rankDiff === 1) || (fileDiff === 1 && rankDiff === 2);
    }
    
    return false;
}

// Function to check if path is clear for sliding pieces
function isPathClear(fromSquare, toSquare, position) {
    const fromFile = fromSquare.charCodeAt(0) - 97;
    const fromRank = parseInt(fromSquare[1]) - 1;
    const toFile = toSquare.charCodeAt(0) - 97;
    const toRank = parseInt(toSquare[1]) - 1;
    
    const fileStep = toFile > fromFile ? 1 : toFile < fromFile ? -1 : 0;
    const rankStep = toRank > fromRank ? 1 : toRank < fromRank ? -1 : 0;
    
    let currentFile = fromFile + fileStep;
    let currentRank = fromRank + rankStep;
    
    while (currentFile !== toFile || currentRank !== toRank) {
        const square = String.fromCharCode(97 + currentFile) + (currentRank + 1);
        if (position[square]) {
            return false; // Path is blocked
        }
        currentFile += fileStep;
        currentRank += rankStep;
    }
    
    return true;
}

// Function to make a move in custom game
function makeCustomMove(fromSquare, toSquare, pieceType) {
    console.log(`Making move: ${pieceType} from ${fromSquare} to ${toSquare}`);
    
    // Get the source and destination squares
    const fromSquareElement = document.querySelector(`[data-square="${fromSquare}"]`);
    const toSquareElement = document.querySelector(`[data-square="${toSquare}"]`);
    
    if (!fromSquareElement || !toSquareElement) {
        console.error('Source or destination square not found');
        return;
    }
    
    // Get the piece element
    const pieceElement = fromSquareElement.querySelector('.piece');
    if (!pieceElement) {
        console.error('Piece not found on source square');
        return;
    }
    
    // Check if this is a capture (before moving the piece)
    const destinationPiece = toSquareElement.querySelector('.piece');
    const isCapture = destinationPiece !== null;
    
    // Check for en passant capture using proper chess rules
    let isEnPassant = false;
    let enPassantCapturedSquare = null;

    console.log('=== EN PASSANT DEBUG ===');
    console.log('Piece type:', pieceType);
    console.log('Is capture:', isCapture);
    console.log('Custom game moves length:', customGameMoves.length);
    console.log('Current turn:', currentTurn);

    if (pieceType.toLowerCase() === 'p' && !isCapture && customGameMoves.length > 0) {
        const lastMove = customGameMoves[customGameMoves.length - 1];
        console.log('Last move:', lastMove);
        
        // Convert algebraic notation to 0-based coordinates
        const fromCoords = squareToCoords(fromSquare);
        const toCoords = squareToCoords(toSquare);
        const lastMoveFrom = squareToCoords(lastMove.from);
        const lastMoveTo = squareToCoords(lastMove.to);
        
        console.log('From coords:', fromCoords, 'To coords:', toCoords);
        console.log('Last move from:', lastMoveFrom, 'Last move to:', lastMoveTo);
        
        // Only check for en passant if the current move is diagonal (potential en passant capture)
        const currentMoveRankDiff = Math.abs(toCoords[0] - fromCoords[0]);
        const currentMoveFileDiff = Math.abs(toCoords[1] - fromCoords[1]);
        
        console.log('Current move rank diff:', currentMoveRankDiff, 'file diff:', currentMoveFileDiff);
        
        if (currentMoveRankDiff === 1 && currentMoveFileDiff === 1) {
            console.log('Diagonal move detected - checking for en passant');
            
            // Check if en passant is available
            const enPassantResult = checkEnPassantAvailable(
                fromCoords, 
                toCoords, 
                lastMoveFrom, 
                lastMoveTo, 
                lastMove.piece, 
                lastMove.turn, 
                currentTurn
            );
            
            console.log('En passant result:', enPassantResult);
            
            if (enPassantResult.isEnPassantAvailable) {
                isEnPassant = true;
                enPassantCapturedSquare = coordsToSquare(enPassantResult.captured);
                console.log('En passant detected! Capturing pawn on', enPassantCapturedSquare);
            }
        } else {
            console.log('Not a diagonal move - skipping en passant check');
        }
    } else {
        console.log('En passant check skipped - not a pawn move or no previous moves');
    }
    
    // Move the piece visually
    console.log('Moving piece from', fromSquare, 'to', toSquare);
    
    // Clear the destination square first
    toSquareElement.innerHTML = '';
    
    // Move the piece to the new square
    toSquareElement.appendChild(pieceElement);
    
    // Update the piece's data attributes
    pieceElement.dataset.square = toSquare;
    
    // Clear the source square
    fromSquareElement.innerHTML = '';
    
    // Handle en passant capture
    if (isEnPassant && enPassantCapturedSquare) {
        const enPassantElement = document.querySelector(`[data-square="${enPassantCapturedSquare}"]`);
        if (enPassantElement) {
            enPassantElement.innerHTML = '';
            console.log('En passant: Removed captured pawn from', enPassantCapturedSquare);
        }
    }
    
    console.log('Piece moved successfully');
    
    // Record the move
    const moveNumber = Math.floor(customGameMoves.length / 2) + 1;
    
    // Create proper chess notation
    let moveNotation;
    
    if (pieceType.toLowerCase() === 'p') {
        // For pawns
        if (isCapture) {
            // Capture notation: e.g., exd5 (pawn from e4 captures on d5)
            moveNotation = `${fromSquare[0]}x${toSquare}`;
        } else if (isEnPassant) {
            // En passant notation: e.g., exd6 (pawn from e5 captures en passant on d6)
            moveNotation = `${fromSquare[0]}x${toSquare}`;
        } else {
            // Regular pawn move: just destination square
            moveNotation = toSquare;
        }
    } else {
        // For other pieces
        const pieceLetter = pieceType.toUpperCase();
        if (isCapture) {
            moveNotation = `${pieceLetter}x${toSquare}`;
        } else {
            moveNotation = `${pieceLetter}${toSquare}`;
        }
    }
    
    // Create move data for the current turn
    const moveData = {
        moveNumber: moveNumber,
        from: fromSquare,
        to: toSquare,
        piece: pieceType,
        turn: currentTurn,
        notation: moveNotation,
        isCapture: isCapture || isEnPassant,
        capturedPiece: isCapture ? (destinationPiece ? destinationPiece.dataset.piece : null) : 
                      (isEnPassant ? 'p' : null),
        isEnPassant: isEnPassant,
        enPassantCapturedSquare: enPassantCapturedSquare,
        commentary: '' // Initialize empty commentary
    };
    
    customGameMoves.push(moveData);
    customMoveIndex = customGameMoves.length; // Move to the end after making a move
    
    // Update the moves display
    updateCustomMovesDisplay();
    
    // Update move buttons
    updateCustomMoveButtons();
    
    // Show the custom game info section, moves list, and commentary section after the first move
    if (customGameMoves.length === 1) {
        console.log('First move made, showing custom game info, moves list, and commentary section...');
        showCustomGameInfo();
        
        // Show the moves list
        const movesList = document.getElementById('moves-list');
        if (movesList) {
            movesList.style.display = 'block';
        }
        
        // Show the commentary section
        addCustomCommentarySection();
        
        // Replace save message with save button
        addCustomGameSaveButton();
    }
    
    // Update custom game info
    updateCustomGameInfo();
    
    // Highlight the current move
    highlightCurrentCustomMove();
    
    // Play sound effect
    if (typeof playSound !== 'undefined') {
        playSound(false); // false = not a capture
    }
    
    // Switch turns
    currentTurn = currentTurn === 'white' ? 'black' : 'white';
    
    console.log(`Move recorded. Next turn: ${currentTurn}`);
}

// Function to get current custom game position
function getCurrentCustomPosition() {
    const position = {};
    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
            const square = String.fromCharCode(97 + j) + (8 - i);
            const squareElement = document.querySelector(`[data-square="${square}"]`);
            if (squareElement && squareElement.querySelector('.piece')) {
                const piece = squareElement.querySelector('.piece');
                position[square] = piece.dataset.piece;
            } else {
                position[square] = '';
            }
        }
    }
    return position;
}

// Function to update the board position visually
function updateCustomBoardPosition() {
    console.log('Updating custom board position...');
    
    // Get the current position from the actual DOM
    const position = getCurrentCustomPosition();
    console.log('Current position:', position);
    
    // Clear the board
    clearBoard();
    
    // Place pieces according to current position
    Object.keys(position).forEach(square => {
        const piece = position[square];
        if (piece) {
            console.log(`Placing ${piece} on ${square}`);
            placePieceOnSquare(square, piece);
        }
    });
    
    // Re-add event listeners
    addCustomGameEventListeners();
    
    console.log('Board position updated');
}

// Function to clear selection
function clearCustomSelection() {
    window.selectedCustomPiece = null;
    window.selectedCustomSquare = null;
    clearHighlights();
}

// Function to clear highlights
function clearHighlights() {
    const highlightedSquares = document.querySelectorAll('.valid-move');
    highlightedSquares.forEach(square => {
        square.classList.remove('valid-move');
    });
}

// Drag and Drop Functions for Custom Game

// Function to handle drag start in custom game
function handleCustomDragStart(e) {
    console.log('=== CUSTOM DRAG START ===');
    console.log('Custom game mode:', customGameMode);
    console.log('Target:', e.target);
    
    if (!customGameMode) return;
    
    e.stopPropagation();
    e.stopImmediatePropagation(); // Prevent other handlers from running
    
    const piece = e.target;
    const pieceType = piece.dataset.piece;
    const square = piece.dataset.square;
    
    console.log('Custom drag start:', pieceType, 'from', square);
    
    // Check if it's the correct turn
    const isWhitePiece = pieceType === pieceType.toUpperCase();
    const isBlackPiece = pieceType === pieceType.toLowerCase();
    
    if ((currentTurn === 'white' && !isWhitePiece) || (currentTurn === 'black' && !isBlackPiece)) {
        e.preventDefault();
        console.log(`It's ${currentTurn}'s turn, not ${isWhitePiece ? 'white' : 'black'}'s turn`);
        return;
    }
    
    // Add dragging class to disable transitions on piece and board
    piece.classList.add('dragging');
    const board = document.getElementById('chess-board');
    if (board) {
        board.classList.add('dragging');
    }
    
    // Store the dragged piece data
    const dragData = {
        piece: pieceType,
        fromSquare: square
    };
    
    e.dataTransfer.setData('text/plain', JSON.stringify(dragData));
    e.dataTransfer.effectAllowed = 'move';
    
    console.log('Custom drag data set:', dragData);
    
    // Highlight valid moves
    highlightValidMovesForPiece(square, pieceType);
    
    // Make the piece semi-transparent while dragging
    piece.style.opacity = '0.5';
    
    console.log(`Custom started dragging ${pieceType} from ${square}`);
    
    return false; // Prevent further event propagation
}

// Function to handle drag end in custom game
function handleCustomDragEnd(e) {
    console.log('=== CUSTOM DRAG END ===');
    console.log('Custom game mode:', customGameMode);
    console.log('Target:', e.target);
    
    if (!customGameMode) return;
    
    // Remove dragging class to re-enable transitions
    e.target.classList.remove('dragging');
    const board = document.getElementById('chess-board');
    if (board) {
        board.classList.remove('dragging');
    }
    console.log('Removed dragging class, classes now:', e.target.classList.toString());
    
    // Restore piece opacity
    e.target.style.opacity = '1';
    
    // Clear highlights
    clearHighlights();
    
    console.log('Drag ended');
}

// Function to handle drag over in custom game
function handleCustomDragOver(e) {
    if (!customGameMode) return;
    
    e.preventDefault();
    
    const square = e.currentTarget;
    const squareNotation = square.dataset.square;
    
    // Check if this is a valid move destination
    if (square.classList.contains('valid-move')) {
        square.style.backgroundColor = 'rgba(0, 255, 0, 0.5)';
    }
}

// Function to handle drag drop in custom game
function handleCustomDragDrop(e) {
    if (!customGameMode) return;
    
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation(); // Prevent other handlers from running
    
    const square = e.currentTarget;
    const squareNotation = square.dataset.square;
    
    console.log('Custom drop event triggered on square:', squareNotation);
    
    // Reset square background
    square.style.backgroundColor = '';
    
    try {
        const dragData = JSON.parse(e.dataTransfer.getData('text/plain'));
        const pieceType = dragData.piece;
        const fromSquare = dragData.fromSquare;
        
        // Check if this is a valid move
        if (isValidMove(fromSquare, squareNotation, pieceType)) {
            makeCustomMove(fromSquare, squareNotation, pieceType);
        } else {
            // Don't allow invalid moves
            return false;
        }
    } catch (error) {
        console.error('Custom error parsing drag data:', error);
    }
    
    // Clear highlights
    clearHighlights();
    
    return false; // Prevent further event propagation
}

// Function to set up the custom moves display
function setupCustomMovesDisplay() {
    console.log('Setting up custom moves display...');
    
    // Clear existing moves
    const movesList = document.getElementById('moves-list');
    if (movesList) {
        movesList.innerHTML = '';
        movesList.style.display = 'block';
    }
    
    // Update the game header to show custom game
    const gameTitle = document.getElementById('game-title');
    if (gameTitle) {
        gameTitle.textContent = 'Custom Game';
    }
    
    // Hide the comment section for custom games
    const commentSection = document.getElementById('comment-section');
    if (commentSection) {
        commentSection.style.display = 'none';
    }
    
    // Show the moves toggle
    const movesToggle = document.getElementById('moves-toggle');
    if (movesToggle) {
        movesToggle.style.display = 'block';
    }
    
    // Initialize move buttons
    updateCustomMoveButtons();
    
    // Add save button or message
    if (customGameMoves.length === 0) {
        addCustomGameSaveMessage();
    } else {
        addCustomGameSaveButton();
    }
    
    // Add custom commentary section below moves list
    addCustomCommentarySection();
    
    // Highlight current move (should be none at start)
    highlightCurrentCustomMove();
    
    console.log('Custom moves display setup complete');
}

// Function to update the custom moves display
function updateCustomMovesDisplay() {
    console.log('Updating custom moves display...');
    
    const movesList = document.getElementById('moves-list');
    if (!movesList) {
        console.error('Moves list not found');
        return;
    }
    
    // Clear existing moves
    movesList.innerHTML = '';
    
    // Group moves by move number
    const movesByNumber = {};
    customGameMoves.forEach(move => {
        if (!movesByNumber[move.moveNumber]) {
            movesByNumber[move.moveNumber] = {};
        }
        movesByNumber[move.moveNumber][move.turn] = move;
    });
    
    // Display moves using the same structure as programmed games
    Object.keys(movesByNumber).sort((a, b) => parseInt(a) - parseInt(b)).forEach(moveNumber => {
        const moveData = movesByNumber[moveNumber];
        
        // Create move row
        const moveRow = document.createElement('div');
        moveRow.className = 'move-row';
        
        // Add move number
        const moveNumberSpan = document.createElement('span');
        moveNumberSpan.textContent = moveNumber + '.';
        moveNumberSpan.className = 'move-number';
        moveRow.appendChild(moveNumberSpan);
        
        // Create white moves container
        const whiteMoves = document.createElement('div');
        whiteMoves.className = 'white-moves';
        
        // Create black moves container
        const blackMoves = document.createElement('div');
        blackMoves.className = 'black-moves';
        
        // Add white move if it exists
        if (moveData.white) {
            const whiteMoveSpan = document.createElement('span');
            whiteMoveSpan.textContent = moveData.white.notation;
            whiteMoveSpan.className = 'clickable-move';
            whiteMoves.appendChild(whiteMoveSpan);
        }
        
        // Add black move if it exists
        if (moveData.black) {
            const blackMoveSpan = document.createElement('span');
            blackMoveSpan.textContent = moveData.black.notation;
            blackMoveSpan.className = 'clickable-move';
            blackMoves.appendChild(blackMoveSpan);
        }
        
        // Add click listeners to move containers
        whiteMoves.addEventListener('click', function() {
            if (moveData.white) {
                // Calculate the move index (white moves are at odd indices: 1, 3, 5, etc.)
                const moveIndex = (moveNumber - 1) * 2 + 1;
                customMoveIndex = moveIndex;
                updateCustomBoardFromMoves();
                updateCustomMoveButtons();
                highlightCurrentCustomMove();
                updateCustomCommentaryInput();
                
                // Play sound effect
                if (typeof playSound !== 'undefined') {
                    playSound(false);
                }
            }
        });
        
        blackMoves.addEventListener('click', function() {
            if (moveData.black) {
                // Calculate the move index (black moves are at even indices: 2, 4, 6, etc.)
                const moveIndex = (moveNumber - 1) * 2 + 2;
                customMoveIndex = moveIndex;
                updateCustomBoardFromMoves();
                updateCustomMoveButtons();
                highlightCurrentCustomMove();
                updateCustomCommentaryInput();
                
                // Play sound effect
                if (typeof playSound !== 'undefined') {
                    playSound(false);
                }
            }
        });
        
        // Add hover effects to indicate clickability
        whiteMoves.style.cursor = moveData.white ? 'pointer' : 'default';
        blackMoves.style.cursor = moveData.black ? 'pointer' : 'default';
        
        // Add containers to move row
        moveRow.appendChild(whiteMoves);
        moveRow.appendChild(blackMoves);
        
        // Add move row to moves list
        movesList.appendChild(moveRow);
    });
    
    console.log(`Displayed ${customGameMoves.length} moves`);
}

// Function to add custom commentary section below moves list (only in Add Game mode)
function addCustomCommentarySection() {
    if (!customGameMode) return;
    
    // Find the moves list container (the parent of moves-list)
    const movesList = document.getElementById('moves-list');
    if (!movesList) return;
    
    // Check if commentary section already exists
    let commentarySection = document.getElementById('custom-commentary-section');
    if (commentarySection) {
        commentarySection.remove(); // Remove existing one
    }
    
    // Create new commentary section
    commentarySection = document.createElement('div');
    commentarySection.id = 'custom-commentary-section';
    commentarySection.style.display = 'block';
    commentarySection.style.marginTop = '15px';
    commentarySection.style.padding = '10px';
    commentarySection.style.background = '#f8f9fa';
    commentarySection.style.borderRadius = '6px';
    commentarySection.style.borderLeft = '3px solid #3498db';
    
    const commentaryLabel = document.createElement('div');
    commentaryLabel.textContent = 'Add commentary for moves:';
    commentaryLabel.style.fontSize = '13px';
    commentaryLabel.style.color = '#34495e';
    commentaryLabel.style.marginBottom = '8px';
    commentaryLabel.style.fontWeight = '500';
    
    const commentaryInput = document.createElement('textarea');
    commentaryInput.id = 'custom-commentary-input';
    commentaryInput.placeholder = 'Click on a move above, then add commentary here...';
    commentaryInput.rows = 3;
    commentaryInput.style.width = '100%';
    commentaryInput.style.padding = '8px';
    commentaryInput.style.border = '1px solid #dee2e6';
    commentaryInput.style.borderRadius = '4px';
    commentaryInput.style.fontSize = '13px';
    commentaryInput.style.fontFamily = 'inherit';
    commentaryInput.style.resize = 'vertical';
    commentaryInput.style.backgroundColor = '#fff';
    commentaryInput.style.color = '#34495e';
    commentaryInput.style.lineHeight = '1.4';
    
    // Add event listener to save commentary to the currently selected move
    commentaryInput.addEventListener('input', function() {
        const commentary = commentaryInput.value;
        // Find the current move based on customMoveIndex
        if (customGameMoves[customMoveIndex - 1]) {
            customGameMoves[customMoveIndex - 1].commentary = commentary;
        }
    });
    
    commentarySection.appendChild(commentaryLabel);
    commentarySection.appendChild(commentaryInput);
    
    // Insert the commentary section after the moves list
    movesList.parentNode.insertBefore(commentarySection, movesList.nextSibling);
}

// Function to hide custom commentary section (when viewing saved games)
function hideCustomCommentarySection() {
    const commentarySection = document.getElementById('custom-commentary-section');
    if (commentarySection) {
        commentarySection.remove();
    }
}

// Function to hide custom save button (when viewing saved games)
function hideCustomSaveButton() {
    const saveButton = document.getElementById('custom-save-btn');
    if (saveButton) {
        saveButton.remove();
    }
}

// Function to hide custom save message
function hideCustomSaveMessage() {
    const saveMsg = document.getElementById('custom-save-message');
    if (saveMsg) {
        saveMsg.remove();
    }
}


// Function to show custom game info section
function showCustomGameInfo() {
    const gameInfo = document.getElementById('custom-game-info');
    
    if (gameInfo) {
        gameInfo.style.display = 'block';
        
        // Add click handler for expand/collapse
        const gameHeader = document.getElementById('custom-game-header');
        const gameDetails = document.getElementById('custom-game-details');
        
        if (gameHeader && gameDetails) {
            gameHeader.addEventListener('click', function() {
                gameHeader.classList.toggle('expanded');
                gameDetails.classList.toggle('show');
            });
        }
        
        // Add event listener for title input
        const titleInput = document.getElementById('custom-game-title-input');
        if (titleInput) {
            titleInput.addEventListener('input', function() {
                window.customGameName = this.value.trim();
            });
            
            // Prevent the header click when clicking on the input
            titleInput.addEventListener('click', function(e) {
                e.stopPropagation();
            });
        }
        
        // Add event listeners for all detail inputs
        const detailInputs = [
            'custom-detail-description',
            'custom-detail-white',
            'custom-detail-black',
            'custom-detail-opening',
            'custom-detail-result'
        ];
        
        detailInputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                // Prevent the header click when clicking on inputs
                input.addEventListener('click', function(e) {
                    e.stopPropagation();
                });
            }
        });
        
        // Initialize with default values
        updateCustomGameInfo();
    }
}

// Function to hide custom game info section
function hideCustomGameInfo() {
    const gameInfo = document.getElementById('custom-game-info');
    if (gameInfo) {
        gameInfo.style.display = 'none';
    }
}

// Function to update custom game title
function updateCustomGameTitle() {
    const titleInput = document.getElementById('custom-game-title-input');
    if (titleInput) {
        const gameName = window.customGameName || '';
        titleInput.value = gameName;
    }
}

// Function to update custom game info details
function updateCustomGameInfo() {
    // Update moves count
    const movesCount = customGameMoves.length;
    const movesElement = document.getElementById('custom-detail-moves');
    if (movesElement) {
        movesElement.value = movesCount.toString();
    }
    
    // Update game name in title
    updateCustomGameTitle();
}

// Make functions and variables globally accessible
window.hideCustomCommentarySection = hideCustomCommentarySection;
window.hideCustomSaveButton = hideCustomSaveButton;
window.hideCustomSaveMessage = hideCustomSaveMessage;
window.hideCustomGameInfo = hideCustomGameInfo;
window.customGameMode = customGameMode;

// Function to update the commentary input with the current move's commentary
function updateCustomCommentaryInput() {
    if (!customGameMode) return;
    
    const commentaryInput = document.getElementById('custom-commentary-input');
    if (!commentaryInput) return;
    
    // Get the current move's commentary
    const currentMove = customGameMoves[customMoveIndex - 1];
    if (currentMove) {
        commentaryInput.value = currentMove.commentary || '';
    } else {
        commentaryInput.value = '';
    }
}

// Function to update custom move buttons
function updateCustomMoveButtons() {
    if (!customGameMode) return;
    
    const btnInitial = document.getElementById('btn-initial');
    const btnBack = document.getElementById('btn-back');
    const btnForward = document.getElementById('btn-forward');
    const btnFinal = document.getElementById('btn-final');
    
    if (!btnInitial || !btnBack || !btnForward || !btnFinal) return;
    
    // Update disabled states using the same class system as programmed games
    if (customMoveIndex <= 0) {
        btnInitial.classList.add('disabled');
        btnBack.classList.add('disabled');
    } else {
        btnInitial.classList.remove('disabled');
        btnBack.classList.remove('disabled');
    }
    
    if (customMoveIndex >= customGameMoves.length) {
        btnForward.classList.add('disabled');
        btnFinal.classList.add('disabled');
    } else {
        btnForward.classList.remove('disabled');
        btnFinal.classList.remove('disabled');
    }
}

// Function to go to previous move in custom game
function goToPreviousCustomMove() {
    if (!customGameMode || customMoveIndex <= 0) return;
    
    customMoveIndex--;
    updateCustomBoardFromMoves();
    updateCustomMoveButtons();
    highlightCurrentCustomMove();
    updateCustomCommentaryInput();
    
    // Play sound effect
    if (typeof playSound !== 'undefined') {
        playSound(false);
    }
}

// Function to go to next move in custom game
function goToNextCustomMove() {
    if (!customGameMode || customMoveIndex >= customGameMoves.length) return;
    
    customMoveIndex++;
    updateCustomBoardFromMoves();
    updateCustomMoveButtons();
    highlightCurrentCustomMove();
    updateCustomCommentaryInput();
    
    // Play sound effect
    if (typeof playSound !== 'undefined') {
        playSound(false);
    }
}

// Function to go to first move in custom game
function goToFirstCustomMove() {
    if (!customGameMode) return;
    
    customMoveIndex = 0;
    updateCustomBoardFromMoves();
    updateCustomMoveButtons();
    highlightCurrentCustomMove();
    updateCustomCommentaryInput();
    
    // Play sound effect
    if (typeof playSound !== 'undefined') {
        playSound(false);
    }
}

// Function to go to last move in custom game
function goToLastCustomMove() {
    if (!customGameMode) return;
    
    customMoveIndex = customGameMoves.length;
    updateCustomBoardFromMoves();
    updateCustomMoveButtons();
    highlightCurrentCustomMove();
    updateCustomCommentaryInput();
    
    // Play sound effect
    if (typeof playSound !== 'undefined') {
        playSound(false);
    }
}

// Function to update board position based on custom moves
function updateCustomBoardFromMoves() {
    if (!customGameMode) return;
    
    // Clear the board
    clearBoard();
    
    // Set up initial position
    const initialPosition = getInitialPosition();
    Object.keys(initialPosition).forEach(square => {
        const piece = initialPosition[square];
        if (piece) {
            placePieceOnSquare(square, piece);
        }
    });
    
    // Apply moves up to current index
    for (let i = 0; i < customMoveIndex; i++) {
        const move = customGameMoves[i];
        const fromSquare = move.from;
        const toSquare = move.to;
        const pieceType = move.piece;
        
        // Move the piece
        const fromSquareElement = document.querySelector(`[data-square="${fromSquare}"]`);
        const toSquareElement = document.querySelector(`[data-square="${toSquare}"]`);
        
        if (fromSquareElement && toSquareElement) {
            const pieceElement = fromSquareElement.querySelector('.piece');
            if (pieceElement) {
                // Clear destination
                toSquareElement.innerHTML = '';
                // Move piece
                toSquareElement.appendChild(pieceElement);
                pieceElement.dataset.square = toSquare;
                // Clear source
                fromSquareElement.innerHTML = '';
            }
        }
    }
    
    // Re-add event listeners
    addCustomGameEventListeners();
}

// Function to highlight current move in custom game
function highlightCurrentCustomMove() {
    if (!customGameMode) return;
    
    // Clear all highlights
    document.querySelectorAll('.clickable-move').forEach(span => {
        span.classList.remove('active-move');
    });
    document.querySelectorAll('.white-moves, .black-moves').forEach(section => {
        section.classList.remove('clicked');
    });
    
    // If at initial position, don't highlight anything
    if (customMoveIndex === 0) return;
    
    // Calculate which move to highlight
    let moveNumber, isWhiteMove;
    
    if (customMoveIndex >= customGameMoves.length) {
        // At final position - highlight the last move
        moveNumber = Math.ceil(customGameMoves.length / 2);
        isWhiteMove = customGameMoves.length % 2 === 1;
    } else {
        // At a specific move
        moveNumber = Math.ceil(customMoveIndex / 2);
        isWhiteMove = customMoveIndex % 2 === 1;
    }
    
    // Find all move rows
    const moveRows = document.querySelectorAll('.move-row');
    
    // Find the target move row (0-based indexing)
    const targetMoveRow = moveRows[moveNumber - 1];
    if (!targetMoveRow) return;
    
    // Highlight the appropriate move
    if (isWhiteMove) {
        const whiteMoves = targetMoveRow.querySelector('.white-moves');
        if (whiteMoves) {
            const clickableMove = whiteMoves.querySelector('.clickable-move');
            if (clickableMove) {
                clickableMove.classList.add('active-move');
                whiteMoves.classList.add('clicked');
            }
        }
    } else {
        const blackMoves = targetMoveRow.querySelector('.black-moves');
        if (blackMoves) {
            const clickableMove = blackMoves.querySelector('.clickable-move');
            if (clickableMove) {
                clickableMove.classList.add('active-move');
                blackMoves.classList.add('clicked');
            }
        }
    }
}

// Function to add custom game save message
function addCustomGameSaveMessage() {
    // Remove existing save button or message if they exist
    const existingSaveBtn = document.getElementById('custom-save-btn');
    const existingSaveMsg = document.getElementById('custom-save-message');
    if (existingSaveBtn) {
        existingSaveBtn.remove();
    }
    if (existingSaveMsg) {
        existingSaveMsg.remove();
    }
    
    // Create save message
    const saveMsg = document.createElement('div');
    saveMsg.id = 'custom-save-message';
    saveMsg.className = 'custom-save-message';
    saveMsg.innerHTML = 'Make a move in order to save the game';
    saveMsg.style.cssText = `
        text-align: center;
        color: #7f8c8d;
        border: 1px solid #dee2e6;
        border-radius: 8px;
        padding: 10px;
        background: #fff;
    `;
    
    // Add to moves list container
    const movesList = document.getElementById('moves-list');
    if (movesList && movesList.parentNode) {
        movesList.parentNode.appendChild(saveMsg);
    }
}

// Function to add save button for custom games
function addCustomGameSaveButton() {
    // Remove existing save button or message if they exist
    const existingSaveBtn = document.getElementById('custom-save-btn');
    const existingSaveMsg = document.getElementById('custom-save-message');
    if (existingSaveBtn) {
        existingSaveBtn.remove();
    }
    if (existingSaveMsg) {
        existingSaveMsg.remove();
    }
    
    // Create save button
    const saveButton = document.createElement('button');
    saveButton.id = 'custom-save-btn';
    saveButton.textContent = '💾 Save Game';
    saveButton.className = 'save-button';
    saveButton.style.cssText = `
        margin: 1rem auto;
        padding: 0.75rem 1.5rem;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        display: block;
        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
    `;
    
    // Add hover effects
    saveButton.addEventListener('mouseenter', function() {
        this.style.transform = 'translateY(-2px)';
        this.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.4)';
    });
    
    saveButton.addEventListener('mouseleave', function() {
        this.style.transform = 'translateY(0)';
        this.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.3)';
    });
    
    // Add click event
    saveButton.addEventListener('click', saveCustomGame);
    
    // Insert after moves list
    const movesList = document.getElementById('moves-list');
    if (movesList && movesList.parentNode) {
        movesList.parentNode.insertBefore(saveButton, movesList.nextSibling);
    }
}

// Function to reset custom game mode and clear the right section
function resetCustomGameMode() {
    console.log('Resetting custom game mode...');
    
    // Reset all custom game variables
    customGameMode = false;
    window.customGameMode = false;
    currentTurn = 'white';
    customGameMoves = [];
    customMoveIndex = 0;
    
    // Clear the board
    clearBoard();
    
    // Hide all custom game elements
    const customGameInfo = document.getElementById('custom-game-info');
    if (customGameInfo) {
        customGameInfo.style.display = 'none';
    }
    
    const movesList = document.getElementById('moves-list');
    if (movesList) {
        movesList.style.display = 'none';
        movesList.innerHTML = '';
    }
    
    const commentSection = document.getElementById('comment-section');
    if (commentSection) {
        commentSection.style.display = 'none';
    }
    
    // Hide custom commentary section
    if (typeof hideCustomCommentarySection === 'function') {
        hideCustomCommentarySection();
    }
    
    // Hide custom save button and message
    if (typeof hideCustomSaveButton === 'function') {
        hideCustomSaveButton();
    }
    if (typeof hideCustomSaveMessage === 'function') {
        hideCustomSaveMessage();
    }
    
    // Hide delete game section
    const deleteGameSection = document.getElementById('delete-game-section');
    if (deleteGameSection) {
        deleteGameSection.style.display = 'none';
    }
    
    // Clear any existing game info sections
    const gameHeader = document.getElementById('game-header');
    const gameDetails = document.getElementById('game-details');
    if (gameHeader) {
        gameHeader.style.display = 'none';
    }
    if (gameDetails) {
        gameDetails.style.display = 'none';
    }
    
    // Reset move buttons
    updateCustomMoveButtons();
    
    // Clear any highlights
    clearHighlights();
    
    // Clear selection
    clearCustomSelection();
    
    console.log('Custom game mode reset complete - right section is now empty');
}

// Function to save custom game
function saveCustomGame() {
    if (!customGameMode || customGameMoves.length === 0) {
        return;
    }
    
    // Get all custom game data from the input fields
    const titleInput = document.getElementById('custom-game-title-input');
    const descriptionInput = document.getElementById('custom-detail-description');
    const whitePlayerInput = document.getElementById('custom-detail-white');
    const blackPlayerInput = document.getElementById('custom-detail-black');
    const openingInput = document.getElementById('custom-detail-opening');
    const resultInput = document.getElementById('custom-detail-result');
    
    const customGameName = titleInput ? titleInput.value.trim() : '';
    
    // Validate that title is not empty
    if (!customGameName) {
        if (titleInput) {
            titleInput.focus();
            titleInput.style.border = '1px solid #e74c3c';
            titleInput.style.background = 'rgba(231, 76, 60, 0.1)';
            
            // Remove the error styling after user starts typing
            titleInput.addEventListener('input', function() {
                this.style.border = 'none';
                this.style.background = 'none';
            }, { once: true });
        }
        return;
    }
    const description = descriptionInput ? descriptionInput.value.trim() || 'Custom chess game created by user' : 'Custom chess game created by user';
    const whitePlayer = whitePlayerInput ? whitePlayerInput.value.trim() || 'White' : 'White';
    const blackPlayer = blackPlayerInput ? blackPlayerInput.value.trim() || 'Black' : 'Black';
    const opening = openingInput ? openingInput.value.trim() || 'Custom Opening' : 'Custom Opening';
    const result = resultInput ? resultInput.value : 'In progress';
    
    // Create game data
    const gameData = {
        id: 'custom-game-' + Date.now(),
        name: customGameName,
        white_player: whitePlayer,
        black_player: blackPlayer,
        description: description,
        moves: customGameMoves.length,
        result: result,
        opening: opening,
        date: new Date().toISOString().split('T')[0],
        difficulty: 'Custom',
        moves_notation: (() => {
            // Create moves_notation array in the same order as moves are played
            const notation = [];
            customGameMoves.forEach(move => {
                notation.push(move.notation);
            });
            return notation;
        })(),
        moves_detailed: (() => {
            const detailedMoves = [];
            const movesByNumber = {};
            
            // Group moves by move number
            customGameMoves.forEach(move => {
                if (!movesByNumber[move.moveNumber]) {
                    movesByNumber[move.moveNumber] = {};
                }
                movesByNumber[move.moveNumber][move.turn] = move;
            });
            
            // Create detailed moves in the same format as preprogrammed games
            Object.keys(movesByNumber).sort((a, b) => parseInt(a) - parseInt(b)).forEach(moveNumber => {
                const moveData = movesByNumber[moveNumber];
                
            // Add white move if it exists (separate entry)
            if (moveData.white) {
                let captureText = '';
                if (moveData.white.isCapture) {
                    if (moveData.white.isEnPassant) {
                        captureText = ` (en passant captures ${moveData.white.capturedPiece} on ${moveData.white.enPassantCapturedSquare})`;
                    } else {
                        captureText = ` (captures ${moveData.white.capturedPiece})`;
                    }
                }
                // Create description with commentary if present
                let description = `${moveData.white.piece} from ${moveData.white.from} to ${moveData.white.to}${captureText}`;
                if (moveData.white.commentary && moveData.white.commentary.trim() !== '') {
                    description += ` - ${moveData.white.commentary.trim()}`;
                }
                    
                    detailedMoves.push({
                        move_number: parseInt(moveNumber),
                        white: moveData.white.notation,
                        black: null,
                        description: description,
                        white_from: moveData.white.from,
                        white_to: moveData.white.to,
                        black_from: null,
                        black_to: null,
                        annotation: '',
                        commentary: moveData.white.commentary || ''
                    });
                }
                
            // Add black move if it exists (separate entry)
            if (moveData.black) {
                let captureText = '';
                if (moveData.black.isCapture) {
                    if (moveData.black.isEnPassant) {
                        captureText = ` (en passant captures ${moveData.black.capturedPiece} on ${moveData.black.enPassantCapturedSquare})`;
                    } else {
                        captureText = ` (captures ${moveData.black.capturedPiece})`;
                    }
                }
                // Create description with commentary if present
                let description = `${moveData.black.piece} from ${moveData.black.from} to ${moveData.black.to}${captureText}`;
                if (moveData.black.commentary && moveData.black.commentary.trim() !== '') {
                    description += ` - ${moveData.black.commentary.trim()}`;
                }
                    
                    detailedMoves.push({
                        move_number: parseInt(moveNumber),
                        white: null,
                        black: moveData.black.notation,
                        description: description,
                        white_from: null,
                        white_to: null,
                        black_from: moveData.black.from,
                        black_to: moveData.black.to,
                        annotation: '',
                        commentary: moveData.black.commentary || ''
                    });
                }
            });
            
            return detailedMoves;
        })()
    };
    
    // Load existing custom games or create new structure
    let customGamesData = { games: [] };
    
    // Try to load existing custom games from localStorage
    try {
        const existingData = localStorage.getItem('custom-games');
        if (existingData) {
            customGamesData = JSON.parse(existingData);
        }
    } catch (error) {
        console.log('No existing custom games found, creating new file');
    }
    
    // Add new game to the collection
    customGamesData.games.push(gameData);
    
    // Save to server
    saveGameToServer(gameData);
    
    // Show success message
    const saveButton = document.getElementById('custom-save-btn');
    if (saveButton) {
        const originalText = saveButton.textContent;
        saveButton.textContent = '✅ Saved!';
        saveButton.style.background = 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)';
        
        setTimeout(() => {
            saveButton.textContent = originalText;
            saveButton.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        }, 2000);
    }
    
    console.log('Custom game saved:', gameData);
    console.log('Total custom games:', customGamesData.games.length);
    
    // Reload games data to include the new custom game
    console.log('Attempting to reload games data...');
    if (typeof reloadGamesData === 'function') {
        console.log('reloadGamesData function found, calling it...');
        reloadGamesData();
    } else if (typeof window.reloadGamesData === 'function') {
        console.log('window.reloadGamesData function found, calling it...');
        window.reloadGamesData();
    } else {
        console.error('reloadGamesData function not found!');
    }
    
    // Reset the custom game mode after saving
    resetCustomGameMode();
}

// Function to save game to server (using Supabase)
async function saveGameToServer(gameData) {
    try {
        // Check if user is logged in
        const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
        if (!isLoggedIn) {
            console.error('❌ User not logged in. Please sign in to save games.');
            alert('Please sign in to save custom games.');
            return;
        }
        
        // Use Supabase function if available
        if (typeof window.saveCustomGame === 'function') {
            console.log('💾 Saving game to Supabase...');
            const result = await window.saveCustomGame(gameData);
            
            if (result && result.success) {
                console.log('✅ Game saved to Supabase successfully!');
                
                // Show success message
                const saveButton = document.getElementById('custom-save-btn');
                if (saveButton) {
                    const originalText = saveButton.textContent;
                    saveButton.textContent = '✅ Saved!';
                    saveButton.style.background = 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)';
                    
                    setTimeout(() => {
                        saveButton.textContent = originalText;
                        saveButton.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                    }, 2000);
                }
                
                // Reset the custom game mode after successful save
                resetCustomGameMode();
                
                // Refresh the games list to show the new custom game
                setTimeout(() => {
                    if (typeof window.reloadGamesData === 'function') {
                        console.log('Reloading games data...');
                        window.reloadGamesData();
                    } else if (typeof window.updateGameButtons === 'function') {
                        console.log('Updating game buttons...');
                        window.updateGameButtons();
                    } else {
                        // Fallback: reload the page to show the new game
                        console.log('Refreshing page to show new custom game...');
                        window.location.reload();
                    }
                }, 1000);
            } else {
                const errorMsg = result?.error || 'Failed to save game';
                console.error('❌ Failed to save game:', errorMsg);
                alert('Failed to save game: ' + errorMsg);
            }
        } else {
            // Fallback to old API method if Supabase not available
            console.warn('⚠️ Supabase saveCustomGame not available, using fallback API');
            const isProduction = !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1');
            const apiUrl = isProduction ? '/api/save-game' : 'http://localhost:3001/save-game';
            
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(gameData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log('✅ Game saved via fallback API');
                
                // Show success message
                const saveButton = document.getElementById('custom-save-btn');
                if (saveButton) {
                    const originalText = saveButton.textContent;
                    saveButton.textContent = '✅ Saved!';
                    saveButton.style.background = 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)';
                    
                    setTimeout(() => {
                        saveButton.textContent = originalText;
                        saveButton.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                    }, 2000);
                }
                
                resetCustomGameMode();
                
                setTimeout(() => {
                    if (typeof window.reloadGamesData === 'function') {
                        window.reloadGamesData();
                    } else if (typeof window.updateGameButtons === 'function') {
                        window.updateGameButtons();
                    } else {
                        window.location.reload();
                    }
                }, 1000);
            } else {
                console.error('❌ Failed to save game:', result.message);
                alert('Failed to save game: ' + (result.message || 'Unknown error'));
            }
        }
    } catch (error) {
        console.error('❌ Error saving game to server:', error);
        alert('Error saving game: ' + error.message);
    }
}

