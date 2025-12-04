const WebSocket = require('ws');
const { authenticateWebSocket } = require('../middleware/authMiddleware');

let wss = null;
const clients = new Map();

const initializeWebSocket = (server) => {
  wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const urlParams = new URLSearchParams(req.url.split('?')[1]);
    const token = urlParams.get('token');
    
    // Authenticate client
    const user = authenticateWebSocket(token);
    
    if (!user) {
      ws.close(1008, 'Authentication failed');
      return;
    }

    const clientId = Date.now().toString();
    clients.set(clientId, { ws, user });

    console.log(`WebSocket client connected: ${clientId}, User: ${user.email}`);

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'CONNECTED',
      message: 'WebSocket connection established',
      clientId
    }));

    // Handle messages from client
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        console.log('Received message:', data);
        
        // Handle different message types
        switch (data.type) {
          case 'PING':
            ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
            break;
          default:
            console.log('Unknown message type:', data.type);
        }
      } catch (error) {
        console.error('Error processing message:', error);
      }
    });

    // Handle client disconnect
    ws.on('close', () => {
      clients.delete(clientId);
      console.log(`WebSocket client disconnected: ${clientId}`);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      clients.delete(clientId);
    });
  });

  console.log('WebSocket server initialized');
};

const broadcastUpdate = (data) => {
  if (!wss) {
    console.error('WebSocket server not initialized');
    return;
  }

  const message = JSON.stringify(data);
  let clientCount = 0;

  clients.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
      clientCount++;
    }
  });

  if (clientCount > 0) {
    console.log(`Broadcasted update to ${clientCount} clients`);
  }
};

const getConnectedClients = () => {
  return Array.from(clients.values()).map(client => ({
    userId: client.user.userId,
    email: client.user.email
  }));
};

module.exports = {
  initializeWebSocket,
  broadcastUpdate,
  getConnectedClients
};