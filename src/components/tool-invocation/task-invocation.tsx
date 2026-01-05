"use client";

import { memo } from "react";
import { Check, FileDown, Loader2, XIcon } from "lucide-react";
import { VercelAITaskToolStreamingResult } from "app-types/task";
import { Button } from "ui/button";
import { Alert, AlertDescription, AlertTitle } from "ui/alert";
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

  return (
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
              asChild
              className={cn("h-6 text-[10px] px-2")}
            >
              <a
                href={`/api/research-task/download?task_id=${encodeURIComponent(
                  taskId || "",
                )}&result_source_name=${encodeURIComponent(key)}`}
                target="_blank"
                rel="noreferrer"
              >
                <FileDown className="size-3" />
                {key}
              </a>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
});
