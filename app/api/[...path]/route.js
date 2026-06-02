import serverHandler from "../../../server.js";

const { handleApiWebRequest } = serverHandler;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function pathnameFromParams(params) {
  const path = Array.isArray(params?.path) ? params.path.join("/") : "";
  return `/api/${path}`;
}

export async function GET(request, context) {
  return handleApiWebRequest(request, pathnameFromParams(await context.params));
}

export async function POST(request, context) {
  return handleApiWebRequest(request, pathnameFromParams(await context.params));
}
