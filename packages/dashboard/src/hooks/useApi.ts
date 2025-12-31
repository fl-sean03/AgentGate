import { useQuery, useMutation, UseQueryOptions, UseMutationOptions } from '@tanstack/react-query'
import { get, post, put, del } from '../api/client'

export function useApiQuery<T>(
  key: string[],
  endpoint: string,
  options?: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: key,
    queryFn: () => get<T>(endpoint),
    ...options,
  })
}

export function useApiMutation<T, V = unknown>(
  endpoint: string,
  method: 'POST' | 'PUT' | 'DELETE' = 'POST',
  options?: UseMutationOptions<T, Error, V>
) {
  return useMutation({
    mutationFn: (variables: V) => {
      switch (method) {
        case 'POST':
          return post<T>(endpoint, variables)
        case 'PUT':
          return put<T>(endpoint, variables)
        case 'DELETE':
          return del<T>(endpoint)
        default:
          throw new Error(`Unsupported method: ${method}`)
      }
    },
    ...options,
  })
}
