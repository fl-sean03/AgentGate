import { SelectHTMLAttributes, forwardRef } from 'react';

interface AgentTypeSelectProps
  extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const AgentTypeSelect = forwardRef<
  HTMLSelectElement,
  AgentTypeSelectProps
>(({ error, className = '', ...props }, ref) => {
  const baseStyles =
    'block w-full rounded-lg border px-3 py-2 text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors';
  const errorStyles = error
    ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
    : 'border-gray-300 focus:border-primary-500';

  return (
    <select
      ref={ref}
      className={`${baseStyles} ${errorStyles} ${className}`}
      {...props}
    >
      <option value="">Select agent type</option>
      <option value="claude-code-subscription">
        Claude Code (Subscription)
      </option>
      <option value="claude-code-api">Claude Code (API)</option>
      <option value="custom">Custom Agent</option>
    </select>
  );
});

AgentTypeSelect.displayName = 'AgentTypeSelect';
