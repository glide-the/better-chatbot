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
import { TaskMetadata } from "./task-metadata";
import { DirectoryStructure } from "./directory-structure";
import { DirectoryTree } from "./directory-tree";
import "./activity-panel.css";

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

interface LogSummaryData {
  topic?: string;
  workspace?: string;
  reports_dir?: string;
  logs?: {
    detail?: string;
    summary?: string;
    run?: string;
  };
  environment?: {
    workspace?: string;
    user_id?: string;
    user_files_dir?: string;
    user_logs_dir?: string;
    current_working_directory?: string;
  };
  directory_structure?: Record<
    string,
    { path: string; purpose: string; type: "input" | "output" | "storage" }
  >;
  directory_tree?: {
    name: string;
    type: "directory" | "file";
    children?: any[];
    size?: number;
  };
  assistant_summary?: string;
}

type TabType = "logs" | "files";
type LogSourceType = "log_run" | "log_detail" | "log_summary";

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
  const [activeLogSource, setActiveLogSource] =
    useState<LogSourceType>("log_run");
  const [logContents, setLogContents] = useState<Record<LogSourceType, string>>(
    {
      log_run: "",
      log_detail: "",
      log_summary: "",
    },
  );
  const [isLoadingLog, setIsLoadingLog] = useState(false);
  const [duration, setDuration] = useState<string>("0s");
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [parsedSummary, setParsedSummary] = useState<LogSummaryData | null>(
    null,
  );
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

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isOpen, status, startedAt, endedAt, isRunning]);

  // 单独处理日志内容获取和自动刷新
  useEffect(() => {
    if (!isOpen || !taskId || activeTab !== "logs") return;

    // 立即获取一次
    fetchLogContent(taskId, activeLogSource);

    // 如果任务正在运行，设置定时刷新
    let refreshInterval: NodeJS.Timeout | null = null;
    if (isRunning) {
      refreshInterval = setInterval(() => {
        fetchLogContent(taskId, activeLogSource);
      }, 2000); // 每 2 秒刷新一次
    }

    return () => {
      if (refreshInterval) clearInterval(refreshInterval);
    };
  }, [isOpen, taskId, activeTab, activeLogSource, isRunning]);

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

  const fetchLogContent = async (id: string, logSource: LogSourceType) => {
    try {
      if (!logContents[logSource]) {
        setIsLoadingLog(true);
      }

      const logSourceKey = `${logSource}_path`;
      const resultRes = await fetch(
        `/api/research-task/result?task_id=${encodeURIComponent(id)}`,
      );
      if (!resultRes.ok) {
        console.error("Failed to fetch task result");
        return;
      }

      const resultData = (await resultRes.json()) as TaskResultResponse;
      const logPaths = resultData.data?.result;

      if (!logPaths || !logPaths[logSourceKey]) {
        console.log(`No log path available for ${logSource}`);
        return;
      }

      const downloadRes = await fetch(
        `/api/research-task/download?task_id=${encodeURIComponent(
          id,
        )}&result_source_name=${encodeURIComponent(logSourceKey)}`,
      );

      if (downloadRes.ok) {
        const content = await downloadRes.text();
        setLogContents((prev) => ({
          ...prev,
          [logSource]: content,
        }));

        if (logSource === "log_summary") {
          try {
            const parsed = JSON.parse(content) as LogSummaryData;
            setParsedSummary(parsed);
          } catch (e) {
            console.error("Failed to parse log_summary JSON:", e);
            setParsedSummary(null);
          }
        }
      }
    } catch (error) {
      console.error(`Failed to fetch log content for ${logSource}:`, error);
    } finally {
      setIsLoadingLog(false);
    }
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
              className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[9998]"
              onClick={onClose}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed right-0 top-0 bottom-0 w-96 bg-background border-l border-border shadow-2xl z-[9999] flex flex-col"
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
                  活动日志
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

                    {parsedSummary && (
                      <>
                        <div className="mb-4 p-3 bg-card rounded-lg border border-border">
                          <div className="text-xs font-medium text-foreground mb-2">
                            任务元数据
                          </div>
                          <TaskMetadata metadata={parsedSummary} />
                        </div>

                        {parsedSummary.directory_structure &&
                          Object.keys(parsedSummary.directory_structure)
                            .length > 0 && (
                            <div className="mb-4 p-3 bg-card rounded-lg border border-border">
                              <div className="text-xs font-medium text-foreground mb-2">
                                目录结构
                              </div>
                              <DirectoryStructure
                                structure={parsedSummary.directory_structure}
                              />
                            </div>
                          )}

                        {parsedSummary.directory_tree && (
                          <div className="mb-4 p-3 bg-card rounded-lg border border-border">
                            <div className="text-xs font-medium text-foreground mb-2">
                              目录树
                            </div>
                            <DirectoryTree
                              tree={parsedSummary.directory_tree}
                            />
                          </div>
                        )}
                      </>
                    )}

                    {/* 日志源文件子标签 */}
                    <div className="flex gap-1 mb-3 p-1 bg-muted rounded-lg">
                      <button
                        className={cn(
                          "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                          activeLogSource === "log_run"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                        onClick={() => setActiveLogSource("log_run")}
                      >
                        运行日志
                      </button>
                      <button
                        className={cn(
                          "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                          activeLogSource === "log_detail"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                        onClick={() => setActiveLogSource("log_detail")}
                      >
                        详细日志
                      </button>
                      <button
                        className={cn(
                          "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                          activeLogSource === "log_summary"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                        onClick={() => setActiveLogSource("log_summary")}
                      >
                        摘要日志
                      </button>
                    </div>

                    {isLoadingLog ? (
                      <div className="text-center py-12">
                        <div className="text-muted-foreground text-sm">
                          加载中...
                        </div>
                      </div>
                    ) : !logContents[activeLogSource] ? (
                      <div className="text-center py-12">
                        <div className="text-muted-foreground text-sm">
                          暂无日志内容
                        </div>
                        <div className="text-muted-foreground/80 text-xs mt-2">
                          任务正在初始化...
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border bg-muted">
                        <div className="max-h-[500px] overflow-auto p-3 font-mono text-[11px] whitespace-pre-wrap break-words">
                          {logContents[activeLogSource]}
                        </div>
                      </div>
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
