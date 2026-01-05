"use client";

import { memo, useEffect, useState } from "react";
import { Check, FileDown, Loader2, XIcon } from "lucide-react";
import { VercelAITaskToolStreamingResult } from "app-types/task";
import { Button } from "ui/button";
import { Alert, AlertDescription, AlertTitle } from "ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "ui/dialog";
import { cn } from "lib/utils";

interface TaskInvocationProps {
  result: VercelAITaskToolStreamingResult;
}

export const TaskInvocation = memo(function TaskInvocation({
  result,
}: TaskInvocationProps) {
  const { status, taskId, info, result: files, error } = result;

  const isRunning = status === "pending" || status === "running";
  const isFail = status === "fail";
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const hasPreviewOpen = Boolean(previewKey);

  useEffect(() => {
    if (!hasPreviewOpen || !taskId || !previewKey) return;

    let cancelled = false;

    const fetchPreview = async () => {
      try {
        setPreviewLoading(true);

        const url = `/api/research-task/download?task_id=${encodeURIComponent(
          taskId,
        )}&result_source_name=${encodeURIComponent(previewKey)}`;

        const res = await fetch(url);
        if (!res.ok) {
          const text = await res.text();
          if (!cancelled) {
            setPreviewError(text || `请求失败：${res.status}`);
          }
          return;
        }

        const text = await res.text();
        if (!cancelled) {
          setPreviewContent(text);
          setPreviewError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setPreviewError(err instanceof Error ? err.message : "预览请求异常");
        }
      } finally {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      }
    };

    fetchPreview();
    const intervalId = window.setInterval(fetchPreview, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [hasPreviewOpen, previewKey, taskId]);

  useEffect(() => {
    const updateViewportHeight = () => {
      setViewportHeight(window.innerHeight);
    };

    updateViewportHeight();
    window.addEventListener("resize", updateViewportHeight);

    return () => {
      window.removeEventListener("resize", updateViewportHeight);
    };
  }, []);

  const previewContentMaxHeight =
    viewportHeight != null ? Math.max(240, viewportHeight - 240) : undefined;

  return (
    <>
      <div className="w-full flex flex-col gap-2 bg-card p-4 border text-xs rounded-lg text-muted-foreground">
        <div className="flex items-center gap-2">
          {isRunning ? (
            <Loader2 className="size-3 animate-spin" />
          ) : isFail ? (
            <XIcon className="size-3 text-destructive" />
          ) : (
            <Check className="size-3 text-emerald-500" />
          )}
          <span className="font-medium">
            研究任务 {taskId ? `#${taskId}` : ""} · {status}
          </span>
        </div>

        {info && <p className="leading-relaxed">{info}</p>}

        {error && (
          <Alert variant="destructive" className="border-destructive mt-1">
            <AlertTitle>{error.name}</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        {files && Object.keys(files).length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {Object.entries(files).map(([key]) => (
              <Button
                key={key}
                size="sm"
                variant="outline"
                className={cn("h-6 text-[10px] px-2")}
                disabled={!taskId}
                onClick={() => {
                  setPreviewKey(key);
                  setPreviewContent("");
                  setPreviewError(null);
                }}
              >
                <FileDown className="size-3" />
                {key}
              </Button>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={hasPreviewOpen}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewKey(null);
            setPreviewContent("");
            setPreviewError(null);
            setPreviewLoading(false);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              任务结果预览{previewKey ? ` · ${previewKey}` : ""}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-2">
              任务 {taskId ? `#${taskId}` : ""} 的输出预览
              <span className="text-[10px] border rounded px-1 py-[1px]">
                每 1 秒自动刷新
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="relative mt-2">
            {previewLoading && (
              <div className="absolute right-0 -top-6 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                <span>加载中...</span>
              </div>
            )}

            {previewError ? (
              <Alert variant="destructive" className="mt-2">
                <AlertTitle>预览失败</AlertTitle>
                <AlertDescription className="whitespace-pre-wrap">
                  {previewError}
                </AlertDescription>
              </Alert>
            ) : (
              <div
                className="mt-2 rounded border bg-muted flex flex-col"
                style={
                  previewContentMaxHeight
                    ? { maxHeight: previewContentMaxHeight }
                    : undefined
                }
              >
                <div className="flex-1 overflow-auto p-3 font-mono text-[11px] whitespace-pre-wrap break-words">
                  {previewContent
                    ? previewContent
                    : isRunning
                      ? "任务正在运行，等待输出..."
                      : "暂时没有内容。"}
                </div>
              </div>
            )}
          </div>

          {taskId && previewKey && (
            <div className="mt-3 flex justify-end">
              <Button
                size="sm"
                variant="outline"
                asChild
                className="text-[11px]"
              >
                <a
                  href={`/api/research-task/download?task_id=${encodeURIComponent(
                    taskId,
                  )}&result_source_name=${encodeURIComponent(previewKey)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <FileDown className="size-3 mr-1" />
                  下载原文件
                </a>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
});
