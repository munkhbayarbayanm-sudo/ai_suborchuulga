export class AppError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode = 400, public readonly diagnostics: Readonly<Record<string, string | number | null>> = {}) { super(message); this.name = 'AppError'; }
}
export function errorDiagnostics(error: unknown): Record<string, string | number | null> {
  const diagnostics: Record<string, string | number | null> = {};
  if (error instanceof Error && /^[A-Za-z0-9_]{1,80}$/.test(error.name)) diagnostics.errorType = error.name;
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' && /^[A-Z0-9_]{1,40}$/.test(error.code)) diagnostics.systemCode = error.code;
  return diagnostics;
}
export const JobStatus = { QUEUED: 'QUEUED', PROCESSING: 'PROCESSING', COMPLETED: 'COMPLETED', FAILED: 'FAILED', CANCELLED: 'CANCELLED' } as const;
export const AssetStatus = { IMPORTED: 'IMPORTED', INSPECTING: 'INSPECTING', READY: 'READY', FAILED: 'FAILED' } as const;
export const JobType = { INSPECT_MEDIA: 'INSPECT_MEDIA' } as const;
