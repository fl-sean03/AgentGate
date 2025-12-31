import { z } from 'zod';

/**
 * Server configuration schema
 */
export const serverConfigSchema = z.object({
  /** Port to listen on */
  port: z.number().int().min(1).max(65535).default(3001),
  /** Host to bind to */
  host: z.string().default('0.0.0.0'),
  /** CORS origins to allow */
  corsOrigins: z.array(z.string()).default(['*']),
  /** Request timeout in milliseconds */
  requestTimeout: z.number().int().positive().default(30000),
  /** Enable request logging */
  enableLogging: z.boolean().default(true),
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;

/**
 * Generic API success response wrapper
 */
export const apiResponseSchema = <T extends z.ZodTypeAny>(
  dataSchema: T
): z.ZodObject<{
  success: z.ZodLiteral<true>;
  data: T;
  requestId: z.ZodOptional<z.ZodString>;
}> =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    requestId: z.string().optional(),
  });

export type ApiResponse<T> = {
  success: true;
  data: T;
  requestId?: string;
};

/**
 * API error response schema
 */
export const apiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
  requestId: z.string().optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

/**
 * Health check status
 */
export const healthStatusSchema = z.object({
  status: z.enum(['ok', 'degraded', 'unhealthy']),
  version: z.string(),
  timestamp: z.string().datetime(),
});

export type HealthStatus = z.infer<typeof healthStatusSchema>;

/**
 * Component check result
 */
export const componentCheckSchema = z.object({
  name: z.string(),
  healthy: z.boolean(),
  message: z.string().optional(),
  latencyMs: z.number().optional(),
});

export type ComponentCheck = z.infer<typeof componentCheckSchema>;

/**
 * Readiness check response
 */
export const readinessResponseSchema = z.object({
  ready: z.boolean(),
  checks: z.array(componentCheckSchema),
  timestamp: z.string().datetime(),
});

export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;

/**
 * Liveness check response
 */
export const livenessResponseSchema = z.object({
  alive: z.literal(true),
  timestamp: z.string().datetime(),
});

export type LivenessResponse = z.infer<typeof livenessResponseSchema>;

/**
 * Error codes for API errors
 */
export const ErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Create a success response
 */
export function createSuccessResponse<T>(
  data: T,
  requestId?: string
): ApiResponse<T> {
  return {
    success: true,
    data,
    ...(requestId && { requestId }),
  };
}

/**
 * Create an error response
 */
export function createErrorResponse(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
  requestId?: string
): ApiError {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
    },
    ...(requestId && { requestId }),
  };
}
