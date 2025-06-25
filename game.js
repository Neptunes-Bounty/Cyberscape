document.addEventListener('DOMContentLoaded', () => {
    // --- CANVAS & CONTEXT SETUP ---
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    // --- GAME CONSTANTS ---
    const TILE_SIZE = 50;
    const GRID_WIDTH = 16;
    const GRID_HEIGHT = 12;
    const PLAYER_RADIUS = 8;
    const PLAYER_SPEED = 0.15; // pixels per ms
    const SYSTEM_HEALTH_DECAY = 0.003; // points per ms
    const TOWER_VISION_RADIUS = TILE_SIZE * 2.5;
    const TOWER_VISION_ANGLE = Math.PI / 3; // 60 degrees
    const SHARD_COST = 3; // Keys needed to decrypt one shard
    const SHARD_HEALTH_REWARD = 25;

    // --- GAME STATE ---
    let mapGrid = [];
    let towers = [];
    let keys = [];
    
    let player = {};
    let gameState = {};
    
    let centralHub, baseStation;

    let isPaused = false;
    let lastTime = 0;
    const keysPressed = {};

    // --- SETUP CANVAS & UI ---
    canvas.width = GRID_WIDTH * TILE_SIZE;
    canvas.height = GRID_HEIGHT * TILE_SIZE;

    const pauseBtn = document.getElementById('pauseBtn');
    const resumeBtn = document.getElementById('resumeBtn');
    const resetBtn = document.getElementById('resetBtn');

    // --- HELPER FUNCTIONS ---
    const rand = (min, max) => Math.random() * (max - min) + min;
    const getTileFromPos = (x, y) => mapGrid[Math.floor(y / TILE_SIZE)][Math.floor(x / TILE_SIZE)];

    // --- MAP GENERATION ---
    function generateMap() {
        mapGrid = [];
        for (let y = 0; y < GRID_HEIGHT; y++) {
            const row = [];
            for (let x = 0; x < GRID_WIDTH; x++) {
                const tile = {
                    x: x * TILE_SIZE,
                    y: y * TILE_SIZE,
                    buildings: []
                };
                // Leave a border around the map clear
                if (x > 0 && x < GRID_WIDTH - 1 && y > 0 && y < GRID_HEIGHT - 1 && Math.random() > 0.4) {
                    for (let i = 0; i < rand(1, 4); i++) {
                        tile.buildings.push({
                            x: tile.x + rand(0, TILE_SIZE - 20),
                            y: tile.y + rand(0, TILE_SIZE - 20),
                            width: rand(10, TILE_SIZE / 1.5),
                            height: rand(10, TILE_SIZE / 1.5)
                        });
                    }
                }
                row.push(tile);
            }
            mapGrid.push(row);
        }
    }
    
    // --- SPAWNING ENTITIES ---
    function spawnSpecialStations() {
        // Base Station (Cyan) - Top Right
        const baseX = GRID_WIDTH - 2, baseY = 1;
        mapGrid[baseY][baseX].buildings = [];
        baseStation = { x: baseX * TILE_SIZE + TILE_SIZE / 2, y: baseY * TILE_SIZE + TILE_SIZE / 2, tileX: baseX, tileY: baseY };

        // Central Hub (White) - Bottom Left
        const hubX = 1, hubY = GRID_HEIGHT - 2;
        mapGrid[hubY][hubX].buildings = [];
        centralHub = { x: hubX * TILE_SIZE + TILE_SIZE / 2, y: hubY * TILE_SIZE + TILE_SIZE / 2, tileX: hubX, tileY: hubY };
    }
    
    function spawnTowers(count) {
        towers = [];
        for (let i = 0; i < count; i++) {
            let placed = false;
            while (!placed) {
                const x = Math.floor(rand(1, GRID_WIDTH - 1));
                const y = Math.floor(rand(1, GRID_HEIGHT - 1));
                if (mapGrid[y][x].buildings.length === 0 && !(x === baseStation.tileX && y === baseStation.tileY) && !(x === centralHub.tileX && y === centralHub.tileY)) {
                    towers.push({
                        x: x * TILE_SIZE + TILE_SIZE / 2,
                        y: y * TILE_SIZE + TILE_SIZE / 2,
                        angle: rand(0, Math.PI * 2),
                        rotationSpeed: rand(0.0005, 0.001) * (Math.random() > 0.5 ? 1 : -1)
                    });
                    placed = true;
                }
            }
        }
    }
    
    function spawnKeys(count) {
        keys = [];
        for (let i = 0; i < count; i++) {
            let placed = false;
            while (!placed) {
                const x = Math.floor(rand(1, GRID_WIDTH - 1));
                const y = Math.floor(rand(1, GRID_HEIGHT - 1));
                 if (mapGrid[y][y] && mapGrid[y][x].buildings.length === 0) {
                    keys.push({ x: x * TILE_SIZE + TILE_SIZE / 2, y: y * TILE_SIZE + TILE_SIZE / 2, radius: 5 });
                    placed = true;
                }
            }
        }
    }

    // --- COLLISION DETECTION ---
    function checkCollision(x, y, radius) {
        const tile = getTileFromPos(x, y);
        if (!tile) return true; // Out of bounds
        
        for (const building of tile.buildings) {
            if (x + radius > building.x && x - radius < building.x + building.width &&
                y + radius > building.y && y - radius < building.y + building.height) {
                return true; // Collision detected
            }
        }
        return false;
    }

    // --- UPDATE FUNCTIONS ---
    function updatePlayer(deltaTime) {
        let moveX = 0;
        let moveY = 0;
        if (keysPressed['w'] || keysPressed['ArrowUp']) moveY -= 1;
        if (keysPressed['s'] || keysPressed['ArrowDown']) moveY += 1;
        if (keysPressed['a'] || keysPressed['ArrowLeft']) moveX -= 1;
        if (keysPressed['d'] || keysPressed['ArrowRight']) moveX += 1;

        const magnitude = Math.sqrt(moveX * moveX + moveY * moveY);
        if (magnitude > 0) {
            const deltaMove = PLAYER_SPEED * deltaTime;
            const nextX = player.x + (moveX / magnitude) * deltaMove;
            const nextY = player.y + (moveY / magnitude) * deltaMove;

            if (!checkCollision(nextX, player.y, PLAYER_RADIUS)) player.x = nextX;
            if (!checkCollision(player.x, nextY, PLAYER_RADIUS)) player.y = nextY;
        }
    }

    function updateTowers(deltaTime) {
        towers.forEach(tower => {
            tower.angle += tower.rotationSpeed * deltaTime;

            const dx = player.x - tower.x;
            const dy = player.y - tower.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < TOWER_VISION_RADIUS) {
                const angleToPlayer = Math.atan2(dy, dx);
                let angleDifference = tower.angle - angleToPlayer;
                while (angleDifference <= -Math.PI) angleDifference += 2 * Math.PI;
                while (angleDifference > Math.PI) angleDifference -= 2 * Math.PI;

                if (Math.abs(angleDifference) < TOWER_VISION_ANGLE / 2) {
                    player.health -= 0.005 * deltaTime; // Continuous damage
                }
            }
        });
    }

    function updateInteractions() {
        // Key pickup
        for (let i = keys.length - 1; i >= 0; i--) {
            const key = keys[i];
            const dist = Math.hypot(player.x - key.x, player.y - key.y);
            if (dist < PLAYER_RADIUS + key.radius) {
                player.keys++;
                keys.splice(i, 1);
            }
        }

        // Central Hub
        const distToHub = Math.hypot(player.x - centralHub.x, player.y - centralHub.y);
        if (distToHub < TILE_SIZE / 2 && player.keys >= SHARD_COST) {
            player.keys -= SHARD_COST;
            player.shards++;
        }

        // Base Station
        const distToBase = Math.hypot(player.x - baseStation.x, player.y - baseStation.y);
        if (distToBase < TILE_SIZE / 2 && player.shards > 0) {
            const shardsDelivered = player.shards;
            player.shards = 0;
            gameState.shardsDelivered += shardsDelivered;
            gameState.systemHealth += shardsDelivered * SHARD_HEALTH_REWARD;
            gameState.systemHealth = Math.min(100, gameState.systemHealth); // Cap at 100
        }
    }

    function updateSystem(deltaTime) {
        gameState.systemHealth -= SYSTEM_HEALTH_DECAY * deltaTime;

        if (player.health <= 0 || gameState.systemHealth <= 0) {
            endGame(false); // Loss
        }
        if (gameState.systemHealth >= 100) {
            endGame(true); // Win
        }
    }

    // --- DRAW FUNCTIONS ---
    function drawMap() {
        mapGrid.forEach(row => {
            row.forEach(tile => {
                ctx.fillStyle = '#00330a'; // Darker green for base
                ctx.fillRect(tile.x, tile.y, TILE_SIZE, TILE_SIZE);
                ctx.fillStyle = '#000000';
                tile.buildings.forEach(b => ctx.fillRect(b.x, b.y, b.width, b.height));
            });
        });
        
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4;
        for (let i = 0; i <= GRID_WIDTH; i++) {
            ctx.beginPath();
            ctx.moveTo(i * TILE_SIZE, 0);
            ctx.lineTo(i * TILE_SIZE, canvas.height);
            ctx.stroke();
        }
        for (let i = 0; i <= GRID_HEIGHT; i++) {
            ctx.beginPath();
            ctx.moveTo(0, i * TILE_SIZE);
            ctx.lineTo(canvas.width, i * TILE_SIZE);
            ctx.stroke();
        }
    }

    function drawSpecials() {
        // Base Station
        ctx.fillStyle = '#00ffff';
        ctx.fillRect(baseStation.tileX * TILE_SIZE, baseStation.tileY * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        ctx.beginPath();
        ctx.arc(baseStation.x, baseStation.y, TILE_SIZE/3, 0, Math.PI*2);
        ctx.fillStyle = '#00aaff';
        ctx.fill();

        // Central Hub
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(centralHub.tileX * TILE_SIZE, centralHub.tileY * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        ctx.beginPath();
        ctx.arc(centralHub.x, centralHub.y, TILE_SIZE/4, 0, Math.PI*2);
        ctx.fillStyle = '#cccccc';
        ctx.fill();
    }
    
    function drawKeys() {
        ctx.fillStyle = '#ff00ff'; // Magenta
        keys.forEach(key => {
            ctx.beginPath();
            ctx.arc(key.x, key.y, key.radius, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    function drawTowers() {
        towers.forEach(tower => {
            // Vision cone
            ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
            ctx.beginPath();
            ctx.moveTo(tower.x, tower.y);
            ctx.arc(tower.x, tower.y, TOWER_VISION_RADIUS, tower.angle - TOWER_VISION_ANGLE / 2, tower.angle + TOWER_VISION_ANGLE / 2);
            ctx.closePath();
            ctx.fill();
            
            // Tower base
            ctx.fillStyle = '#8B0000';
            ctx.beginPath();
            ctx.arc(tower.x, tower.y, 6, 0, Math.PI*2);
            ctx.fill();
        });
    }

    function drawPlayer() {
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(player.x, player.y, PLAYER_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#00ff41';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    function drawUI() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(5, 5, 250, 120);
        ctx.strokeStyle = '#00ff41';
        ctx.lineWidth = 1;
        ctx.strokeRect(5, 5, 250, 120);

        ctx.fillStyle = '#00ff41';
        ctx.font = '16px "Consolas", "Courier New"';
        ctx.fillText(`Player Health: ${Math.ceil(player.health)}`, 15, 30);
        ctx.fillText(`System Health: ${Math.ceil(gameState.systemHealth)}`, 15, 55);
        ctx.fillText(`Keys: ${player.keys}`, 15, 80);
        ctx.fillText(`Shards Held: ${player.shards}`, 130, 80);
        ctx.fillText(`Shards Delivered: ${gameState.shardsDelivered}`, 15, 105);
        ctx.fillText(`High Score: ${gameState.highScore}`, 130, 105);
    }
    
    // --- GAME FLOW & INITIALIZATION ---
    function setup() {
        gameState = {
            systemHealth: 50,
            shardsDelivered: 0,
            highScore: localStorage.getItem('aurexHighScore') || 0,
        };
        player = {
            x: TILE_SIZE * 1.5,
            y: TILE_SIZE * 1.5,
            health: 100,
            keys: 0,
            shards: 0,
        };
        
        generateMap();
        spawnSpecialStations();
        spawnTowers(6);
        spawnKeys(8);
        
        isPaused = false;
        pauseBtn.style.display = 'inline-block';
        resumeBtn.style.display = 'none';
    }

    function endGame(isWin) {
        isPaused = true;
        if (gameState.shardsDelivered > gameState.highScore) {
            localStorage.setItem('aurexHighScore', gameState.shardsDelivered);
        }
        
        // Final screen overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = isWin ? '#00ffff' : '#ff0000';
        ctx.font = '50px "Consolas", "Courier New"';
        ctx.textAlign = 'center';
        ctx.fillText(isWin ? 'AUREX SAVED' : 'GAME OVER', canvas.width / 2, canvas.height / 2 - 20);
        ctx.font = '20px "Consolas", "Courier New"';
        ctx.fillText('Click Reset to play again.', canvas.width / 2, canvas.height / 2 + 20);
        ctx.textAlign = 'left';
    }

    function gameLoop(timestamp) {
        if (!lastTime) lastTime = timestamp;
        let deltaTime = timestamp - lastTime;
        lastTime = timestamp;

        if (!isPaused) {
            // Update logic
            updatePlayer(deltaTime);
            updateTowers(deltaTime);
            updateInteractions();
            updateSystem(deltaTime);

            // Drawing logic
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawMap();
            drawSpecials();
            drawKeys();
            drawTowers();
            drawPlayer();
            drawUI();
        }
        
        requestAnimationFrame(gameLoop);
    }

    // --- EVENT LISTENERS ---
    window.addEventListener('keydown', (e) => { keysPressed[e.key] = true; });
    window.addEventListener('keyup', (e) => { keysPressed[e.key] = false; });
    
    pauseBtn.addEventListener('click', () => {
        isPaused = true;
        pauseBtn.style.display = 'none';
        resumeBtn.style.display = 'inline-block';
    });
    resumeBtn.addEventListener('click', () => {
        isPaused = false;
        lastTime = performance.now(); // Reset time to avoid jump
        pauseBtn.style.display = 'inline-block';
        resumeBtn.style.display = 'none';
    });
    resetBtn.addEventListener('click', () => {
        lastTime = 0;
        setup();
    });

    // --- START GAME ---
    setup();
    requestAnimationFrame(gameLoop);
});
