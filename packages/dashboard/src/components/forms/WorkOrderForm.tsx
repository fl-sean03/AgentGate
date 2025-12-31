import { useState } from 'react';
import { z } from 'zod';
import { FormField } from './FormField';
import { TextArea } from './TextArea';
import { WorkspaceSourceSelect } from './WorkspaceSourceSelect';
import { AgentTypeSelect } from './AgentTypeSelect';
import { Button } from '../Button';

const workOrderSchema = z.object({
  prompt: z
    .string()
    .min(10, 'Task prompt must be at least 10 characters')
    .max(5000, 'Task prompt must not exceed 5000 characters'),
  workspaceSourceType: z.enum(['local', 'github', 'github-new'], {
    errorMap: () => ({ message: 'Please select a workspace source type' }),
  }),
  sourcePath: z.string().optional(),
  sourceUrl: z.string().optional(),
  sourceBranch: z.string().optional(),
  agentType: z.string().min(1, 'Please select an agent type'),
  maxIterations: z
    .number()
    .int()
    .min(1, 'Max iterations must be at least 1')
    .max(10, 'Max iterations must not exceed 10'),
  maxTime: z
    .number()
    .int()
    .min(1, 'Max time must be at least 1 second')
    .max(3600, 'Max time must not exceed 3600 seconds'),
});

type WorkOrderFormData = z.infer<typeof workOrderSchema>;

interface WorkOrderFormProps {
  onSubmit: (data: WorkOrderFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function WorkOrderForm({
  onSubmit,
  onCancel,
  isSubmitting = false,
}: WorkOrderFormProps) {
  const [formData, setFormData] = useState<Partial<WorkOrderFormData>>({
    prompt: '',
    workspaceSourceType: undefined,
    sourcePath: '',
    sourceUrl: '',
    sourceBranch: '',
    agentType: '',
    maxIterations: 5,
    maxTime: 300,
  });

  const [errors, setErrors] = useState<
    Partial<Record<keyof WorkOrderFormData, string>>
  >({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    try {
      const validatedData = workOrderSchema.parse(formData);
      onSubmit(validatedData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Partial<Record<keyof WorkOrderFormData, string>> = {};
        error.errors.forEach((err) => {
          const path = err.path[0] as keyof WorkOrderFormData;
          newErrors[path] = err.message;
        });
        setErrors(newErrors);
      }
    }
  };

  const handleWorkspaceSourceChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      workspaceSourceType: value as 'local' | 'github' | 'github-new',
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormField
        label="Task Prompt"
        htmlFor="prompt"
        required
        error={errors.prompt}
      >
        <TextArea
          id="prompt"
          name="prompt"
          rows={4}
          placeholder="Describe the task you want the agent to perform..."
          value={formData.prompt}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, prompt: e.target.value }))
          }
          error={!!errors.prompt}
          disabled={isSubmitting}
        />
      </FormField>

      <FormField
        label="Workspace Source Type"
        htmlFor="workspaceSourceType"
        required
        error={errors.workspaceSourceType}
      >
        <WorkspaceSourceSelect
          id="workspaceSourceType"
          name="workspaceSourceType"
          value={formData.workspaceSourceType || ''}
          onChange={handleWorkspaceSourceChange}
          error={!!errors.workspaceSourceType}
          disabled={isSubmitting}
        />
      </FormField>

      {formData.workspaceSourceType === 'local' && (
        <FormField
          label="Local Path"
          htmlFor="sourcePath"
          error={errors.sourcePath}
        >
          <input
            type="text"
            id="sourcePath"
            name="sourcePath"
            placeholder="/path/to/workspace"
            value={formData.sourcePath}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, sourcePath: e.target.value }))
            }
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
            disabled={isSubmitting}
          />
        </FormField>
      )}

      {(formData.workspaceSourceType === 'github' ||
        formData.workspaceSourceType === 'github-new') && (
        <>
          <FormField
            label="GitHub Repository URL"
            htmlFor="sourceUrl"
            error={errors.sourceUrl}
          >
            <input
              type="text"
              id="sourceUrl"
              name="sourceUrl"
              placeholder="https://github.com/owner/repo"
              value={formData.sourceUrl}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, sourceUrl: e.target.value }))
              }
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
              disabled={isSubmitting}
            />
          </FormField>

          <FormField
            label="Branch"
            htmlFor="sourceBranch"
            error={errors.sourceBranch}
          >
            <input
              type="text"
              id="sourceBranch"
              name="sourceBranch"
              placeholder="main"
              value={formData.sourceBranch}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  sourceBranch: e.target.value,
                }))
              }
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
              disabled={isSubmitting}
            />
          </FormField>
        </>
      )}

      <FormField
        label="Agent Type"
        htmlFor="agentType"
        required
        error={errors.agentType}
      >
        <AgentTypeSelect
          id="agentType"
          name="agentType"
          value={formData.agentType}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, agentType: e.target.value }))
          }
          error={!!errors.agentType}
          disabled={isSubmitting}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          label="Max Iterations"
          htmlFor="maxIterations"
          required
          error={errors.maxIterations}
        >
          <input
            type="number"
            id="maxIterations"
            name="maxIterations"
            min="1"
            max="10"
            value={formData.maxIterations}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                maxIterations: parseInt(e.target.value, 10),
              }))
            }
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
            disabled={isSubmitting}
          />
        </FormField>

        <FormField
          label="Max Time (seconds)"
          htmlFor="maxTime"
          required
          error={errors.maxTime}
        >
          <input
            type="number"
            id="maxTime"
            name="maxTime"
            min="1"
            max="3600"
            value={formData.maxTime}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                maxTime: parseInt(e.target.value, 10),
              }))
            }
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
            disabled={isSubmitting}
          />
        </FormField>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? 'Creating...' : 'Create Work Order'}
        </Button>
      </div>
    </form>
  );
}
