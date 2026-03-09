import { chat, ChatMessage } from "./glm";

// 缓存：同一辩题只研究一次
const cache = new Map<string, string>();

/**
 * 辩前研究：让 AI 快速分析辩题相关的背景知识、最新趋势、关键数据
 * 这个研究结果会注入到每个辩手的上下文中，让辩论更有深度和时效性
 */
export async function researchTopic(topic: string): Promise<string> {
  // 命中缓存直接返回
  if (cache.has(topic)) return cache.get(topic)!;

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `你是一个资深研究助理。你的任务是为一场辩论提供背景研究简报。
要求：简洁、信息密度高、有具体数据和案例。不要废话。`,
    },
    {
      role: "user",
      content: `辩题：「${topic}」

请快速输出一份研究简报，包含以下内容（每项2-3句话即可，追求信息密度）：

1. 【关键数据】与这个辩题直接相关的统计数据、研究结论（尽量引用具体数字和来源）
2. 【最新动态】这个话题最近有什么新闻、政策变化、社会事件？
3. 【正方可用素材】支持正方的真实案例、名人观点、研究成果
4. 【反方可用素材】支持反方的真实案例、名人观点、研究成果
5. 【冷门角度】大多数人不会想到的、但很有力的切入角度（正反方各1个）
6. 【经典引用】与此话题相关的名人名言、学术观点、哲学思考（3-5条）

注意：
- 追求真实和具体，不要编造数据
- 如果不确定具体数字，用"约""据估计"等措辞
- 信息要足够新鲜，优先引用近几年的数据和事件
- 整个简报控制在500字以内`,
    },
  ];

  try {
    const result = await chat(messages);
    cache.set(topic, result);
    return result;
  } catch (error) {
    console.error("Research failed:", error);
    return ""; // 研究失败不影响辩论，返回空
  }
}
