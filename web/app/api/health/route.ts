export async function GET() {
  return Response.json({app: 'DDA Analysis', storage: !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID), compute: !!(process.env.VERCEL || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL_TOKEN)});
}
