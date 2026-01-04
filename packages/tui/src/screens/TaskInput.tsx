import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { TextArea } from '../components/TextArea.js';
import { useWorkOrder } from '../hooks/useWorkOrder.js';
import { Spinner } from '../components/Spinner.js';
import type { Repository } from '../api/types.js';

interface TaskInputProps {
  repo: Repository;
  onSubmit: (workOrderId: string) => void;
  onBack: () => void;
}

export function TaskInput({
  repo,
  onSubmit,
  onBack,
}: TaskInputProps): React.ReactElement {
  const [taskText, setTaskText] = useState('');
  const { submit, isSubmitting, error } = useWorkOrder();

  const handleSubmit = async () => {
    if (!taskText.trim() || isSubmitting) {
      return;
    }

    try {
      const workOrderId = await submit(repo, taskText.trim());
      onSubmit(workOrderId);
    } catch {
      // Error is handled by useWorkOrder
    }
  };

  useInput((input, key) => {
    if (key.escape) {
      onBack();
      return;
    }

    // Ctrl+Enter to submit
    if (key.return && key.ctrl) {
      handleSubmit();
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      padding={1}
    >
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          AgentGate
        </Text>
      </Box>

      {/* Repository name */}
      <Box marginBottom={1}>
        <Text color="cyan">{repo.fullName}</Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="gray">───────────────────────────────────────────</Text>
      </Box>

      {/* Prompt */}
      <Box marginBottom={1}>
        <Text>What would you like to do?</Text>
      </Box>

      {/* Task input */}
      <Box marginBottom={1}>
        <TextArea
          value={taskText}
          onChange={setTaskText}
          placeholder="Describe the task you want the agent to complete..."
          maxLines={8}
          onSubmit={handleSubmit}
          onEscape={onBack}
          focus={!isSubmitting}
        />
      </Box>

      {/* Status */}
      {isSubmitting && (
        <Box marginBottom={1}>
          <Spinner label="Submitting task..." />
        </Box>
      )}

      {error && (
        <Box marginBottom={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <Text color="gray">
          {taskText.trim() ? '[Ctrl+Enter] Start  ' : ''}
          [Esc] Back
        </Text>
      </Box>
    </Box>
  );
}
