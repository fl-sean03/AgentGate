import { z } from 'zod'

// Example type definitions
export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  createdAt: z.string().datetime(),
})

export type User = z.infer<typeof UserSchema>

export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
})

export type ApiResponse<T = unknown> = {
  success: boolean
  data?: T
  error?: string
}
