import { v4 as uuidv4 } from 'uuid';

export function generateId(): string {
  return uuidv4();
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateStr);
}

export function getFileType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx' || ext === 'doc') return 'docx';
  if (ext === 'xlsx' || ext === 'xls') return 'xlsx';
  if (ext === 'csv') return 'csv';
  if (ext === 'txt') return 'txt';
  return 'unknown';
}

export function getFileIcon(fileType: string): string {
  switch (fileType) {
    case 'pdf': return 'FileText';
    case 'docx': return 'FileType';
    case 'xlsx': return 'Table';
    case 'csv': return 'Table';
    case 'txt': return 'FileText';
    default: return 'File';
  }
}

export function getDisciplineColor(discipline: string): string {
  const colors: Record<string, string> = {
    'BMS': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
    'HVAC': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    'Electrical': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    'Fire Alarm': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    'Structural': 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400',
    'Civil': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    'MEP': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
    'General': 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  };
  return colors[discipline] || colors['General'];
}

export const DISCIPLINES = ['BMS', 'HVAC', 'Electrical', 'Fire Alarm', 'Structural', 'Civil', 'MEP', 'General'] as const;

export const REPORT_TYPES = [
  { value: 'commissioning_checklist', label: 'Commissioning Checklist' },
  { value: 'equipment_schedule', label: 'Equipment Schedule' },
  { value: 'handover_report', label: 'Handover / O&M Report' },
  { value: 'data_extraction', label: 'Data Extraction Table' },
] as const;