import "server-only";
import { getSession } from "auth/server";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get("task_id");
  const resultSourceName = searchParams.get("result_source_name");

  if (!taskId || !resultSourceName) {
    return new Response("Missing task_id or result_source_name", {
      status: 400,
    });
  }

  const baseUrl = process.env.RESEARCH_AGENT_BASE_URL;
  if (!baseUrl) {
    return new Response("Missing RESEARCH_AGENT_BASE_URL", { status: 500 });
  }

  const url = `${baseUrl}/runner/result_source?task_id=${encodeURIComponent(
    taskId,
  )}&result_source_name=${encodeURIComponent(resultSourceName)}`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    return new Response(text, { status: res.status });
  }

  const headers = new Headers(res.headers);

  // 确保 Content-Disposition header 使用正确的文件名
  const contentDisposition = `attachment; filename="${encodeURIComponent(resultSourceName)}"`;
  headers.set("Content-Disposition", contentDisposition);

  return new Response(res.body, {
    status: res.status,
    headers,
  });
}
