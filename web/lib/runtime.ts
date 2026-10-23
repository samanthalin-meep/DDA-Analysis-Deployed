// Bump this revision when the compiled package or installed dependencies change.
// Runner source is refreshed for every job, independently of this environment.
export const RUNTIME_CACHE_KEY = 'system/runtime-drive/r2025a-u1-v1.json';
export const RUNTIME_DRIVE = 'dda-matlab-r2025a-u1';
export const RUNTIME_MOUNT = '/vercel/sandbox/dda/matlab-runtime';
export type RuntimeCache = {snapshotId: string; driveName: string; createdAt: string};
