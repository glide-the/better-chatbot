"use client";

import { memo, useEffect, useState } from "react";
import { X, FileDown, Loader2, Copy } from "lucide-react";
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
import { motion, AnimatePresence } from "framer-motion";
import "./activity-panel.css";

export interface ActivityEvent {
  id: string;
  timestamp: number;
  type: "event" | "action" | "log";
  level?: "info" | "warning" | "error" | "success";
  message: string;
  details?: any;
}

interface TaskResultResponse {
  code: number;
  msg: string;
  data: {
    task_id: string;
    info: string;
    finished: boolean;
    result?: Record<string, string>;
  };
}

type TabType = "logs" | "files";

interface ActivityPanelProps {
  isOpen: boolean;
  onClose: () => void;
  result: VercelAITaskToolStreamingResult;
}

const formatDuration = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${remainingSeconds}s`;
};

export const ActivityPanel = memo(function ActivityPanel({
  isOpen,
  onClose,
  result,
}: ActivityPanelProps) {
  const {
    status,
    taskId,
    info,
    result: files,
    error,
    taskName,
    startedAt,
    endedAt,
  } = result;

  const isRunning = status === "pending" || status === "running";
  const [activeTab, setActiveTab] = useState<TabType>("logs");
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [duration, setDuration] = useState<string>("0s");
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const hasPreviewOpen = Boolean(previewKey);

  useEffect(() => {
    if (!isOpen) return;

    const updateDuration = () => {
      const now =
        status === "completed" || status === "fail" ? endedAt : Date.now();
      const ms = now - startedAt;
      setDuration(formatDuration(ms));
    };

    updateDuration();
    const interval = isRunning ? setInterval(updateDuration, 1000) : null;

    if (taskId && activeTab === "logs") {
      fetchActivityLogs(taskId);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isOpen, taskId, status, startedAt, endedAt, activeTab]);

  const handleDownload = async (filename: string) => {
    if (!taskId) return;

    try {
      setDownloading(true);
      const url = `/api/research-task/download?task_id=${encodeURIComponent(
        taskId,
      )}&result_source_name=${encodeURIComponent(filename)}`;

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`下载失败：${res.status}`);
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error("下载失败:", err);
      alert(err instanceof Error ? err.message : "下载失败");
    } finally {
      setDownloading(false);
    }
  };

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

  const fetchActivityLogs = async (id: string) => {
    try {
      // 乐观更新：不设置加载状态，保留旧数据显示
      // 只在首次加载（activities 为空）时显示加载状态
      if (activities.length === 0) {
        setIsLoadingLogs(true);
      }

      const resultRes = await fetch(
        `/api/research-task/result?task_id=${encodeURIComponent(id)}`,
      );
      if (!resultRes.ok) {
        console.error("Failed to fetch task result");
        return;
      }

      const resultData = (await resultRes.json()) as TaskResultResponse;
      const logPaths = resultData.data?.result;

      if (!logPaths) {
        console.log("No log paths available");
        return;
      }

      const activityEvents: ActivityEvent[] = [];

      const logFileKeys = [
        "log_run_path",
        "log_detail_path",
        "log_summary_path",
      ];

      for (const key of logFileKeys) {
        const path = logPaths[key];
        if (!path) continue;

        try {
          const downloadRes = await fetch(
            `/api/research-task/download?task_id=${encodeURIComponent(
              id,
            )}&result_source_name=${encodeURIComponent(key)}`,
          );

          if (downloadRes.ok) {
            const content = await downloadRes.text();
            const parsedActivities = parseLogContent(content, key);

            parsedActivities.forEach((activity, index) => {
              activityEvents.push({
                id: `${key}-${index}`,
                timestamp: activity.timestamp || Date.now(),
                type: activity.type || "log",
                level: activity.level,
                message: activity.message,
                details: activity.details,
              });
            });
          }
        } catch (error) {
          console.error(`Failed to fetch log ${key}:`, error);
        }
      }

      activityEvents.sort((a, b) => a.timestamp - b.timestamp);
      setActivities(activityEvents);
    } catch (error) {
      console.error("Failed to fetch activity logs:", error);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const parseLogContent = (
    content: string,
    sourceType: string,
  ): ActivityEvent[] => {
    const events: ActivityEvent[] = [];
    const lines = content.split("\n").filter((line) => line.trim());

    lines.forEach((line, index) => {
      let activity: Partial<ActivityEvent> = {};

      if (sourceType === "log_detail_path") {
        try {
          const json = JSON.parse(line);
          activity = {
            id: `${sourceType}-${index}`,
            timestamp: json.timestamp || Date.now(),
            type: json.type || "log",
            level: json.level,
            message: json.message || line,
            details: json.details,
          };
        } catch {
          activity = {
            id: `${sourceType}-${index}`,
            timestamp: Date.now(),
            type: "log",
            message: line,
          };
        }
      } else if (
        sourceType === "log_run_path" ||
        sourceType === "log_summary_path"
      ) {
        activity = {
          id: `${sourceType}-${index}`,
          timestamp: Date.now(),
          type: sourceType === "log_run_path" ? "log" : "event",
          message: line,
        };
      }

      if (activity.message && activity.type) {
        events.push(activity as ActivityEvent);
      }
    });

    return events;
  };

  const getIconForType = (type: string, level?: string) => {
    switch (type) {
      case "event":
        return "📋";
      case "action":
        return "⚡";
      case "log":
        return level === "error" ? "❌" : level === "warning" ? "⚠️" : "📝";
      default:
        return "•";
    }
  };

  const groupedActivities = activities.reduce(
    (acc, activity) => {
      if (!acc[activity.type]) {
        acc[activity.type] = [];
      }
      acc[activity.type].push(activity);
      return acc;
    },
    {} as Record<string, ActivityEvent[]>,
  );

  const typeLabels: Record<string, string> = {
    event: "事件",
    action: "动作",
    log: "日志",
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
              onClick={onClose}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed right-0 top-0 bottom-0 w-96 bg-background border-l border-border shadow-2xl z-50 flex flex-col"
            >
              <div className="h-12 px-4 flex items-center justify-between border-b border-border bg-background">
                <div className="flex items-center space-x-2">
                  <h1 className="text-foreground font-serif text-lg font-bold">
                    活动
                  </h1>
                  <span className="text-muted-foreground text-sm font-mono tracking-wide animate-pulse">
                    {duration}
                  </span>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-200"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="flex border-b border-border bg-muted">
                <button
                  className={cn(
                    "flex-1 px-4 py-3 text-sm font-medium transition-colors",
                    activeTab === "logs"
                      ? "text-primary border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setActiveTab("logs")}
                >
                  活动日志 ({activities.length})
                </button>
                <button
                  className={cn(
                    "flex-1 px-4 py-3 text-sm font-medium transition-colors",
                    activeTab === "files"
                      ? "text-primary border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setActiveTab("files")}
                >
                  文件 ({Object.keys(files || {}).length})
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {activeTab === "logs" ? (
                  <div className="px-4 py-4">
                    {taskId && (
                      <div className="mb-4 p-3 bg-card rounded-lg border border-border">
                        <div
                          className="flex items-center justify-between mb-2 group cursor-pointer"
                          onClick={() => copyToClipboard(taskId)}
                        >
                          <span className="text-xs text-muted-foreground">
                            任务 ID
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-foreground truncate max-w-[180px] whitespace-nowrap">
                              {taskId}
                            </span>
                            <Copy className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>
                        {taskName && (
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-muted-foreground">
                              任务名称
                            </span>
                            <span className="text-xs text-foreground truncate max-w-[150px] whitespace-nowrap">
                              {taskName}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            状态
                          </span>
                          <span
                            className={cn(
                              "text-xs font-medium",
                              status === "completed"
                                ? "text-emerald-500"
                                : status === "fail"
                                  ? "text-destructive"
                                  : status === "running"
                                    ? "text-primary animate-pulse"
                                    : "text-yellow-500",
                            )}
                          >
                            {status}
                          </span>
                        </div>
                      </div>
                    )}

                    {error && (
                      <Alert
                        variant="destructive"
                        className="border-destructive mb-4"
                      >
                        <AlertTitle>{error.name}</AlertTitle>
                        <AlertDescription>{error.message}</AlertDescription>
                      </Alert>
                    )}

                    {isLoadingLogs ? (
                      <div className="text-center py-12">
                        <div className="text-muted-foreground text-sm">
                          加载中...
                        </div>
                      </div>
                    ) : activities.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="text-muted-foreground text-sm">
                          暂无活动记录
                        </div>
                        <div className="text-muted-foreground/80 text-xs mt-2">
                          任务正在初始化...
                        </div>
                      </div>
                    ) : (
                      // 只输出logs
                      Object.entries(groupedActivities)
                        .filter(([type]) => type === "log")
                        .map(([type, items]) => (
                          <div key={type} className="mb-6">
                            <h2 className="flex items-center text-foreground font-serif text-base font-semibold mb-3">
                              <span className="w-1 h-5 bg-primary rounded-full mr-3"></span>
                              {typeLabels[type] || type}
                              <span className="ml-2 text-xs text-muted-foreground font-normal">
                                ({items.length})
                              </span>
                            </h2>

                            <div className="space-y-2">
                              {items.map((activity, index) => (
                                <div
                                  key={activity.id || `${type}-${index}`}
                                  className="task-item flex items-start p-3 rounded-lg bg-muted/50 border border-border hover:bg-muted hover:border-primary/20 transition-all duration-200 group"
                                >
                                  <div className="flex-shrink-0 mr-3 text-lg">
                                    {getIconForType(
                                      activity.type,
                                      activity.level,
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <p className="text-foreground text-sm font-medium break-words">
                                        {activity.message}
                                      </p>
                                    </div>
                                    {activity.details && (
                                      <p className="text-muted-foreground text-xs font-mono break-words">
                                        {typeof activity.details === "string"
                                          ? activity.details
                                          : JSON.stringify(activity.details)}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                ) : (
                  <div className="px-4 py-4">
                    {taskId && (
                      <div className="mb-4 p-3 bg-card rounded-lg border border-border">
                        <div
                          className="flex items-center justify-between mb-2 group cursor-pointer"
                          onClick={() => copyToClipboard(taskId)}
                        >
                          <span className="text-xs text-muted-foreground">
                            任务 ID
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-foreground truncate max-w-[180px] whitespace-nowrap">
                              {taskId}
                            </span>
                            <Copy className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>
                        {info && (
                          <div className="mb-2 text-xs text-foreground leading-relaxed">
                            {info}
                          </div>
                        )}
                      </div>
                    )}

                    {error && (
                      <Alert
                        variant="destructive"
                        className="border-destructive mb-4"
                      >
                        <AlertTitle>{error.name}</AlertTitle>
                        <AlertDescription>{error.message}</AlertDescription>
                      </Alert>
                    )}

                    {files && Object.keys(files).length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(files).map(([key]) => (
                          <Button
                            key={key}
                            size="sm"
                            variant="outline"
                            className={cn(
                              "h-7 text-[10px] px-3 bg-muted/50 border-border hover:bg-muted hover:border-primary/20",
                            )}
                            disabled={!taskId}
                            onClick={() => {
                              setPreviewKey(key);
                              setPreviewContent("");
                              setPreviewError(null);
                            }}
                          >
                            <FileDown className="size-3 mr-1" />
                            {key}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <div className="text-muted-foreground text-sm">
                          暂无文件
                        </div>
                        <div className="text-muted-foreground/80 text-xs mt-2">
                          任务完成后会生成文件
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="h-9 bg-muted px-4 flex items-center text-muted-foreground text-xs border-t border-border">
                <span className="mr-2 text-primary">≪</span>
                <span>实时追踪任务执行进度</span>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

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
        <DialogContent className="!w-auto !max-w-[90vw]">
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
                onClick={() => handleDownload(previewKey)}
                disabled={downloading}
                className="text-[11px]"
              >
                <FileDown className="size-3 mr-1" />
                {downloading ? "下载中..." : "下载原文件"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
});
