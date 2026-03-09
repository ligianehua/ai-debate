import { NextRequest } from "next/server";
import { streamChat, ChatMessage } from "@/lib/glm";
import {
  DEBATE_STAGES,
  buildSystemPrompt,
  buildJudgePrompt,
} from "@/lib/debate-config";
import { researchTopic } from "@/lib/research";

export async function POST(request: NextRequest) {
  const { topic, stageIndex, history, mode } = await request.json();

  if (!topic) {
    return Response.json({ error: "缺少辩题" }, { status: 400 });
  }

  // 获取辩题研究简报（有缓存，同一辩题只调用一次 AI）
  const research = await researchTopic(topic);

  // 生成评委报告
  if (mode === "judge") {
    const messages: ChatMessage[] = [
      { role: "system", content: buildJudgePrompt(topic) },
      {
        role: "user",
        content: `以下是双方的全部辩论记录：\n\n${history
          .map(
            (h: { speaker: string; content: string }) =>
              `【${h.speaker}】\n${h.content}`
          )
          .join("\n\n---\n\n")}`,
      },
    ];

    return createStreamResponse(messages);
  }

  // 正常辩论阶段
  const stage = DEBATE_STAGES[stageIndex];
  if (!stage) {
    return Response.json({ error: "无效的阶段" }, { status: 400 });
  }

  // 自由辩论阶段 — 根据 subRound 决定正反方
  const freeSub =
    stage.id === "free-debate"
      ? history && history.length % 2 === 0
        ? "pro"
        : "con"
      : undefined;

  const side = freeSub || stage.side;
  const systemPrompt = buildSystemPrompt(
    side as "pro" | "con",
    topic,
    stage,
    freeSub as "pro" | "con" | undefined,
    research // 传入研究简报
  );

  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt }];

  // 添加历史发言作为上下文
  if (history && history.length > 0) {
    const historyText = history
      .map(
        (h: { speaker: string; content: string }) =>
          `【${h.speaker}】\n${h.content}`
      )
      .join("\n\n");

    messages.push({
      role: "user",
      content: `以下是之前的辩论记录：\n\n${historyText}\n\n现在请你作为${
        side === "pro" ? "正方" : "反方"
      }发言。`,
    });
  } else {
    messages.push({
      role: "user",
      content: `请开始你的发言。`,
    });
  }

  return createStreamResponse(messages);
}

function createStreamResponse(messages: ChatMessage[]) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamChat(messages)) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
