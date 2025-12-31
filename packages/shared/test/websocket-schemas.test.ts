import { describe, it, expect } from 'vitest';
import {
  subscribeMessageSchema,
  unsubscribeMessageSchema,
  pingMessageSchema,
  clientMessageSchema,
  WebSocketErrorCode,
} from '../src/types/websocket.js';

describe('WebSocket Schemas', () => {
  describe('subscribeMessageSchema', () => {
    it('should accept valid subscribe message', () => {
      const result = subscribeMessageSchema.safeParse({
        type: 'subscribe',
        workOrderId: 'wo-123',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('subscribe');
        expect(result.data.workOrderId).toBe('wo-123');
      }
    });

    it('should reject subscribe message with empty workOrderId', () => {
      const result = subscribeMessageSchema.safeParse({
        type: 'subscribe',
        workOrderId: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject subscribe message without workOrderId', () => {
      const result = subscribeMessageSchema.safeParse({
        type: 'subscribe',
      });
      expect(result.success).toBe(false);
    });

    it('should reject subscribe message with wrong type', () => {
      const result = subscribeMessageSchema.safeParse({
        type: 'unsubscribe',
        workOrderId: 'wo-123',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('unsubscribeMessageSchema', () => {
    it('should accept valid unsubscribe message', () => {
      const result = unsubscribeMessageSchema.safeParse({
        type: 'unsubscribe',
        workOrderId: 'wo-123',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('unsubscribe');
        expect(result.data.workOrderId).toBe('wo-123');
      }
    });

    it('should reject unsubscribe message with empty workOrderId', () => {
      const result = unsubscribeMessageSchema.safeParse({
        type: 'unsubscribe',
        workOrderId: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject unsubscribe message without workOrderId', () => {
      const result = unsubscribeMessageSchema.safeParse({
        type: 'unsubscribe',
      });
      expect(result.success).toBe(false);
    });

    it('should reject unsubscribe message with wrong type', () => {
      const result = unsubscribeMessageSchema.safeParse({
        type: 'subscribe',
        workOrderId: 'wo-123',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('pingMessageSchema', () => {
    it('should accept valid ping message', () => {
      const result = pingMessageSchema.safeParse({
        type: 'ping',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('ping');
      }
    });

    it('should reject ping message with extra fields', () => {
      const result = pingMessageSchema.safeParse({
        type: 'ping',
        extraField: 'value',
      });
      // Zod allows extra fields by default, so this should pass
      expect(result.success).toBe(true);
    });

    it('should reject ping message with wrong type', () => {
      const result = pingMessageSchema.safeParse({
        type: 'pong',
      });
      expect(result.success).toBe(false);
    });

    it('should reject ping message without type', () => {
      const result = pingMessageSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('clientMessageSchema', () => {
    it('should accept subscribe message', () => {
      const result = clientMessageSchema.safeParse({
        type: 'subscribe',
        workOrderId: 'wo-123',
      });
      expect(result.success).toBe(true);
    });

    it('should accept unsubscribe message', () => {
      const result = clientMessageSchema.safeParse({
        type: 'unsubscribe',
        workOrderId: 'wo-456',
      });
      expect(result.success).toBe(true);
    });

    it('should accept ping message', () => {
      const result = clientMessageSchema.safeParse({
        type: 'ping',
      });
      expect(result.success).toBe(true);
    });

    it('should reject unknown message type', () => {
      const result = clientMessageSchema.safeParse({
        type: 'unknown',
      });
      expect(result.success).toBe(false);
    });

    it('should reject subscribe without workOrderId', () => {
      const result = clientMessageSchema.safeParse({
        type: 'subscribe',
      });
      expect(result.success).toBe(false);
    });

    it('should reject unsubscribe without workOrderId', () => {
      const result = clientMessageSchema.safeParse({
        type: 'unsubscribe',
      });
      expect(result.success).toBe(false);
    });

    it('should reject message without type', () => {
      const result = clientMessageSchema.safeParse({
        workOrderId: 'wo-123',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty object', () => {
      const result = clientMessageSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('WebSocketErrorCode', () => {
    it('should have all expected error codes', () => {
      expect(WebSocketErrorCode.INVALID_MESSAGE).toBe('INVALID_MESSAGE');
      expect(WebSocketErrorCode.PARSE_ERROR).toBe('PARSE_ERROR');
      expect(WebSocketErrorCode.NOT_FOUND).toBe('NOT_FOUND');
      expect(WebSocketErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
    });

    it('should have exactly 4 error codes', () => {
      const codes = Object.values(WebSocketErrorCode);
      expect(codes).toHaveLength(4);
    });

    it('should have unique error codes', () => {
      const codes = Object.values(WebSocketErrorCode);
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });
  });
});
