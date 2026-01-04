/**
 * Interactive Development Server
 * Provides a development dashboard and real-time monitoring.
 *
 * (v0.2.27 - Thrust 20: Interactive Development Server)
 */

import { createLogger } from '../utils/logger.js';
import { EventEmitter } from 'node:events';
import type { Server as HttpServer } from 'node:http';

const log = createLogger('dev-server');

/**
 * Dev server configuration
 */
export interface DevServerConfig {
  /** Server port */
  port: number;
  /** Host to bind to */
  host: string;
  /** Enable hot reload */
  hotReload: boolean;
  /** Enable WebSocket updates */
  liveUpdates: boolean;
  /** Dashboard path */
  dashboardPath: string;
  /** API prefix */
  apiPrefix: string;
}

/**
 * Server status
 */
export interface DevServerStatus {
  running: boolean;
  port: number;
  host: string;
  startedAt: Date | null;
  uptime: number;
  connections: number;
  requests: number;
}

/**
 * Dashboard data
 */
export interface DashboardData {
  server: DevServerStatus;
  workOrders: WorkOrderSummary[];
  runs: RunSummary[];
  metrics: ServerMetrics;
  recentEvents: DashboardEvent[];
}

/**
 * Work order summary for dashboard
 */
export interface WorkOrderSummary {
  id: string;
  task: string;
  status: string;
  createdAt: Date;
  iterations: number;
}

/**
 * Run summary for dashboard
 */
export interface RunSummary {
  id: string;
  workOrderId: string;
  status: string;
  startedAt: Date;
  duration: number;
  currentStep?: string;
}

/**
 * Server metrics
 */
export interface ServerMetrics {
  activeRuns: number;
  queuedWorkOrders: number;
  completedToday: number;
  failedToday: number;
  avgIterations: number;
  avgDuration: number;
}

/**
 * Dashboard event
 */
export interface DashboardEvent {
  id: string;
  type: string;
  message: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}

/**
 * Interactive Development Server
 */
export class DevServer {
  private static instance: DevServer | null = null;
  private config: DevServerConfig;
  private emitter: EventEmitter;
  private httpServer: HttpServer | null = null;
  private status: DevServerStatus;
  private events: DashboardEvent[] = [];
  private maxEvents: number = 100;

  private constructor(config: Partial<DevServerConfig> = {}) {
    this.config = {
      port: 3002,
      host: 'localhost',
      hotReload: true,
      liveUpdates: true,
      dashboardPath: '/dashboard',
      apiPrefix: '/api/dev',
      ...config,
    };
    this.emitter = new EventEmitter();
    this.status = {
      running: false,
      port: this.config.port,
      host: this.config.host,
      startedAt: null,
      uptime: 0,
      connections: 0,
      requests: 0,
    };
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<DevServerConfig>): DevServer {
    if (!DevServer.instance) {
      DevServer.instance = new DevServer(config);
    }
    return DevServer.instance;
  }

  /**
   * Reset singleton for testing
   */
  static resetInstance(): void {
    if (DevServer.instance) {
      DevServer.instance.stop();
    }
    DevServer.instance = null;
  }

  /**
   * Get server configuration
   */
  getConfig(): Readonly<DevServerConfig> {
    return this.config;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<DevServerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get server status
   */
  getStatus(): DevServerStatus {
    if (this.status.startedAt) {
      this.status.uptime = Date.now() - this.status.startedAt.getTime();
    }
    return { ...this.status };
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.status.running;
  }

  /**
   * Start the development server
   */
  async start(): Promise<void> {
    if (this.status.running) {
      log.warn('Dev server already running');
      return;
    }

    log.info({ port: this.config.port, host: this.config.host }, 'Starting dev server');

    // Create HTTP server
    const http = await import('node:http');
    this.httpServer = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      this.httpServer!.listen(this.config.port, this.config.host, () => {
        this.status.running = true;
        this.status.startedAt = new Date();
        log.info(
          { port: this.config.port, host: this.config.host },
          'Dev server started'
        );
        resolve();
      });

      this.httpServer!.on('error', (err) => {
        log.error({ error: err.message }, 'Dev server error');
        reject(err);
      });
    });

    this.addEvent('server:started', 'Development server started');
  }

  /**
   * Stop the development server
   */
  async stop(): Promise<void> {
    if (!this.status.running || !this.httpServer) {
      return;
    }

    log.info('Stopping dev server');

    await new Promise<void>((resolve) => {
      this.httpServer!.close(() => {
        this.status.running = false;
        this.httpServer = null;
        log.info('Dev server stopped');
        resolve();
      });
    });

    this.addEvent('server:stopped', 'Development server stopped');
  }

  /**
   * Handle HTTP request
   */
  private handleRequest(
    req: import('node:http').IncomingMessage,
    res: import('node:http').ServerResponse
  ): void {
    this.status.requests++;
    const url = new URL(req.url ?? '/', `http://${this.config.host}`);
    const path = url.pathname;

    // Set CORS headers for development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Route handling
    if (path === this.config.dashboardPath) {
      this.serveDashboard(res);
    } else if (path === `${this.config.apiPrefix}/status`) {
      this.serveJson(res, this.getStatus());
    } else if (path === `${this.config.apiPrefix}/dashboard`) {
      this.serveJson(res, this.getDashboardData());
    } else if (path === `${this.config.apiPrefix}/events`) {
      this.serveJson(res, this.events);
    } else if (path === `${this.config.apiPrefix}/metrics`) {
      this.serveJson(res, this.getMetrics());
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  }

  /**
   * Serve dashboard HTML
   */
  private serveDashboard(res: import('node:http').ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(this.generateDashboardHtml());
  }

  /**
   * Serve JSON response
   */
  private serveJson(res: import('node:http').ServerResponse, data: unknown): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data, null, 2));
  }

  /**
   * Generate dashboard HTML
   */
  private generateDashboardHtml(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AgentGate Dev Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #eee; }
    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
    .header { display: flex; justify-content: space-between; align-items: center; padding: 20px 0; border-bottom: 1px solid #333; }
    .header h1 { font-size: 24px; color: #4ecdc4; }
    .status-badge { padding: 8px 16px; border-radius: 20px; font-size: 14px; }
    .status-running { background: #27ae60; }
    .status-stopped { background: #e74c3c; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-top: 20px; }
    .card { background: #16213e; border-radius: 12px; padding: 20px; }
    .card h2 { font-size: 16px; color: #888; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 1px; }
    .metric { font-size: 36px; font-weight: bold; color: #4ecdc4; }
    .metric-label { font-size: 14px; color: #888; margin-top: 5px; }
    .event-list { max-height: 300px; overflow-y: auto; }
    .event { padding: 10px; border-bottom: 1px solid #333; font-size: 13px; }
    .event-time { color: #888; font-size: 11px; }
    .event-type { color: #4ecdc4; font-weight: bold; }
    .refresh-btn { background: #4ecdc4; color: #1a1a2e; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold; }
    .refresh-btn:hover { background: #3dbdb5; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>AgentGate Development Dashboard</h1>
      <div>
        <span id="status" class="status-badge status-running">Running</span>
        <button class="refresh-btn" onclick="refresh()">Refresh</button>
      </div>
    </div>
    <div class="grid">
      <div class="card">
        <h2>Server Status</h2>
        <div class="metric" id="uptime">--</div>
        <div class="metric-label">Uptime</div>
      </div>
      <div class="card">
        <h2>Active Runs</h2>
        <div class="metric" id="activeRuns">0</div>
        <div class="metric-label">Currently executing</div>
      </div>
      <div class="card">
        <h2>Queued</h2>
        <div class="metric" id="queued">0</div>
        <div class="metric-label">Work orders waiting</div>
      </div>
      <div class="card">
        <h2>Completed Today</h2>
        <div class="metric" id="completed">0</div>
        <div class="metric-label">Successfully finished</div>
      </div>
    </div>
    <div class="card" style="margin-top: 20px;">
      <h2>Recent Events</h2>
      <div id="events" class="event-list"></div>
    </div>
  </div>
  <script>
    const apiPrefix = '${this.config.apiPrefix}';

    async function refresh() {
      try {
        const [statusRes, dashboardRes, eventsRes] = await Promise.all([
          fetch(apiPrefix + '/status'),
          fetch(apiPrefix + '/dashboard'),
          fetch(apiPrefix + '/events')
        ]);

        const status = await statusRes.json();
        const dashboard = await dashboardRes.json();
        const events = await eventsRes.json();

        // Update status
        document.getElementById('uptime').textContent = formatDuration(status.uptime);
        document.getElementById('activeRuns').textContent = dashboard.metrics.activeRuns;
        document.getElementById('queued').textContent = dashboard.metrics.queuedWorkOrders;
        document.getElementById('completed').textContent = dashboard.metrics.completedToday;

        // Update events
        const eventsEl = document.getElementById('events');
        eventsEl.innerHTML = events.slice(0, 20).map(e => \`
          <div class="event">
            <span class="event-time">\${new Date(e.timestamp).toLocaleTimeString()}</span>
            <span class="event-type">\${e.type}</span>: \${e.message}
          </div>
        \`).join('');
      } catch (err) {
        console.error('Failed to refresh:', err);
      }
    }

    function formatDuration(ms) {
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      if (hours > 0) return hours + 'h ' + (minutes % 60) + 'm';
      if (minutes > 0) return minutes + 'm ' + (seconds % 60) + 's';
      return seconds + 's';
    }

    // Auto-refresh every 5 seconds
    setInterval(refresh, 5000);
    refresh();
  </script>
</body>
</html>
`;
  }

  /**
   * Get dashboard data
   */
  getDashboardData(): DashboardData {
    return {
      server: this.getStatus(),
      workOrders: [],
      runs: [],
      metrics: this.getMetrics(),
      recentEvents: this.events.slice(-20),
    };
  }

  /**
   * Get metrics
   */
  getMetrics(): ServerMetrics {
    // In a real implementation, these would be fetched from the actual stores
    return {
      activeRuns: 0,
      queuedWorkOrders: 0,
      completedToday: 0,
      failedToday: 0,
      avgIterations: 0,
      avgDuration: 0,
    };
  }

  /**
   * Add an event
   */
  addEvent(type: string, message: string, data?: Record<string, unknown>): void {
    const event: DashboardEvent = {
      id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      message,
      timestamp: new Date(),
      data,
    };

    this.events.push(event);

    // Trim old events
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    this.emitter.emit('event', event);
  }

  /**
   * Subscribe to events
   */
  onEvent(handler: (event: DashboardEvent) => void): void {
    this.emitter.on('event', handler);
  }

  /**
   * Unsubscribe from events
   */
  offEvent(handler: (event: DashboardEvent) => void): void {
    this.emitter.off('event', handler);
  }

  /**
   * Clear all events
   */
  clearEvents(): void {
    this.events = [];
  }

  /**
   * Get all events
   */
  getEvents(): readonly DashboardEvent[] {
    return this.events;
  }
}

/**
 * Get dev server instance
 */
export function getDevServer(config?: Partial<DevServerConfig>): DevServer {
  return DevServer.getInstance(config);
}

/**
 * Check if dev server is running
 */
export function isDevServerRunning(): boolean {
  return getDevServer().isRunning();
}

/**
 * Reset dev server for testing
 */
export function resetDevServer(): void {
  DevServer.resetInstance();
}
