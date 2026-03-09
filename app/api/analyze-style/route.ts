import { NextRequest } from "next/server";
import { streamChat, ChatMessage } from "@/lib/glm";

export async function POST(request: NextRequest) {
  const { summary } = await request.json();

  if (!summary) {
    return Response.json({ error: "缺少辩论摘要数据" }, { status: 400 });
  }

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `你是一位资深辩论教练和人格分析师。你要根据用户的辩论历史数据，分析出这个辩手的独特风格画像。

分析要求：
- 生动有趣，像是一位了解你的老教练在描述你
- 既有表扬也有建设性批评
- 用具体的例子和比喻让分析鲜活起来
- 语言风趣但有深度

请用以下格式输出（Markdown格式）：

## 🎭 辩手画像
用2-3句话描绘这个辩手的整体形象，像给小说角色写介绍一样。

## 🗡️ 辩论风格
- 攻击型 / 防守型 / 均衡型？
- 擅长什么样的论证方式？（逻辑推理/情感共鸣/类比论证/数据驱动/哲学思辨）
- 节奏感如何？（快攻型/稳扎稳打/后发制人）

## 💪 核心优势
列出3个最突出的辩论优势，每个配一句解释。

## 🎯 成长空间
列出2-3个最需要改进的地方，每个配具体建议。

## 🧠 思维模式
这个辩手倾向于用什么角度看问题？（实用主义/理想主义/批判思维/换位思考）

## 🏷️ 辩手称号
给这个辩手取一个有趣的称号/绰号（比如"数据狙击手"、"情感洪流"、"逻辑推土机"等），并解释为什么。

## 📊 能力雷达
分别打分（1-10）：
- 逻辑严密度：X/10
- 角度独特性：X/10
- 表达感染力：X/10
- 临场反应力：X/10
- 知识面广度：X/10

说人话，有态度，有趣味。`,
    },
    {
      role: "user",
      content: `以下是这位辩手的辩论历史数据，请为TA生成辩手风格分析画像：\n\n${summary}`,
    },
  ];

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
