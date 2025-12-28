/**
 * SignalClient - Handles the "Doorbell" protocol via WebSocket
 * Notifies other clients when changes are written to the shared folder.
 */

export class SignalClient {
  private ws: WebSocket | null = null;
  private url: string = 'ws://localhost:8080';
  private roomId: string = 'default-room';
  private userId: string = '';
  private reconnectInterval: number = 5000;
  private isConnected: boolean = false;
  private refreshCallbacks: Array<() => void> = [];

  constructor() {}

  /**
   * Connect to the Signal Proxy Server
   */
  connect(roomId: string, userId: string, url: string = 'ws://localhost:8080'): void {
    this.roomId = roomId;
    this.userId = userId;
    this.url = url;
    this.initWebSocket();
  }

  private initWebSocket(): void {
    if (this.ws) {
      this.ws.close();
    }

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[SignalClient] Connected to Signal Proxy');
        this.isConnected = true;
        // Join room message could be sent here if the server supported it
      };

      this.ws.onmessage = (event) => {
        try {
          if (typeof event.data === 'string') {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          } else {
             // Handle Blob/ArrayBuffer if necessary, but we expect JSON text
             // For now ignore
          }
        } catch (e) {
          console.error('[SignalClient] Error parsing message:', e);
        }
      };

      this.ws.onclose = () => {
        console.log('[SignalClient] Disconnected. Reconnecting in', this.reconnectInterval, 'ms');
        this.isConnected = false;
        setTimeout(() => this.initWebSocket(), this.reconnectInterval);
      };

      this.ws.onerror = (error) => {
        console.error('[SignalClient] WebSocket error:', error);
        this.ws?.close(); // Trigger onclose to reconnect
      };

    } catch (e) {
      console.error('[SignalClient] Connection failed:', e);
      setTimeout(() => this.initWebSocket(), this.reconnectInterval);
    }
  }

  private handleMessage(data: any): void {
    if (data.room === this.roomId && data.type === 'REFRESH') {
      // Don't trigger for our own messages (though server should ideally exclude us)
      if (data.sender !== this.userId) {
        console.log('[SignalClient] Received REFRESH signal');
        this.notifyRefresh();
      }
    }
  }

  /**
   * Send a "Doorbell" ring to other clients
   */
  sendRefresh(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // If offline, we just skip the signal. Polling is the fallback.
      return;
    }

    const message = JSON.stringify({
      room: this.roomId,
      type: 'REFRESH',
      sender: this.userId
    });

    this.ws.send(message);
  }

  /**
   * Subscribe to refresh signals
   */
  onRefresh(callback: () => void): () => void {
    this.refreshCallbacks.push(callback);
    return () => {
      this.refreshCallbacks = this.refreshCallbacks.filter(cb => cb !== callback);
    };
  }

  private notifyRefresh(): void {
    this.refreshCallbacks.forEach(cb => cb());
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
