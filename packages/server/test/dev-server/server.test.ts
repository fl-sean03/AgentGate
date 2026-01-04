/**
 * Tests for Interactive Development Server.
 * (v0.2.27 - Thrust 20: Interactive Development Server)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DevServer,
  getDevServer,
  isDevServerRunning,
  resetDevServer,
  type DashboardEvent,
} from '../../src/dev-server/server.js';

describe('Dev Server', () => {
  beforeEach(() => {
    resetDevServer();
  });

  afterEach(async () => {
    // Ensure server is stopped after each test
    const server = getDevServer();
    if (server.isRunning()) {
      await server.stop();
    }
    resetDevServer();
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const instance1 = getDevServer();
      const instance2 = getDevServer();
      expect(instance1).toBe(instance2);
    });

    it('should reset instance', () => {
      const instance1 = getDevServer();
      resetDevServer();
      const instance2 = getDevServer();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('configuration', () => {
    it('should have default config', () => {
      const server = getDevServer();
      const config = server.getConfig();

      expect(config.port).toBe(3002);
      expect(config.host).toBe('localhost');
      expect(config.hotReload).toBe(true);
      expect(config.liveUpdates).toBe(true);
    });

    it('should accept custom config', () => {
      resetDevServer();
      const server = getDevServer({ port: 4000, host: '0.0.0.0' });
      const config = server.getConfig();

      expect(config.port).toBe(4000);
      expect(config.host).toBe('0.0.0.0');
    });

    it('should update config', () => {
      const server = getDevServer();
      server.updateConfig({ hotReload: false });

      expect(server.getConfig().hotReload).toBe(false);
    });
  });

  describe('status', () => {
    it('should show not running initially', () => {
      const server = getDevServer();
      expect(server.isRunning()).toBe(false);
    });

    it('should get status details', () => {
      const server = getDevServer();
      const status = server.getStatus();

      expect(status.running).toBe(false);
      expect(status.port).toBe(3002);
      expect(status.host).toBe('localhost');
      expect(status.startedAt).toBeNull();
      expect(status.connections).toBe(0);
      expect(status.requests).toBe(0);
    });
  });

  describe('isDevServerRunning helper', () => {
    it('should reflect running state', () => {
      expect(isDevServerRunning()).toBe(false);
    });
  });

  describe('start/stop', () => {
    it('should start and stop server', async () => {
      const server = getDevServer({ port: 3099 }); // Use unique port

      await server.start();
      expect(server.isRunning()).toBe(true);

      const status = server.getStatus();
      expect(status.startedAt).not.toBeNull();

      await server.stop();
      expect(server.isRunning()).toBe(false);
    });

    it('should not error on double start', async () => {
      const server = getDevServer({ port: 3098 });

      await server.start();
      await server.start(); // Should not throw

      expect(server.isRunning()).toBe(true);
      await server.stop();
    });

    it('should not error on stop when not running', async () => {
      const server = getDevServer();
      await server.stop(); // Should not throw
    });
  });

  describe('events', () => {
    it('should add events', () => {
      const server = getDevServer();

      server.addEvent('test:event', 'Test message', { foo: 'bar' });

      const events = server.getEvents();
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('test:event');
      expect(events[0].message).toBe('Test message');
      expect(events[0].data?.foo).toBe('bar');
    });

    it('should limit event count', () => {
      const server = getDevServer();

      // Add more than max events
      for (let i = 0; i < 150; i++) {
        server.addEvent('test', `Event ${i}`);
      }

      const events = server.getEvents();
      expect(events.length).toBeLessThanOrEqual(100);
    });

    it('should emit event notifications', () => {
      const server = getDevServer();
      const received: DashboardEvent[] = [];

      server.onEvent((event) => {
        received.push(event);
      });

      server.addEvent('notify:test', 'Notification');

      expect(received.length).toBe(1);
      expect(received[0].type).toBe('notify:test');
    });

    it('should clear events', () => {
      const server = getDevServer();

      server.addEvent('a', 'A');
      server.addEvent('b', 'B');
      server.clearEvents();

      expect(server.getEvents().length).toBe(0);
    });
  });

  describe('dashboard data', () => {
    it('should return dashboard data', () => {
      const server = getDevServer();
      const data = server.getDashboardData();

      expect(data.server).toBeDefined();
      expect(data.workOrders).toBeDefined();
      expect(data.runs).toBeDefined();
      expect(data.metrics).toBeDefined();
      expect(data.recentEvents).toBeDefined();
    });

    it('should include recent events', () => {
      const server = getDevServer();

      server.addEvent('test1', 'Event 1');
      server.addEvent('test2', 'Event 2');

      const data = server.getDashboardData();
      expect(data.recentEvents.length).toBe(2);
    });
  });

  describe('metrics', () => {
    it('should return metrics', () => {
      const server = getDevServer();
      const metrics = server.getMetrics();

      expect(metrics.activeRuns).toBeDefined();
      expect(metrics.queuedWorkOrders).toBeDefined();
      expect(metrics.completedToday).toBeDefined();
      expect(metrics.failedToday).toBeDefined();
      expect(metrics.avgIterations).toBeDefined();
      expect(metrics.avgDuration).toBeDefined();
    });
  });

  describe('uptime calculation', () => {
    it('should calculate uptime when running', async () => {
      const server = getDevServer({ port: 3097 });

      await server.start();

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      const status = server.getStatus();
      expect(status.uptime).toBeGreaterThan(0);

      await server.stop();
    });
  });
});
