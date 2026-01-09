import { tool as createTool, UIMessageStreamWriter } from "ai";
import { z } from "zod";
import { VercelAITaskToolStreamingResultTag } from "app-types/task";

const inputSchema = z.object({
  role_definition: z
    .string()
    .describe(
      "角色定义：根据客户的具体问题动态设定的专家角色（例如：资深实验室采购顾问、化工市场分析师）",
    ),

  task_objective: z
    .string()
    .describe(
      "任务目标：基于模糊的产品名称，明确调研的具体范围（例如：调研市场主流品牌及规格分布）",
    ),

  ranking_rules: z
    .string()
    .default("按市场占有率排序，区分进口与国产")
    .describe(
      "通用规则：定义数据排序或分类的逻辑，如按市占率、价格区间或产地分类",
    ),

  search_keywords: z
    .array(z.string())
    .describe(
      "调研关键词列表：构造具体的搜索组合，格式如 ['产品名称 + 常用规格', '产品 + 头部品牌(Corning/Nest等)', '产品 + 材质特性']",
    ),
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
    inputSchema: inputSchema,
    async execute(
      { role_definition, task_objective, ranking_rules, search_keywords },
      { toolCallId, abortSignal },
    ) {
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
                user_multi_task: true,
              },
              payload: {
                code_input: codeInput,
                topic: JSON.stringify({
                  角色定义: role_definition,
                  任务: task_objective,
                  通用规则: ranking_rules,
                  调研关键词: search_keywords,
                }),
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
          const success = isActuallyFinished && data.info === "end";

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
          };

          dataStream.write({
            type: "tool-output-available",
            toolCallId,
            output: lastResult,
          });

          if (isActuallyFinished) break;
        }

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

        // 获取 token_usage 数据
        let tokenUsage:
          | {
              steps: number;
              input_tokens: number;
              output_tokens: number;
              total_tokens: number;
            }
          | undefined;
        try {
          const resultUrl = `${process.env.RESEARCH_AGENT_BASE_URL}/runner/result_source?task_id=${encodeURIComponent(
            taskId,
          )}&result_source_name=result_path`;

          const resultRes = await fetch(resultUrl, { signal: abortSignal });
          if (resultRes.ok) {
            const resultJson = await resultRes.json();
            tokenUsage = resultJson.token_usage;
          }
        } catch (error) {
          // 如果获取 token_usage 失败，不影响主流程
          console.error("Failed to fetch token_usage:", error);
        }

        lastResult = {
          ...lastResult,
          endedAt: Date.now(),
          logRunPath: logRunContent,
          tokenUsage,
        };

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
