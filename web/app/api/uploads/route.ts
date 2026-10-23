import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { getSession, requireSameOrigin } from '@/lib/session';
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = await request.json() as HandleUploadBody;
    const result = await handleUpload({body, request,
      onBeforeGenerateToken: async (pathname) => {
        const session = await getSession();
        if (!pathname.startsWith(`sessions/${session}/uploads/`) || pathname.includes('..') || !/\.(edf|txt|csv)$/i.test(pathname)) throw new Error('Invalid upload destination.');
        return {maximumSizeInBytes: pathname.toLowerCase().endsWith('.edf') ? 512 * 1024 ** 2 : 64 * 1024 ** 2, addRandomSuffix: false, tokenPayload: JSON.stringify({session}), validUntil: Date.now() + 60 * 60 * 1000};
      },
      onUploadCompleted: async () => {},
    });
    return Response.json(result);
  } catch (e) {return Response.json({error: (e as Error).message}, {status: 400});}
}
