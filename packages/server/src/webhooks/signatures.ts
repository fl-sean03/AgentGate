/**
 * Webhook Signatures
 *
 * HMAC-SHA256 signature generation and verification for webhook payloads.
 */

import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Signature header name
 */
export const SIGNATURE_HEADER = 'X-AgentGate-Signature';

/**
 * Timestamp header name
 */
export const TIMESTAMP_HEADER = 'X-AgentGate-Timestamp';

/**
 * Signature version
 */
export const SIGNATURE_VERSION = 'v1';

/**
 * Maximum age for timestamp validation (5 minutes)
 */
export const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000;

/**
 * Generate HMAC-SHA256 signature for a webhook payload
 */
export function generateSignature(
  payload: string,
  secret: string,
  timestamp: number
): string {
  const signedPayload = `${timestamp}.${payload}`;
  const hmac = createHmac('sha256', secret);
  hmac.update(signedPayload);
  return `${SIGNATURE_VERSION}=${hmac.digest('hex')}`;
}

/**
 * Parse signature header into components
 */
export function parseSignatureHeader(
  header: string
): { version: string; signature: string } | null {
  const match = header.match(/^(v\d+)=([a-f0-9]+)$/);
  if (!match || !match[1] || !match[2]) {
    return null;
  }
  return {
    version: match[1],
    signature: match[2],
  };
}

/**
 * Verify a webhook signature
 */
export function verifySignature(
  payload: string,
  secret: string,
  signatureHeader: string,
  timestampHeader: string,
  options: { maxAgeMs?: number } = {}
): { valid: boolean; error?: string } {
  const maxAgeMs = options.maxAgeMs ?? MAX_TIMESTAMP_AGE_MS;

  // Parse timestamp
  const timestamp = parseInt(timestampHeader, 10);
  if (isNaN(timestamp)) {
    return { valid: false, error: 'Invalid timestamp' };
  }

  // Check timestamp age (replay protection)
  const now = Date.now();
  if (now - timestamp > maxAgeMs) {
    return { valid: false, error: 'Timestamp too old' };
  }
  if (timestamp > now + 60000) {
    // Allow 1 minute clock skew
    return { valid: false, error: 'Timestamp in the future' };
  }

  // Parse signature header
  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) {
    return { valid: false, error: 'Invalid signature format' };
  }

  if (parsed.version !== SIGNATURE_VERSION) {
    return { valid: false, error: `Unsupported signature version: ${parsed.version}` };
  }

  // Generate expected signature
  const expectedSignature = generateSignature(payload, secret, timestamp);
  const expectedParsed = parseSignatureHeader(expectedSignature);
  if (!expectedParsed) {
    return { valid: false, error: 'Failed to generate expected signature' };
  }

  // Timing-safe comparison
  try {
    const signatureBuffer = Buffer.from(parsed.signature, 'hex');
    const expectedBuffer = Buffer.from(expectedParsed.signature, 'hex');

    if (signatureBuffer.length !== expectedBuffer.length) {
      return { valid: false, error: 'Signature length mismatch' };
    }

    const valid = timingSafeEqual(signatureBuffer, expectedBuffer);
    return { valid, error: valid ? undefined : 'Signature mismatch' };
  } catch {
    return { valid: false, error: 'Signature comparison failed' };
  }
}

/**
 * Generate headers for a webhook request
 */
export function generateWebhookHeaders(
  payload: string,
  secret: string
): Record<string, string> {
  const timestamp = Date.now();
  const signature = generateSignature(payload, secret, timestamp);

  return {
    'Content-Type': 'application/json',
    [SIGNATURE_HEADER]: signature,
    [TIMESTAMP_HEADER]: timestamp.toString(),
  };
}
