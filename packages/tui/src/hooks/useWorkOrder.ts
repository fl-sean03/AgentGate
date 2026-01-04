import { useState, useCallback } from 'react';
import { getApiClient } from '../api/client.js';
import type { WorkOrder, Repository } from '../api/types.js';

interface UseWorkOrderResult {
  submit: (repo: Repository, task: string) => Promise<string>;
  isSubmitting: boolean;
  error: string | null;
  workOrder: WorkOrder | null;
}

export function useWorkOrder(): UseWorkOrderResult {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);

  const submit = useCallback(
    async (repo: Repository, task: string): Promise<string> => {
      setIsSubmitting(true);
      setError(null);

      try {
        const client = getApiClient();
        const result = await client.submitWorkOrder({
          taskPrompt: task,
          workspaceSource: {
            type: 'github',
            owner: repo.owner,
            repo: repo.name,
            ref: 'main',
          },
          agentType: 'claude-code-subscription',
          maxIterations: 3,
          gatePlanSource: 'auto',
        });

        setWorkOrder(result);
        return result.id;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to submit work order';
        setError(message);
        throw new Error(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    []
  );

  return {
    submit,
    isSubmitting,
    error,
    workOrder,
  };
}
