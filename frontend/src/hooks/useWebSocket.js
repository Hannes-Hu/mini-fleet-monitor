import { useEffect, useRef } from 'react';
import websocketService from '../services/websocket';

const useWebSocket = (url, onMessage) => {
  const onMessageRef = useRef();

  // Update the ref when onMessage changes
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!url) return;

    // Connect to WebSocket
    websocketService.connect(url);

    // Set up message handler
    const cleanupHandler = websocketService.onMessage((data) => {
      if (onMessageRef.current) {
        onMessageRef.current(data);
      }
    });

    // Set up connection handlers
    const handleConnect = () => {
      console.log('WebSocket connected via hook');
    };

    const handleDisconnect = () => {
      console.log('WebSocket disconnected via hook');
    };

    const connectCleanup = websocketService.onConnect(handleConnect);
    const disconnectCleanup = websocketService.onDisconnect(handleDisconnect);

    // Send ping every 30 seconds to keep connection alive
    const pingInterval = setInterval(() => {
      if (websocketService.isConnected()) {
        websocketService.send({ type: 'PING', timestamp: Date.now() });
      }
    }, 30000);

    // Cleanup on unmount
    return () => {
      cleanupHandler();
      connectCleanup();
      disconnectCleanup();
      clearInterval(pingInterval);
      websocketService.disconnect();
    };
  }, [url]);

  return {
    send: websocketService.send,
    isConnected: websocketService.isConnected
  };
};

export default useWebSocket;