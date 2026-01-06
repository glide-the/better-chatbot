"use client";

import { memo, useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Copy } from "lucide-react";
import { VercelAITaskToolStreamingResult } from "app-types/task";
import { Alert, AlertDescription, AlertTitle } from "ui/alert";
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
  const { status, taskId, error, taskName, startedAt, endedAt } = result;

  const isRunning = status === "pending" || status === "running";
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
  const [parsedSummary, setParsedSummary] = useState<LogSummaryData | null>(
    null,
  );
  const isFirstLoad = useRef(true);

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
    if (!isOpen || !taskId) return;

    isFirstLoad.current = true;

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
  }, [isOpen, taskId, activeLogSource, isRunning]);

  const fetchLogContent = async (id: string, logSource: LogSourceType) => {
    try {
      const isFirstTime = isFirstLoad.current;

      if (isFirstTime) {
        setIsLoadingLog(true);
        isFirstLoad.current = false;
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

        setLogContents((prev) => {
          if (prev[logSource] === content) {
            return prev;
          }
          return {
            ...prev,
            [logSource]: content,
          };
        });

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
      {isOpen &&
        createPortal(
          <AnimatePresence>
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

                <div className="flex-1 overflow-y-auto custom-scrollbar">
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
                </div>

                <div className="h-9 bg-muted px-4 flex items-center text-muted-foreground text-xs border-t border-border">
                  <span className="mr-2 text-primary">≪</span>
                  <span>实时追踪任务执行进度</span>
                </div>
              </motion.div>
            </>
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
});
