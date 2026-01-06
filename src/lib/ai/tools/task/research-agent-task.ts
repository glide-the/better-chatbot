import { jsonSchema, tool as createTool, UIMessageStreamWriter } from "ai";
import { z } from "zod";
import { VercelAITaskToolStreamingResultTag } from "app-types/task";

const inputSchema = z.object({
  topic: z.string().describe("研究任务主题/说明"),
});

const buildToolName = (name: string) =>
  name
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toUpperCase();

type ResearchAgentCodeInput = {
  workspace?: string;
  userId: string;
  userFilesDir?: string;
  userLogsDir?: string;
  logDetailPath?: string;
  logSummaryPath?: string;
  logRunPath?: string;
};

export function taskToVercelAITool(
  {
    name,
    description,
  }: {
    name: string;
    description?: string;
  },
  dataStream: UIMessageStreamWriter,
  userId: string,
) {
  const toolName = buildToolName(name);

  const tool = createTool({
    description: description ?? name,
    inputSchema: jsonSchema(inputSchema),
    async execute({ topic }, { toolCallId, abortSignal }) {
      const now = Date.now();
      const baseResult = VercelAITaskToolStreamingResultTag.create({
        toolCallId,
        taskName: name,
        startedAt: now,
        endedAt: now,
        status: "pending",
      });

      let taskId: string | undefined;

      try {
        const codeInput: ResearchAgentCodeInput = {
          workspace: process.env.RESEARCH_AGENT_WORKSPACE ?? "workspace",
          userId,
          userFilesDir: process.env.RESEARCH_AGENT_USER_FILES_DIR ?? "files",
          userLogsDir: process.env.RESEARCH_AGENT_USER_LOGS_DIR ?? "logs",
          logDetailPath:
            process.env.RESEARCH_AGENT_LOG_DETAIL_PATH ??
            "logs/log_detail.jsonl",
          logSummaryPath:
            process.env.RESEARCH_AGENT_LOG_SUMMARY_PATH ??
            "logs/log_summary.json",
          logRunPath:
            process.env.RESEARCH_AGENT_LOG_RUN_PATH ?? "logs/log_run.log",
        };

        const submitRes = await fetch(
          `${process.env.RESEARCH_AGENT_BASE_URL}/runner/submit`,
          {
            method: "POST",
            signal: abortSignal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              parameter: {
                task_name: name,
                reset: true,
              },
              payload: {
                code_input: codeInput,
                topic,
              },
            }),
          },
        );

        if (!submitRes.ok) {
          const text = await submitRes.text();
          const errorResult = {
            ...baseResult,
            endedAt: Date.now(),
            status: "fail",
            error: {
              name: "TASK_SUBMIT_ERROR",
              message: text,
            },
          };
          dataStream.write({
            type: "tool-output-available",
            toolCallId,
            output: errorResult,
          });
          return errorResult;
        }

        const json = await submitRes.json();
        taskId = json.data?.task_id;

        const firstResult = {
          ...baseResult,
          endedAt: Date.now(),
          status: json.data?.info ?? "pending",
          info: json.data?.info,
          taskId,
          finished: json.data?.finished,
        };

        dataStream.write({
          type: "tool-output-available",
          toolCallId,
          output: firstResult,
        });

        if (!taskId) {
          return {
            ...baseResult,
            endedAt: Date.now(),
            status: "fail",
            info: json.msg,
            taskId,
            finished: false,
          };
        }
        let lastResult = firstResult;

        while (!abortSignal?.aborted && !lastResult.finished) {
          await new Promise((resolve) => setTimeout(resolve, 3000));

          const res = await fetch(
            `${process.env.RESEARCH_AGENT_BASE_URL}/runner/result?task_id=${encodeURIComponent(
              taskId,
            )}`,
            { signal: abortSignal },
          );

          if (!res.ok) {
            const text = await res.text();
            lastResult = {
              ...lastResult,
              endedAt: Date.now(),
              status: "fail",
              error: {
                name: "TASK_STATUS_ERROR",
                message: text,
              },
            };
            dataStream.write({
              type: "tool-output-available",
              toolCallId,
              output: lastResult,
            });
            break;
          }

          const nextJson = await res.json();
          const data = nextJson.data;
          const finished = Boolean(data.finished);
          // 只有在 finished 为 true 且 info 不是 pending 时才算真正完成
          const isActuallyFinished = finished && data.info !== "pending";
          const success = isActuallyFinished && data.info === "completed";

          // 获取 log_run_path 日志文件内容
          let logRunContent: string | undefined;
          try {
            const logUrl = `${process.env.RESEARCH_AGENT_BASE_URL}/runner/result_source?task_id=${encodeURIComponent(
              taskId,
            )}&result_source_name=log_run_path`;

            const logRes = await fetch(logUrl, { signal: abortSignal });
            if (logRes.ok) {
              logRunContent = await logRes.text();
            }
          } catch (error) {
            // 如果获取日志失败，不影响主流程，只是不包含日志内容
            console.error("Failed to fetch log_run_path:", error);
          }

          lastResult = {
            ...lastResult,
            taskId: data.task_id,
            endedAt: Date.now(),
            status: isActuallyFinished
              ? success
                ? "completed"
                : "fail"
              : "running",
            info: data.info,
            finished: isActuallyFinished,
            result: data.result ?? lastResult.result,
            logRunPath: logRunContent,
          };

          dataStream.write({
            type: "tool-output-available",
            toolCallId,
            output: lastResult,
          });

          if (isActuallyFinished) break;
        }

        return lastResult;
      } catch (error) {
        const err = error as Error;
        const errorResult = {
          ...baseResult,
          endedAt: Date.now(),
          status: "fail",
          error: {
            name: err?.name || "TASK_ERROR",
            message: err?.message || "Unknown error",
          },
          taskId,
        };
        dataStream.write({
          type: "tool-output-available",
          toolCallId,
          output: errorResult,
        });
        return errorResult;
      }
    },
  });

  (tool as { _toolName?: string })._toolName = toolName;

  return tool;
}
