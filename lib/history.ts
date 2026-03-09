/**
 * 辩论历史存储（基于 localStorage）
 */

export interface DebateRecord {
  id: string;
  userId: string;
  type: "ai-vs-ai" | "user-vs-ai";
  topic: string;
  userSide?: "pro" | "con";
  aiCharacter?: string; // AI 角色名
  aiAlias?: string; // AI 代号
  result?: "win" | "lose" | "draw" | "unknown"; // 用户的胜负
  userScore?: number;
  aiScore?: number;
  totalRounds: number;
  totalTime: number; // 秒
  stageTimes?: number[]; // 各阶段用时
  entries: {
    role: "user" | "ai" | "pro" | "con";
    speaker: string;
    content: string;
    side: "pro" | "con";
  }[];
  report?: string; // 评审报告全文
  createdAt: number;
}

const HISTORY_KEY = "debate_history";

function getAll(): DebateRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveAll(records: DebateRecord[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(records));
}

/** 保存一条辩论记录 */
export function saveDebateRecord(record: DebateRecord) {
  const all = getAll();
  all.unshift(record); // 新记录在前
  // 最多保留 50 条
  if (all.length > 50) all.length = 50;
  saveAll(all);
}

/** 获取某用户的所有辩论记录 */
export function getUserRecords(userId: string): DebateRecord[] {
  return getAll().filter((r) => r.userId === userId);
}

/** 获取某用户的统计概览 */
export function getUserStats(userId: string) {
  const records = getUserRecords(userId);
  const vsAiRecords = records.filter((r) => r.type === "user-vs-ai");
  const wins = vsAiRecords.filter((r) => r.result === "win").length;
  const losses = vsAiRecords.filter((r) => r.result === "lose").length;
  const draws = vsAiRecords.filter((r) => r.result === "draw").length;
  const totalDebates = records.length;
  const totalVsAi = vsAiRecords.length;
  const totalTime = records.reduce((sum, r) => sum + (r.totalTime || 0), 0);
  const avgScore =
    vsAiRecords.length > 0
      ? vsAiRecords.reduce((sum, r) => sum + (r.userScore || 0), 0) /
        vsAiRecords.length
      : 0;

  // 常用话题
  const topicCount: Record<string, number> = {};
  records.forEach((r) => {
    topicCount[r.topic] = (topicCount[r.topic] || 0) + 1;
  });
  const favoriteTopics = Object.entries(topicCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic]) => topic);

  // 偏好站位
  const proCount = vsAiRecords.filter((r) => r.userSide === "pro").length;
  const conCount = vsAiRecords.filter((r) => r.userSide === "con").length;

  return {
    totalDebates,
    totalVsAi,
    wins,
    losses,
    draws,
    winRate: totalVsAi > 0 ? Math.round((wins / totalVsAi) * 100) : 0,
    totalTime,
    avgScore: Math.round(avgScore * 10) / 10,
    favoriteTopics,
    preferSide: proCount >= conCount ? "pro" : "con",
    proCount,
    conCount,
  };
}

/** 获取用于 AI 分析的辩论摘要文本 */
export function getDebateSummaryForAnalysis(userId: string): string {
  const records = getUserRecords(userId).filter(
    (r) => r.type === "user-vs-ai"
  );
  if (records.length === 0) return "";

  const stats = getUserStats(userId);

  let summary = `辩论统计：共 ${stats.totalVsAi} 场人机对战，${stats.wins} 胜 ${stats.losses} 负 ${stats.draws} 平，胜率 ${stats.winRate}%，平均得分 ${stats.avgScore}。\n`;
  summary += `偏好站位：正方 ${stats.proCount} 次 / 反方 ${stats.conCount} 次\n\n`;

  // 取最近 5 场的用户发言
  const recent = records.slice(0, 5);
  recent.forEach((r, i) => {
    summary += `=== 第 ${i + 1} 场：${r.topic} ===\n`;
    summary += `结果：${r.result === "win" ? "赢" : r.result === "lose" ? "输" : "平"} (${r.userScore} vs ${r.aiScore})\n`;
    summary += `对手：${r.aiAlias || r.aiCharacter || "AI"}\n`;

    // 只提取用户的发言
    const userEntries = r.entries.filter((e) => e.role === "user");
    userEntries.forEach((e, j) => {
      summary += `用户第${j + 1}次发言：${e.content.slice(0, 300)}\n`;
    });

    // 评审报告中对用户的评价
    if (r.report) {
      const humanSection = r.report.match(
        /## 👤 人类选手表现[\s\S]*?(?=## |$)/
      );
      const adviceSection = r.report.match(
        /## 💡 给人类选手的建议[\s\S]*?(?=## |$)/
      );
      if (humanSection) summary += `评委评价：${humanSection[0].slice(0, 400)}\n`;
      if (adviceSection) summary += `评委建议：${adviceSection[0].slice(0, 400)}\n`;
    }
    summary += "\n";
  });

  return summary;
}

/** 删除某条记录 */
export function deleteRecord(recordId: string) {
  const all = getAll();
  const filtered = all.filter((r) => r.id !== recordId);
  saveAll(filtered);
}
