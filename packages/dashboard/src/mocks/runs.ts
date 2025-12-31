import { Run } from '../types/run';

export const mockRuns: Run[] = [
  {
    id: 'run-001',
    work_order_id: 'wo-001',
    status: 'succeeded',
    started_at: '2025-12-30T10:30:30Z',
    completed_at: '2025-12-30T10:45:00Z',
    total_iterations: 3,
    iterations: [
      {
        id: 'iter-001-1',
        run_id: 'run-001',
        iteration_number: 1,
        started_at: '2025-12-30T10:30:30Z',
        completed_at: '2025-12-30T10:35:00Z',
        status: 'succeeded',
        agent_actions: [
          {
            type: 'file_created',
            description: 'Created src/auth/jwt.ts',
            timestamp: '2025-12-30T10:31:00Z',
          },
          {
            type: 'file_created',
            description: 'Created src/middleware/auth.ts',
            timestamp: '2025-12-30T10:32:30Z',
          },
        ],
        verification_report: {
          L0: [
            {
              level: 'L0',
              status: 'passed',
              test_name: 'syntax_check',
              command: 'pnpm typecheck',
              duration_ms: 1200,
            },
          ],
          L1: [
            {
              level: 'L1',
              status: 'failed',
              test_name: 'unit_tests',
              command: 'pnpm test',
              error_message: 'Missing test coverage for JWT validation',
              duration_ms: 2500,
            },
          ],
          overall_status: 'failed',
          total_duration_ms: 3700,
        },
      },
      {
        id: 'iter-001-2',
        run_id: 'run-001',
        iteration_number: 2,
        started_at: '2025-12-30T10:35:30Z',
        completed_at: '2025-12-30T10:40:00Z',
        status: 'succeeded',
        agent_actions: [
          {
            type: 'file_modified',
            description: 'Updated src/auth/jwt.ts with validation tests',
            timestamp: '2025-12-30T10:36:00Z',
          },
          {
            type: 'file_created',
            description: 'Created test/auth/jwt.test.ts',
            timestamp: '2025-12-30T10:37:00Z',
          },
        ],
        verification_report: {
          L0: [
            {
              level: 'L0',
              status: 'passed',
              test_name: 'syntax_check',
              command: 'pnpm typecheck',
              duration_ms: 1100,
            },
          ],
          L1: [
            {
              level: 'L1',
              status: 'passed',
              test_name: 'unit_tests',
              command: 'pnpm test',
              duration_ms: 3200,
            },
          ],
          L2: [
            {
              level: 'L2',
              status: 'failed',
              test_name: 'integration_tests',
              command: 'pnpm test:integration',
              error_message: 'Auth middleware not handling expired tokens correctly',
              duration_ms: 4500,
            },
          ],
          overall_status: 'failed',
          total_duration_ms: 8800,
        },
      },
      {
        id: 'iter-001-3',
        run_id: 'run-001',
        iteration_number: 3,
        started_at: '2025-12-30T10:40:30Z',
        completed_at: '2025-12-30T10:45:00Z',
        status: 'succeeded',
        agent_actions: [
          {
            type: 'file_modified',
            description: 'Fixed token expiration handling in src/middleware/auth.ts',
            timestamp: '2025-12-30T10:41:00Z',
          },
        ],
        verification_report: {
          L0: [
            {
              level: 'L0',
              status: 'passed',
              test_name: 'syntax_check',
              command: 'pnpm typecheck',
              duration_ms: 1150,
            },
          ],
          L1: [
            {
              level: 'L1',
              status: 'passed',
              test_name: 'unit_tests',
              command: 'pnpm test',
              duration_ms: 3100,
            },
          ],
          L2: [
            {
              level: 'L2',
              status: 'passed',
              test_name: 'integration_tests',
              command: 'pnpm test:integration',
              duration_ms: 4200,
            },
          ],
          overall_status: 'passed',
          total_duration_ms: 8450,
        },
      },
    ],
    final_verification: {
      L0: [
        {
          level: 'L0',
          status: 'passed',
          test_name: 'syntax_check',
          command: 'pnpm typecheck',
          duration_ms: 1200,
        },
      ],
      L1: [
        {
          level: 'L1',
          status: 'passed',
          test_name: 'unit_tests',
          command: 'pnpm test',
          duration_ms: 3300,
        },
      ],
      L2: [
        {
          level: 'L2',
          status: 'passed',
          test_name: 'integration_tests',
          command: 'pnpm test:integration',
          duration_ms: 4100,
        },
      ],
      L3: [
        {
          level: 'L3',
          status: 'passed',
          test_name: 'e2e_tests',
          command: 'pnpm test:e2e',
          duration_ms: 15000,
        },
      ],
      overall_status: 'passed',
      total_duration_ms: 23600,
    },
  },
  {
    id: 'run-002',
    work_order_id: 'wo-002',
    status: 'running',
    started_at: '2025-12-30T14:20:15Z',
    total_iterations: 2,
    iterations: [
      {
        id: 'iter-002-1',
        run_id: 'run-002',
        iteration_number: 1,
        started_at: '2025-12-30T14:20:15Z',
        completed_at: '2025-12-30T14:25:00Z',
        status: 'succeeded',
        agent_actions: [
          {
            type: 'file_created',
            description: 'Created test/api/users.test.ts',
            timestamp: '2025-12-30T14:21:00Z',
          },
          {
            type: 'file_created',
            description: 'Created test/api/posts.test.ts',
            timestamp: '2025-12-30T14:22:00Z',
          },
        ],
        verification_report: {
          L0: [
            {
              level: 'L0',
              status: 'passed',
              test_name: 'syntax_check',
              command: 'pnpm typecheck',
              duration_ms: 1300,
            },
          ],
          L1: [
            {
              level: 'L1',
              status: 'passed',
              test_name: 'unit_tests',
              command: 'pnpm test',
              duration_ms: 4200,
            },
          ],
          overall_status: 'passed',
          total_duration_ms: 5500,
        },
      },
      {
        id: 'iter-002-2',
        run_id: 'run-002',
        iteration_number: 2,
        started_at: '2025-12-30T14:25:30Z',
        status: 'running',
        agent_actions: [
          {
            type: 'file_created',
            description: 'Creating test/api/comments.test.ts',
            timestamp: '2025-12-30T14:26:00Z',
          },
        ],
      },
    ],
  },
  {
    id: 'run-003',
    work_order_id: 'wo-003',
    status: 'failed',
    started_at: '2025-12-30T09:00:10Z',
    completed_at: '2025-12-30T09:15:00Z',
    total_iterations: 2,
    error_message: 'Migration failed: Incompatible data types in users table column "metadata"',
    iterations: [
      {
        id: 'iter-003-1',
        run_id: 'run-003',
        iteration_number: 1,
        started_at: '2025-12-30T09:00:10Z',
        completed_at: '2025-12-30T09:07:00Z',
        status: 'succeeded',
        agent_actions: [
          {
            type: 'file_created',
            description: 'Created migration script db/migrations/001_upgrade_pg15.sql',
            timestamp: '2025-12-30T09:02:00Z',
          },
        ],
        verification_report: {
          L0: [
            {
              level: 'L0',
              status: 'passed',
              test_name: 'syntax_check',
              command: 'pnpm typecheck',
              duration_ms: 1000,
            },
          ],
          L1: [
            {
              level: 'L1',
              status: 'failed',
              test_name: 'migration_test',
              command: 'pnpm db:migrate:test',
              error_message: 'Type mismatch: JSONB cannot convert from TEXT',
              duration_ms: 3500,
            },
          ],
          overall_status: 'failed',
          total_duration_ms: 4500,
        },
      },
      {
        id: 'iter-003-2',
        run_id: 'run-003',
        iteration_number: 2,
        started_at: '2025-12-30T09:07:30Z',
        completed_at: '2025-12-30T09:15:00Z',
        status: 'failed',
        error_message: 'Unable to resolve data type incompatibility',
        agent_actions: [
          {
            type: 'file_modified',
            description: 'Attempted to add type conversion in migration',
            timestamp: '2025-12-30T09:09:00Z',
          },
        ],
        verification_report: {
          L0: [
            {
              level: 'L0',
              status: 'passed',
              test_name: 'syntax_check',
              command: 'pnpm typecheck',
              duration_ms: 950,
            },
          ],
          L1: [
            {
              level: 'L1',
              status: 'failed',
              test_name: 'migration_test',
              command: 'pnpm db:migrate:test',
              error_message: 'Migration failed: Incompatible data types in users table',
              duration_ms: 3800,
            },
          ],
          overall_status: 'failed',
          total_duration_ms: 4750,
        },
      },
    ],
    final_verification: {
      overall_status: 'failed',
      total_duration_ms: 0,
    },
  },
];

// Helper function to get runs for a specific work order
export function getRunsByWorkOrderId(workOrderId: string): Run[] {
  return mockRuns.filter((run) => run.work_order_id === workOrderId);
}
