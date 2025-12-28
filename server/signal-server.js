const WebSocket = require('ws');

// Simple "Doorbell" Signal Server
// This server is stateless and only broadcasts messages to other clients in the same room.

const wss = new WebSocket.Server({ port: 8080 });

console.log('Signal Proxy Server started on port 8080');

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      // Expected format: { room: "project-id", type: "REFRESH", sender: "user-id" }
      if (data.room && data.type) {
        // Broadcast to everyone else in the same room
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            // We could filter by room here if we tracked it on the socket object
            // For now, we'll just broadcast everything and let clients filter
            client.send(message);
          }
        });
      }
    } catch (e) {
      console.error('Error parsing message:', e);
    }
  });
});

// Keep connections alive
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(interval);
});
