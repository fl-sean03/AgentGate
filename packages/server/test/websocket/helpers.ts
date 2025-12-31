import WebSocket from 'ws';

export interface TestWebSocket extends WebSocket {
  messages: unknown[];
  waitForMessage: (predicate?: (msg: unknown) => boolean, timeout?: number) => Promise<unknown>;
}

export function createTestWebSocket(url: string): Promise<TestWebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url) as TestWebSocket;
    ws.messages = [];

    ws.waitForMessage = (predicate, timeout = 5000) => {
      return new Promise((res, rej) => {
        // Check existing messages first
        const existing = ws.messages.find(m => !predicate || predicate(m));
        if (existing) {
          return res(existing);
        }

        const timer = setTimeout(() => {
          rej(new Error(`Timeout waiting for message`));
        }, timeout);

        const handler = (data: WebSocket.Data) => {
          const msg = JSON.parse(data.toString());
          if (!predicate || predicate(msg)) {
            clearTimeout(timer);
            ws.off('message', handler);
            res(msg);
          }
        };

        ws.on('message', handler);
      });
    };

    ws.on('open', () => resolve(ws));
    ws.on('error', reject);

    ws.on('message', (data) => {
      ws.messages.push(JSON.parse(data.toString()));
    });
  });
}

export function sendMessage(ws: WebSocket, message: object): void {
  ws.send(JSON.stringify(message));
}

export async function waitFor(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
