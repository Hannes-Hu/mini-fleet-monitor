const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const WebSocket = require('ws');
const http = require('http');
const { createClient } = require('redis');

const app = express();
const server = http.createServer(app);

// WebSocket Server
const wss = new WebSocket.Server({ 
  server, 
  path: '/ws',
  // Add verifyClient to handle CORS
  verifyClient: (info, callback) => {
    // Allow all connections for development
    callback(true);
  }
});
const clients = new Set();

// PostgreSQL Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/fleet_db'
});

// Redis Client
let redisClient;
(async () => {
  redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  });
  
  redisClient.on('error', (err) => console.error('Redis Client Error:', err));
  await redisClient.connect();
  console.log('Redis connected successfully');
})();

// Helper function to broadcast WebSocket messages
const broadcastRobotUpdate = (robot) => {
  try {
    // Ensure the robot data is properly formatted
    const formattedRobot = formatRobotForResponse(robot);
    
    const message = JSON.stringify({
      type: 'ROBOT_UPDATE',
      robot: formattedRobot,
      timestamp: new Date().toISOString()
    });
    
    let clientCount = 0;
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
          clientCount++;
        } catch (sendError) {
          console.error('Error sending WebSocket message:', sendError);
        }
      }
    });
    
    if (clientCount > 0) {
      console.log(`Broadcasted update for robot ${robot.name} to ${clientCount} clients`);
    }
  } catch (error) {
    console.error('Error in broadcastRobotUpdate:', error);
  }
};

// Broadcast client count updates
const broadcastClientCount = () => {
  try {
    const message = JSON.stringify({
      type: 'CLIENT_COUNT_UPDATE',
      count: clients.size,
      timestamp: new Date().toISOString()
    });
    
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (sendError) {
          console.error('Error sending client count:', sendError);
        }
      }
    });
  } catch (error) {
    console.error('Error in broadcastClientCount:', error);
  }
};

// Helper function to format robot data
const formatRobotForResponse = (robot) => ({
  id: robot.id,
  name: robot.name,
  status: robot.status,
  lat: parseFloat(robot.lat),
  lon: parseFloat(robot.lon),
  updated_at: robot.updated_at
});

// Helper function to format robots array
const formatRobotsForResponse = (robots) => 
  robots.map(robot => formatRobotForResponse(robot));

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Database connected successfully');
    release();
  }
});

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  clients.add(ws);
  console.log(`New WebSocket client connected. Total: ${clients.size}`);
  
  // Send current client count
  broadcastClientCount();
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'AUTHENTICATE':
          try {
            const decoded = jwt.verify(data.token, process.env.JWT_SECRET || 'test123');
            ws.user = decoded;
            ws.send(JSON.stringify({
              type: 'AUTH_SUCCESS',
              message: 'WebSocket authentication successful',
              user: decoded.email
            }));
          } catch (authError) {
            ws.send(JSON.stringify({
              type: 'AUTH_ERROR',
              error: 'Invalid token'
            }));
          }
          break;
          
        case 'PING':
          ws.send(JSON.stringify({ 
            type: 'PONG', 
            timestamp: Date.now() 
          }));
          break;
          
        default:
          console.log('Unknown WebSocket message type:', data.type);
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  });
  
  ws.on('close', () => {
    clients.delete(ws);
    console.log(`WebSocket client disconnected. Total: ${clients.size}`);
    broadcastClientCount();
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
    broadcastClientCount();
  });
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'CONNECTED',
    message: 'WebSocket connection established',
    timestamp: new Date().toISOString(),
    clientCount: clients.size
  }));
});

app.use(cors({
  origin: ['http://localhost:8080', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json());

// Middleware to authenticate JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'test123');
    req.user = decoded;
    next();
  } catch (error) {
    console.error('JWT verification error:', error.message);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// ==================== ROUTES ====================

// 1. Root route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Mini-Fleet Monitor Backend API',
    version: '1.0.0',
    endpoints: {
      auth: ['POST /auth/login'],
      robots: ['GET /robots', 'POST /robots/:id/move', 'POST /robots'],
      protected: ['GET /robots', 'POST /robots/:id/move', 'POST /robots', 'GET /auth/profile'],
      simulation: ['POST /simulation/start', 'POST /simulation/stop', 'GET /simulation/status'],
      system: ['GET /health', 'GET /ws/stats']
    },
    status: 'running',
    timestamp: new Date().toISOString(),
    websocket: 'ws://localhost:3000/ws',
    stats: {
      connected_clients: clients.size,
      redis: 'connected',
      database: 'connected'
    }
  });
});

// 2. Health check
app.get('/health', async (req, res) => {
  try {
    // Check database
    await pool.query('SELECT 1');
    
    // Check Redis
    await redisClient.ping();
    
    res.json({ 
      status: 'OK', 
      database: 'connected',
      redis: 'connected',
      websocket_clients: clients.size,
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 3. WebSocket stats
app.get('/ws/stats', (req, res) => {
  res.json({
    connectedClients: clients.size,
    clients: Array.from(clients).map(client => ({
      readyState: client.readyState === WebSocket.OPEN ? 'open' : 'closed'
    }))
  });
});

// 4. Login endpoint
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('Login attempt for:', email);
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Check cache first
    const cacheKey = `user:${email}`;
    let user = null;
    
    try {
      const cachedUser = await redisClient.get(cacheKey);
      if (cachedUser) {
        user = JSON.parse(cachedUser);
        console.log('📦 User retrieved from cache');
      }
    } catch (cacheError) {
      console.log('Cache miss or error:', cacheError.message);
    }

    // If not in cache, query database
    if (!user) {
      const result = await pool.query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );
      user = result.rows[0];
      
      // Cache user for 5 minutes
      if (user) {
        await redisClient.setEx(cacheKey, 300, JSON.stringify(user));
      }
    }

    // Special case for test user
    if (email === 'admin@test.com' && password === 'test123') {
      if (!user) {
        // Create test user if doesn't exist
        const passwordHash = await bcrypt.hash('test123', 10);
        const result = await pool.query(
          'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING *',
          ['admin@test.com', passwordHash]
        );
        user = result.rows[0];
      }
    }
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    let validPassword = false;
    if (email === 'admin@test.com' && password === 'test123') {
      // Direct comparison for test user
      validPassword = true;
    } else {
      validPassword = await bcrypt.compare(password, user.password_hash);
    }
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email,
        iat: Math.floor(Date.now() / 1000)
      },
      process.env.JWT_SECRET || 'test123',
      { expiresIn: '24h' }
    );

    const response = {
      token,
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.created_at
      }
    };

    console.log('Login successful for:', email);
    res.json(response);

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 5. Get all robots (PROTECTED with caching)
app.get('/robots', authenticateToken, async (req, res) => {
  try {
    console.log('Fetching robots for user:', req.user.email);
    
    // Check cache first
    const cacheKey = 'robots:all';
    let robots = null;
    
    try {
      const cachedRobots = await redisClient.get(cacheKey);
      if (cachedRobots) {
        robots = JSON.parse(cachedRobots);
        console.log('Robots retrieved from cache');
        return res.json(formatRobotsForResponse(robots));
      }
    } catch (cacheError) {
      console.log('Cache miss or error:', cacheError.message);
    }

    // Query database
    const result = await pool.query(
      'SELECT * FROM robots ORDER BY updated_at DESC'
    );
    
    robots = result.rows;
    
    // Cache for 10 seconds
    try {
      await redisClient.setEx(cacheKey, 10, JSON.stringify(robots));
    } catch (cacheError) {
      console.log('Cache set error:', cacheError.message);
    }
    
    res.json(formatRobotsForResponse(robots));
  } catch (error) {
    console.error('Error fetching robots:', error);
    res.status(500).json({ 
      error: 'Failed to fetch robots',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 6. Move robot (simulate movement) (PROTECTED)
app.post('/robots/:id/move', authenticateToken, async (req, res) => {
  try {
    const robotId = parseInt(req.params.id);
    
    console.log(`Moving robot ${robotId} for user:`, req.user.email);
    
    // Get current robot position
    const robotResult = await pool.query(
      'SELECT * FROM robots WHERE id = $1',
      [robotId]
    );
    
    const robot = robotResult.rows[0];
    
    if (!robot) {
      return res.status(404).json({ error: 'Robot not found' });
    }

    // Generate random position near current location
    const newLat = parseFloat(robot.lat) + (Math.random() - 0.5) * 0.01;
    const newLon = parseFloat(robot.lon) + (Math.random() - 0.5) * 0.01;
    
    // Start transaction for atomic updates
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Update robot position
      const updateResult = await client.query(
        `UPDATE robots 
         SET lat = $1, lon = $2, status = 'moving', updated_at = NOW()
         WHERE id = $3 
         RETURNING *`,
        [newLat, newLon, robotId]
      );
      
      const updatedRobot = updateResult.rows[0];
      
      // Save position to history
      await client.query(
        `INSERT INTO robot_positions (robot_id, lat, lon) 
         VALUES ($1, $2, $3)`,
        [robotId, newLat, newLon]
      );
      
      await client.query('COMMIT');
      
      const formattedRobot = formatRobotForResponse(updatedRobot);
      
      // Clear robots cache
      try {
        await redisClient.del('robots:all');
        await redisClient.del(`robot:${robotId}:positions`);
        await redisClient.del(`robot:${robotId}:statistics`);
      } catch (cacheError) {
        console.log('Cache delete error:', cacheError.message);
      }
      
      // Broadcast update via WebSocket
      broadcastRobotUpdate(updatedRobot);
      
      console.log(`✅ Robot ${robot.name} moved to ${newLat.toFixed(6)}, ${newLon.toFixed(6)}`);
      
      // Get position count
      const positionCountResult = await pool.query(
        'SELECT COUNT(*) as count FROM robot_positions WHERE robot_id = $1',
        [robotId]
      );
      
      res.json({
        success: true,
        message: `Robot ${robot.name} moved successfully`,
        robot: formattedRobot,
        history: {
          positionSaved: true,
          totalPositions: parseInt(positionCountResult.rows[0].count)
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Error moving robot:', error);
    res.status(500).json({ 
      error: 'Failed to move robot',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 7. Create new robot (PROTECTED)
app.post('/robots', authenticateToken, async (req, res) => {
  try {
    const { name, lat, lon } = req.body;
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Robot name is required' });
    }
    
    const defaultLat = 52.520008;
    const defaultLon = 13.404954;
    
    const result = await pool.query(
      `INSERT INTO robots (name, lat, lon, status) 
       VALUES ($1, $2, $3, 'idle') 
       RETURNING *`,
      [name.trim(), lat || defaultLat, lon || defaultLon]
    );
    
    const newRobot = result.rows[0];
    const formattedRobot = formatRobotForResponse(newRobot);
    
    // Clear robots cache
    try {
      await redisClient.del('robots:all');
    } catch (cacheError) {
      console.log('Cache delete error:', cacheError.message);
    }
    
    // Broadcast new robot via WebSocket
    broadcastRobotUpdate(newRobot);
    
    console.log(`✅ New robot created: ${name}`);
    
    res.status(201).json({
      success: true,
      message: `Robot "${name}" created successfully`,
      robot: formattedRobot
    });
    
  } catch (error) {
    console.error('❌ Error creating robot:', error);
    
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ error: 'Robot with this name already exists' });
    }
    
    res.status(500).json({ 
      error: 'Failed to create robot',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 8. Get robot by ID (PROTECTED)
app.get('/robots/:id', authenticateToken, async (req, res) => {
  try {
    const robotId = parseInt(req.params.id);
    
    const result = await pool.query(
      'SELECT * FROM robots WHERE id = $1',
      [robotId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Robot not found' });
    }
    
    const robot = result.rows[0];
    res.json(formatRobotForResponse(robot));
  } catch (error) {
    console.error('❌ Error fetching robot:', error);
    res.status(500).json({ 
      error: 'Failed to fetch robot',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 9. User profile (PROTECTED)
app.get('/auth/profile', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, created_at FROM users WHERE id = $1',
      [req.user.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error fetching profile:', error);
    res.status(500).json({ 
      error: 'Failed to fetch profile',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 10. Start/Stop simulation (PROTECTED) - UPDATED WITH POSITION HISTORY
let simulationInterval = null;

app.post('/simulation/start', authenticateToken, (req, res) => {
  if (simulationInterval) {
    return res.json({ message: 'Simulation is already running' });
  }
  
  simulationInterval = setInterval(async () => {
    try {
      const result = await pool.query('SELECT id FROM robots ORDER BY RANDOM() LIMIT 1');
      if (result.rows.length > 0) {
        const robotId = result.rows[0].id;
        
        // Move random robot
        const robotResult = await pool.query('SELECT * FROM robots WHERE id = $1', [robotId]);
        const robot = robotResult.rows[0];
        
        const newLat = parseFloat(robot.lat) + (Math.random() - 0.5) * 0.01;
        const newLon = parseFloat(robot.lon) + (Math.random() - 0.5) * 0.01;
        
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          
          // Update robot position
          await client.query(
            `UPDATE robots SET lat = $1, lon = $2, status = 'moving', updated_at = NOW() WHERE id = $3`,
            [newLat, newLon, robotId]
          );
          
          // Save position to history
          await client.query(
            `INSERT INTO robot_positions (robot_id, lat, lon) VALUES ($1, $2, $3)`,
            [robotId, newLat, newLon]
          );
          
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
        
        // Clear cache
        try {
          await redisClient.del('robots:all');
          await redisClient.del(`robot:${robotId}:positions`);
        } catch (cacheError) {
          console.log('Cache delete error:', cacheError.message);
        }
        
        // Get updated robot and broadcast
        const updatedResult = await pool.query('SELECT * FROM robots WHERE id = $1', [robotId]);
        const updatedRobot = updatedResult.rows[0];
        broadcastRobotUpdate(updatedRobot);
        
        console.log(`Auto-moved robot ${robot.name}`);
      }
    } catch (error) {
      console.error('Simulation error:', error);
    }
  }, 2000);
  
  console.log('Simulation started');
  res.json({ 
    success: true, 
    message: 'Simulation started',
    interval: '2000ms'
  });
});

app.post('/simulation/stop', authenticateToken, (req, res) => {
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
    console.log('Simulation stopped');
    res.json({ success: true, message: 'Simulation stopped' });
  } else {
    res.json({ message: 'Simulation is not running' });
  }
});

app.get('/simulation/status', authenticateToken, (req, res) => {
  res.json({ 
    isRunning: !!simulationInterval,
    interval: simulationInterval ? '2000ms' : null
  });
});

// 11. Get robot position history (PROTECTED)
app.get('/robots/:id/positions', authenticateToken, async (req, res) => {
  try {
    const robotId = parseInt(req.params.id);
    const limit = parseInt(req.query.limit) || 50;
    
    // Verify robot exists
    const robotResult = await pool.query(
      'SELECT id FROM robots WHERE id = $1',
      [robotId]
    );
    
    if (robotResult.rows.length === 0) {
      return res.status(404).json({ error: 'Robot not found' });
    }
    
    const positions = await pool.query(
      `SELECT * FROM robot_positions 
       WHERE robot_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [robotId, limit]
    );
    
    res.json({
      robotId,
      count: positions.rows.length,
      positions: positions.rows
    });
  } catch (error) {
    console.error('❌ Error fetching position history:', error);
    res.status(500).json({ 
      error: 'Failed to fetch position history',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 12. Get recent positions for all robots (PROTECTED)
app.get('/positions/recent', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    
    const positions = await pool.query(
      `SELECT rp.*, r.name as robot_name, r.status as robot_status
       FROM robot_positions rp
       JOIN robots r ON rp.robot_id = r.id
       ORDER BY rp.created_at DESC 
       LIMIT $1`,
      [limit]
    );
    
    res.json({
      count: positions.rows.length,
      positions: positions.rows
    });
  } catch (error) {
    console.error('❌ Error fetching recent positions:', error);
    res.status(500).json({ 
      error: 'Failed to fetch recent positions',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 13. Get robot travel statistics (PROTECTED)
app.get('/robots/:id/statistics', authenticateToken, async (req, res) => {
  try {
    const robotId = parseInt(req.params.id);
    
    // Verify robot exists
    const robotResult = await pool.query(
      'SELECT * FROM robots WHERE id = $1',
      [robotId]
    );
    
    if (robotResult.rows.length === 0) {
      return res.status(404).json({ error: 'Robot not found' });
    }
    
    const robot = robotResult.rows[0];
    
    // Get position count
    const countResult = await pool.query(
      'SELECT COUNT(*) as position_count FROM robot_positions WHERE robot_id = $1',
      [robotId]
    );
    
    // Get first position
    const firstPositionResult = await pool.query(
      `SELECT lat, lon, created_at 
       FROM robot_positions 
       WHERE robot_id = $1 
       ORDER BY created_at ASC 
       LIMIT 1`,
      [robotId]
    );
    
    // Get last position
    const lastPositionResult = await pool.query(
      `SELECT lat, lon, created_at 
       FROM robot_positions 
       WHERE robot_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [robotId]
    );
    
    // Calculate approximate travel distance (simplified)
    const positions = await pool.query(
      `SELECT lat, lon 
       FROM robot_positions 
       WHERE robot_id = $1 
       ORDER BY created_at`,
      [robotId]
    );
    
    let totalDistance = 0;
    const positionsArray = positions.rows;
    
    for (let i = 1; i < positionsArray.length; i++) {
      const prev = positionsArray[i - 1];
      const curr = positionsArray[i];
      
      // Haversine formula for distance between two points
      const R = 6371; // Earth's radius in km
      const dLat = (curr.lat - prev.lat) * Math.PI / 180;
      const dLon = (curr.lon - prev.lon) * Math.PI / 180;
      const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(prev.lat * Math.PI / 180) * Math.cos(curr.lat * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      totalDistance += R * c;
    }
    
    res.json({
      robotId,
      robotName: robot.name,
      statistics: {
        positionCount: parseInt(countResult.rows[0].position_count),
        firstPosition: firstPositionResult.rows[0] || null,
        lastPosition: lastPositionResult.rows[0] || null,
        approximateDistanceKm: totalDistance.toFixed(2),
        activeSince: firstPositionResult.rows[0]?.created_at || robot.updated_at
      }
    });
  } catch (error) {
    console.error('❌ Error fetching robot statistics:', error);
    res.status(500).json({ 
      error: 'Failed to fetch robot statistics',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Handle 404 for undefined routes
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    method: req.method,
    availableRoutes: [
      'GET /',
      'GET /health',
      'GET /ws/stats',
      'POST /auth/login',
      'GET /auth/profile (protected)',
      'GET /robots (protected)',
      'POST /robots (protected)',
      'GET /robots/:id (protected)',
      'POST /robots/:id/move (protected)',
      'GET /robots/:id/positions (protected)',
      'GET /positions/recent (protected)',
      'GET /robots/:id/statistics (protected)',
      'POST /simulation/start (protected)',
      'POST /simulation/stop (protected)',
      'GET /simulation/status (protected)'
    ]
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
    timestamp: new Date().toISOString()
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
  ================================================
      Mini-Fleet Monitor Backend Server
  ================================================
  
  Port: ${PORT}
  Database: ${process.env.DATABASE_URL ? 'Connected' : 'Using default'}
  JWT: ${process.env.JWT_SECRET ? 'Secure' : 'Using default (test123)'}
  Redis: Connected
  WebSocket: ws://localhost:${PORT}/ws
  Frontend: http://localhost:8080
  API Base: http://localhost:${PORT}
  
  Available Routes:
    GET  /                    - API Information
    GET  /health              - Health check
    GET  /ws/stats            - WebSocket statistics
    POST /auth/login          - Login
    GET  /auth/profile        - User profile (protected)
    GET  /robots              - Get all robots (protected)
    POST /robots              - Create robot (protected)
    GET  /robots/:id          - Get robot by ID (protected)
    POST /robots/:id/move     - Move robot (protected)
    GET  /robots/:id/positions - Get position history (protected)
    GET  /positions/recent    - Get recent positions (protected)
    GET  /robots/:id/statistics - Get robot statistics (protected)
    POST /simulation/start    - Start auto-simulation
    POST /simulation/stop     - Stop auto-simulation
    GET  /simulation/status   - Check simulation status
  
  Server started at ${new Date().toLocaleTimeString()}
  `);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: shutting down gracefully');
  
  if (simulationInterval) {
    clearInterval(simulationInterval);
  }
  
  await pool.end();
  await redisClient.quit();
  
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});