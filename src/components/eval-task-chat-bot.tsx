"use client";

import { appStore } from "@/app/store";
import PromptInput from "@/components/prompt-input";
import { useToRef } from "@/hooks/use-latest";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  TextUIPart,
  UIMessage,
} from "ai";
import {
  ChatApiSchemaRequestBody,
  ChatAttachment,
  ChatModel,
} from "app-types/chat";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mutate } from "swr";
import { toast } from "sonner";
import { useGenerateThreadTitle } from "@/hooks/queries/use-generate-thread-title";
import { generateUUID, truncateString } from "lib/utils";
import { useShallow } from "zustand/shallow";
import { ErrorMessage, PreviewMessage } from "./message";

type Props = {
  threadId: string;
  initialMessages: UIMessage[];
};

export function EvalTaskChatBot({ threadId, initialMessages }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");

  const [
    appStoreMutate,
    model,
    toolChoice,
    allowedAppDefaultToolkit,
    allowedMcpServers,
    threadList,
    threadMentions,
    threadImageToolModel,
  ] = appStore(
    useShallow((state) => [
      state.mutate,
      state.chatModel,
      state.toolChoice,
      state.allowedAppDefaultToolkit,
      state.allowedMcpServers,
      state.threadList,
      state.threadMentions,
      state.threadImageToolModel,
    ]),
  );

  const generateTitle = useGenerateThreadTitle({
    threadId,
  });

  const mentions = threadMentions[threadId] ?? [];

  const latestRef = useToRef({
    model,
    toolChoice,
    allowedAppDefaultToolkit,
    allowedMcpServers,
    mentions,
    threadImageToolModel,
    threadList,
    messages: initialMessages,
  });

  const onFinish = useCallback(() => {
    const messages = latestRef.current.messages;
    const prevThread = latestRef.current.threadList.find(
      (v) => v.id === threadId,
    );

    const isNewThread =
      !prevThread?.title &&
      messages.filter((v) => v.role === "user" || v.role === "assistant")
        .length < 3;

    if (isNewThread) {
      const part = messages
        .slice(0, 2)
        .flatMap((m) =>
          m.parts
            .filter((v) => v.type === "text")
            .map(
              (p) =>
                `${m.role}: ${truncateString((p as TextUIPart).text, 500)}`,
            ),
        );
      if (part.length > 0) {
        generateTitle(part.join("\n\n"));
      }
    } else if (latestRef.current.threadList[0]?.id !== threadId) {
      mutate("/api/thread");
    }
  }, [threadId, generateTitle, latestRef]);

  const {
    messages,
    status,
    setMessages,
    addToolResult: _addToolResult,
    error,
    sendMessage,
    stop,
  } = useChat<UIMessage>({
    id: threadId,
    api: "/api/eval/task_chat",
    initialMessages,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    experimental_throttleFast: true,
    streamMode: "text",
    sendExtraMessageFields: true,
    generateId: generateUUID,
    onFinish,
    transport: new DefaultChatTransport({
      api: "/api/eval/task_chat",
      prepareSendMessagesRequest: ({ messages, body, id }) => {
        if (window.location.pathname !== `/eval-task/${threadId}`) {
          window.history.replaceState({}, "", `/eval-task/${threadId}`);
        }

        const lastMessage = messages.at(-1)!;
        const attachments: ChatAttachment[] = lastMessage.parts.reduce(
          (acc: ChatAttachment[], part: any) => {
            if (part?.type === "file") {
              acc.push({
                type: "file",
                url: part.url,
                mediaType: part.mediaType,
                filename: part.filename,
              });
            } else if (part?.type === "source-url") {
              acc.push({
                type: "source-url",
                url: part.url,
                mediaType: part.mediaType,
                filename: part.title,
              });
            }
            return acc;
          },
          [],
        );

        const sanitizedLastMessage = {
          ...lastMessage,
          parts: lastMessage.parts.filter((p: any) => p?.type !== "source-url"),
        } as typeof lastMessage;

        const hasFilePart = lastMessage.parts?.some(
          (p: any) => p?.type === "file",
        );

        const requestBody: ChatApiSchemaRequestBody = {
          ...(body as { model?: ChatModel }),
          id: id ?? threadId,
          chatModel:
            (body as { model: ChatModel })?.model ?? latestRef.current.model,
          toolChoice: latestRef.current.toolChoice,
          allowedAppDefaultToolkit:
            latestRef.current.mentions?.length || hasFilePart
              ? []
              : latestRef.current.allowedAppDefaultToolkit,
          allowedMcpServers: latestRef.current.mentions?.length
            ? {}
            : latestRef.current.allowedMcpServers,
          mentions: latestRef.current.mentions,
          message: sanitizedLastMessage,
          imageTool: {
            model: latestRef.current.threadImageToolModel[threadId],
          },
          attachments,
        };

        return { body: requestBody };
      },
    }),
    onError(err) {
      toast.error(err.message);
      setMessages((prev) => prev.slice(0, -1));
    },
  });

  useEffect(() => {
    latestRef.current.messages = messages;
    latestRef.current.threadList = threadList;
  }, [messages, threadList, latestRef]);

  const addToolResult = useCallback(
    async (result: Parameters<typeof _addToolResult>[0]) => {
      await _addToolResult(result);
    },
    [_addToolResult],
  );

  const isLoading = useMemo(
    () => status === "streaming" || status === "submitted",
    [status],
  );

  useEffect(() => {
    appStoreMutate({ currentThreadId: threadId });
    return () => {
      appStoreMutate({ currentThreadId: null });
    };
  }, [threadId, appStoreMutate]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex h-full flex-col">
      <div
        ref={containerRef}
        className="flex-1 space-y-4 overflow-y-auto px-4 py-6"
      >
        {messages.map((message, index) => {
          const isLastMessage = messages.length - 1 === index;
          return (
            <PreviewMessage
              key={message.id ?? index}
              threadId={threadId}
              messageIndex={index}
              prevMessage={messages[index - 1]}
              message={message}
              status={status}
              addToolResult={addToolResult}
              isLoading={isLoading}
              isLastMessage={isLastMessage}
              setMessages={setMessages}
              sendMessage={sendMessage}
            />
          );
        })}
        {error && <ErrorMessage error={error} />}
      </div>
      <div className="border-t bg-background px-4 py-3">
        <PromptInput
          threadId={threadId}
          input={input}
          setInput={setInput}
          sendMessage={sendMessage}
          isLoading={isLoading}
          onStop={stop}
        />
      </div>
    </div>
  );
}
