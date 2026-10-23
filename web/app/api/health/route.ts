import version from '@/lib/runner-version.json';
import { readJson } from '@/lib/storage';
import { RUNTIME_CACHE_KEY } from '@/lib/runtime';
export async function GET() {
  const storage = !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
  const cached = storage ? await readJson(RUNTIME_CACHE_KEY) : null;
  return Response.json({app: 'DDA Analysis', storage, compute: !!(process.env.VERCEL || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL_TOKEN), runtimeVersion: version.fingerprint, runtimeCached: !!cached}, {headers: {'Cache-Control': 'no-store'}});
}
