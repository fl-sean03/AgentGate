import { describe, it, expect } from 'vitest';
import {
  AgentGateError,
  NetworkError,
  NotFoundError,
  ValidationError,
  AuthenticationError,
  ConflictError,
  RateLimitError,
  ServerError,
} from '../src/errors.js';

describe('AgentGateError', () => {
  it('should create error with all properties', () => {
    const error = new AgentGateError('Test message', 'TEST_CODE', 500, { extra: 'data' });

    expect(error.message).toBe('Test message');
    expect(error.code).toBe('TEST_CODE');
    expect(error.status).toBe(500);
    expect(error.details).toEqual({ extra: 'data' });
    expect(error.name).toBe('AgentGateError');
    expect(error).toBeInstanceOf(Error);
  });

  it('should work without details', () => {
    const error = new AgentGateError('Message', 'CODE', 400);

    expect(error.details).toBeUndefined();
  });
});

describe('NetworkError', () => {
  it('should create with message', () => {
    const error = new NetworkError('Connection failed');

    expect(error.message).toBe('Connection failed');
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.status).toBe(0);
    expect(error.name).toBe('NetworkError');
    expect(error).toBeInstanceOf(AgentGateError);
  });

  it('should include cause', () => {
    const cause = new Error('Original error');
    const error = new NetworkError('Request failed', cause);

    expect(error.cause).toBe(cause);
  });
});

describe('NotFoundError', () => {
  it('should create with resource and id', () => {
    const error = new NotFoundError('WorkOrder', 'wo_123');

    expect(error.message).toBe('WorkOrder not found: wo_123');
    expect(error.code).toBe('NOT_FOUND');
    expect(error.status).toBe(404);
    expect(error.name).toBe('NotFoundError');
    expect(error).toBeInstanceOf(AgentGateError);
  });
});

describe('ValidationError', () => {
  it('should create with message and details', () => {
    const details = { field: 'taskPrompt', reason: 'required' };
    const error = new ValidationError('Invalid input', details);

    expect(error.message).toBe('Invalid input');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.status).toBe(400);
    expect(error.details).toEqual(details);
    expect(error.name).toBe('ValidationError');
  });

  it('should work without details', () => {
    const error = new ValidationError('Bad request');

    expect(error.details).toBeUndefined();
  });
});

describe('AuthenticationError', () => {
  it('should create with default message', () => {
    const error = new AuthenticationError();

    expect(error.message).toBe('Authentication required');
    expect(error.code).toBe('UNAUTHORIZED');
    expect(error.status).toBe(401);
    expect(error.name).toBe('AuthenticationError');
  });

  it('should create with custom message', () => {
    const error = new AuthenticationError('Invalid API key');

    expect(error.message).toBe('Invalid API key');
  });
});

describe('ConflictError', () => {
  it('should create with message', () => {
    const error = new ConflictError('Resource already exists');

    expect(error.message).toBe('Resource already exists');
    expect(error.code).toBe('CONFLICT');
    expect(error.status).toBe(409);
    expect(error.name).toBe('ConflictError');
  });
});

describe('RateLimitError', () => {
  it('should create with message', () => {
    const error = new RateLimitError('Too many requests');

    expect(error.message).toBe('Too many requests');
    expect(error.code).toBe('RATE_LIMIT');
    expect(error.status).toBe(429);
    expect(error.name).toBe('RateLimitError');
    expect(error.retryAfter).toBeUndefined();
  });

  it('should include retryAfter', () => {
    const error = new RateLimitError('Rate limited', 60);

    expect(error.retryAfter).toBe(60);
  });
});

describe('ServerError', () => {
  it('should create with default status 500', () => {
    const error = new ServerError('Internal error');

    expect(error.message).toBe('Internal error');
    expect(error.code).toBe('SERVER_ERROR');
    expect(error.status).toBe(500);
    expect(error.name).toBe('ServerError');
  });

  it('should accept custom status', () => {
    const error = new ServerError('Service unavailable', 503);

    expect(error.status).toBe(503);
  });
});
