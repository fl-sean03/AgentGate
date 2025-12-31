import { SelectHTMLAttributes, forwardRef } from 'react';

type WorkspaceSourceType = 'local' | 'github' | 'github-new';

interface WorkspaceSourceSelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  error?: boolean;
  onChange: (value: WorkspaceSourceType) => void;
}

export const WorkspaceSourceSelect = forwardRef<
  HTMLSelectElement,
  WorkspaceSourceSelectProps
>(({ error, onChange, className = '', ...props }, ref) => {
  const baseStyles =
    'block w-full rounded-lg border px-3 py-2 text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors';
  const errorStyles = error
    ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
    : 'border-gray-300 focus:border-primary-500';

  return (
    <select
      ref={ref}
      className={`${baseStyles} ${errorStyles} ${className}`}
      onChange={(e) => onChange(e.target.value as WorkspaceSourceType)}
      {...props}
    >
      <option value="">Select source type</option>
      <option value="local">Local Directory</option>
      <option value="github">GitHub Repository (Existing)</option>
      <option value="github-new">GitHub Repository (New Branch)</option>
    </select>
  );
});

WorkspaceSourceSelect.displayName = 'WorkspaceSourceSelect';
