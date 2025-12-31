import { VerificationLevel, VerificationStatus } from '../../types/run';
import { CheckCircle, XCircle, MinusCircle } from 'lucide-react';

interface VerificationBadgeProps {
  level: VerificationLevel;
  status: VerificationStatus;
  className?: string;
}

const statusConfig: Record<
  VerificationStatus,
  { icon: typeof CheckCircle; className: string }
> = {
  passed: {
    icon: CheckCircle,
    className: 'bg-green-100 text-green-700 border-green-300',
  },
  failed: {
    icon: XCircle,
    className: 'bg-red-100 text-red-700 border-red-300',
  },
  skipped: {
    icon: MinusCircle,
    className: 'bg-gray-100 text-gray-700 border-gray-300',
  },
};

export function VerificationBadge({ level, status, className = '' }: VerificationBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.className} ${className}`}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{level}</span>
    </div>
  );
}
