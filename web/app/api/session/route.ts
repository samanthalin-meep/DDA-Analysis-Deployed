import { getSession, requireSameOrigin } from '@/lib/session';
export async function POST(request: Request) {
  try {requireSameOrigin(request); const session = await getSession(true); return Response.json({ready: true, uploadPrefix: `sessions/${session}/uploads/`});}
  catch (e) {return Response.json({error: (e as Error).message}, {status: 503});}
}
