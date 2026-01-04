import { useState, useEffect, useCallback, useRef } from 'react';
import { getApiClient } from '../api/client.js';
import { createRunStream, RunStream } from '../api/stream.js';
import { useAppStore } from '../store/app.js';
import type {
  Run,
  AgentActivityEvent,
  VerificationProgressEvent,
  VerificationResult,
} from '../api/types.js';

interface UseRunResult {
  run: Run | null;
  activities: AgentActivityEvent[];
  verification: VerificationResult | null;
  currentVerificationLevel: 'L0' | 'L1' | 'L2' | 'L3' | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  cancel: () => Promise<void>;
  reconnect: () => void;
}

export function useRun(workOrderId: string): UseRunResult {
  const [run, setRun] = useState<Run | null>(null);
  const [verification, setVerification] = useState<VerificationResult | null>(
    null
  );
  const [currentVerificationLevel, setCurrentVerificationLevel] = useState<
    'L0' | 'L1' | 'L2' | 'L3' | null
  >(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const {
    activities,
    addActivity,
    clearActivities,
    isConnected,
    setConnected,
  } = useAppStore();

  const streamRef = useRef<RunStream | null>(null);

  const fetchRunStatus = useCallback(async () => {
    try {
      const client = getApiClient();
      // First get the work order to find the run ID
      const workOrder = await client.getWorkOrder(workOrderId);

      // Then get runs for this work order
      const runsResponse = await client.getRuns(1, 10);
      const runData = runsResponse.items.find(
        (r) => r.workOrderId === workOrderId
      );

      if (runData) {
        setRun(runData);
        return runData;
      }

      // If no run yet, create a placeholder
      setRun({
        id: workOrderId,
        workOrderId,
        status: 'queued',
        iteration: 1,
        maxIterations: 3,
        startedAt: new Date(),
        workOrder,
      });
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch run');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [workOrderId]);

  const connectStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.disconnect();
    }

    clearActivities();
    const stream = createRunStream(workOrderId);
    streamRef.current = stream;

    stream.connect({
      onConnect: () => {
        setConnected(true);
        setError(null);
      },
      onDisconnect: () => {
        setConnected(false);
      },
      onActivity: (event) => {
        addActivity(event);
      },
      onVerification: (event) => {
        setCurrentVerificationLevel(event.level);
        setVerification((prev) => ({
          ...prev,
          [event.level]: {
            status: event.status,
            details: event.details ? [event.details] : undefined,
          },
        }));
      },
      onComplete: (event) => {
        setRun((prev) =>
          prev
            ? {
                ...prev,
                status: event.result,
                prUrl: event.prUrl,
                error: event.error,
                completedAt: new Date(),
              }
            : null
        );
        setConnected(false);
      },
      onError: (err) => {
        setError(err.message);
        setConnected(false);
      },
    });
  }, [workOrderId, addActivity, clearActivities, setConnected]);

  useEffect(() => {
    fetchRunStatus().then(() => {
      connectStream();
    });

    return () => {
      if (streamRef.current) {
        streamRef.current.disconnect();
      }
    };
  }, [fetchRunStatus, connectStream]);

  const cancel = useCallback(async () => {
    try {
      const client = getApiClient();
      await client.cancelWorkOrder(workOrderId);
      setRun((prev) =>
        prev
          ? {
              ...prev,
              status: 'canceled',
              completedAt: new Date(),
            }
          : null
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel');
    }
  }, [workOrderId]);

  const reconnect = useCallback(() => {
    connectStream();
  }, [connectStream]);

  return {
    run,
    activities,
    verification,
    currentVerificationLevel,
    isConnected,
    isLoading,
    error,
    cancel,
    reconnect,
  };
}
