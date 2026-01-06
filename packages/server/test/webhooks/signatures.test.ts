/**
 * Webhook Signatures Tests
 */

import { describe, it, expect } from 'vitest';
import {
  generateSignature,
  parseSignatureHeader,
  verifySignature,
  generateWebhookHeaders,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  SIGNATURE_VERSION,
} from '../../src/webhooks/signatures.js';

describe('Webhook Signatures', () => {
  const testSecret = 'test-secret-key';
  const testPayload = JSON.stringify({ event: 'test', data: { foo: 'bar' } });
  const testTimestamp = Date.now();

  describe('generateSignature', () => {
    it('should generate a valid signature', () => {
      const signature = generateSignature(testPayload, testSecret, testTimestamp);

      expect(signature).toMatch(/^v1=[a-f0-9]+$/);
    });

    it('should generate consistent signatures for same input', () => {
      const sig1 = generateSignature(testPayload, testSecret, testTimestamp);
      const sig2 = generateSignature(testPayload, testSecret, testTimestamp);

      expect(sig1).toBe(sig2);
    });

    it('should generate different signatures for different payloads', () => {
      const sig1 = generateSignature('payload1', testSecret, testTimestamp);
      const sig2 = generateSignature('payload2', testSecret, testTimestamp);

      expect(sig1).not.toBe(sig2);
    });

    it('should generate different signatures for different secrets', () => {
      const sig1 = generateSignature(testPayload, 'secret1', testTimestamp);
      const sig2 = generateSignature(testPayload, 'secret2', testTimestamp);

      expect(sig1).not.toBe(sig2);
    });

    it('should generate different signatures for different timestamps', () => {
      const sig1 = generateSignature(testPayload, testSecret, 1000);
      const sig2 = generateSignature(testPayload, testSecret, 2000);

      expect(sig1).not.toBe(sig2);
    });
  });

  describe('parseSignatureHeader', () => {
    it('should parse valid signature header', () => {
      const header = 'v1=abc123def456';
      const result = parseSignatureHeader(header);

      expect(result).toEqual({
        version: 'v1',
        signature: 'abc123def456',
      });
    });

    it('should return null for invalid format', () => {
      expect(parseSignatureHeader('invalid')).toBeNull();
      expect(parseSignatureHeader('v1abc123')).toBeNull();
      expect(parseSignatureHeader('=abc123')).toBeNull();
      expect(parseSignatureHeader('')).toBeNull();
    });

    it('should handle different versions', () => {
      const result = parseSignatureHeader('v2=abc123');
      expect(result?.version).toBe('v2');
    });
  });

  describe('verifySignature', () => {
    it('should verify valid signature', () => {
      const timestamp = Date.now();
      const signature = generateSignature(testPayload, testSecret, timestamp);

      const result = verifySignature(
        testPayload,
        testSecret,
        signature,
        timestamp.toString()
      );

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid signature', () => {
      const timestamp = Date.now();
      const result = verifySignature(
        testPayload,
        testSecret,
        'v1=invalidhex0123456789abcdef',
        timestamp.toString()
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject expired timestamp', () => {
      const oldTimestamp = Date.now() - 10 * 60 * 1000; // 10 minutes ago
      const signature = generateSignature(testPayload, testSecret, oldTimestamp);

      const result = verifySignature(
        testPayload,
        testSecret,
        signature,
        oldTimestamp.toString()
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('old');
    });

    it('should reject future timestamp', () => {
      const futureTimestamp = Date.now() + 5 * 60 * 1000; // 5 minutes in future
      const signature = generateSignature(testPayload, testSecret, futureTimestamp);

      const result = verifySignature(
        testPayload,
        testSecret,
        signature,
        futureTimestamp.toString()
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('future');
    });

    it('should reject invalid timestamp', () => {
      const result = verifySignature(
        testPayload,
        testSecret,
        'v1=abc123',
        'not-a-number'
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid timestamp');
    });

    it('should reject unsupported signature version', () => {
      const timestamp = Date.now();
      const result = verifySignature(
        testPayload,
        testSecret,
        'v99=abc123def456789012345678901234567890abcdef0123456789abcdef01234567',
        timestamp.toString()
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unsupported signature version');
    });

    it('should respect custom maxAgeMs option', () => {
      const oldTimestamp = Date.now() - 2 * 60 * 1000; // 2 minutes ago
      const signature = generateSignature(testPayload, testSecret, oldTimestamp);

      // Should fail with default (5 min) but succeed with longer maxAgeMs
      const result = verifySignature(
        testPayload,
        testSecret,
        signature,
        oldTimestamp.toString(),
        { maxAgeMs: 10 * 60 * 1000 } // 10 minutes
      );

      expect(result.valid).toBe(true);
    });
  });

  describe('generateWebhookHeaders', () => {
    it('should generate required headers', () => {
      const headers = generateWebhookHeaders(testPayload, testSecret);

      expect(headers['Content-Type']).toBe('application/json');
      expect(headers[SIGNATURE_HEADER]).toMatch(/^v1=[a-f0-9]+$/);
      expect(headers[TIMESTAMP_HEADER]).toMatch(/^\d+$/);
    });

    it('should generate verifiable signature', () => {
      const headers = generateWebhookHeaders(testPayload, testSecret);

      const result = verifySignature(
        testPayload,
        testSecret,
        headers[SIGNATURE_HEADER],
        headers[TIMESTAMP_HEADER]
      );

      expect(result.valid).toBe(true);
    });
  });
});
