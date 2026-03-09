import { NextRequest } from "next/server";
import { streamChat, ChatMessage } from "@/lib/glm";
import { buildVsAiPrompt, buildVsAiJudgePrompt } from "@/lib/debate-config";
import { researchTopic } from "@/lib/research";

export async function POST(request: NextRequest) {
  const { topic, mode, aiSide, characterName, aiAlias, history, roundNumber } =
    await request.json();

  if (!topic) {
    return Response.json({ error: "缺少辩题" }, { status: 400 });
  }

  // 获取辩题研究简报（有缓存）
  const research = await researchTopic(topic);

  // 生成评审报告
  if (mode === "judge") {
    const userSide = aiSide === "pro" ? "con" : "pro";
    const messages: ChatMessage[] = [
      {
        role: "system",
        content: buildVsAiJudgePrompt(
          topic,
          userSide as "pro" | "con",
          characterName,
          aiAlias
        ),
      },
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

  // AI 回应模式
  const systemPrompt = buildVsAiPrompt(
    characterName,
    aiSide as "pro" | "con",
    topic,
    research,
    roundNumber || 0
  );

  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt }];

  if (history && history.length > 0) {
    const historyText = history
      .map(
        (h: { speaker: string; content: string }) =>
          `【${h.speaker}】\n${h.content}`
      )
      .join("\n\n");

    messages.push({
      role: "user",
      content: `以下是之前的辩论记录：\n\n${historyText}\n\n现在请你回应对方最新的发言。`,
    });
  } else {
    messages.push({
      role: "user",
      content: `辩论开始，请你先开场发言。`,
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
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
          );
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
