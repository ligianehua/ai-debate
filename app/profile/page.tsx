"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback, Suspense } from "react";
import { getCurrentUser, User } from "@/lib/auth";
import {
  getUserRecords,
  getUserStats,
  getDebateSummaryForAnalysis,
  deleteRecord,
  DebateRecord,
} from "@/lib/history";

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}分${s}秒` : `${m}分钟`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

// ============ Profile Content ============
function ProfileContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get("tab") === "style" ? "style" : "history";

  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<"history" | "style">(defaultTab);
  const [records, setRecords] = useState<DebateRecord[]>([]);
  const [stats, setStats] = useState<ReturnType<typeof getUserStats> | null>(null);

  // AI 风格分析
  const [styleAnalysis, setStyleAnalysis] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");

  useEffect(() => {
    const u = getCurrentUser();
    if (!u) {
      router.push("/");
      return;
    }
    setUser(u);
    setRecords(getUserRecords(u.id));
    setStats(getUserStats(u.id));
  }, [router]);

  const handleDelete = useCallback(
    (id: string) => {
      if (!user) return;
      deleteRecord(id);
      setRecords(getUserRecords(user.id));
      setStats(getUserStats(user.id));
    },
    [user]
  );

  const generateStyleAnalysis = useCallback(async () => {
    if (!user) return;
    const summary = getDebateSummaryForAnalysis(user.id);
    if (!summary) {
      setAnalysisError("还没有人机对战记录，去辩几场再来分析吧！");
      return;
    }

    setIsAnalyzing(true);
    setStyleAnalysis("");
    setAnalysisError("");

    try {
      const res = await fetch("/api/analyze-style", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary }),
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response");

      const decoder = new TextDecoder();
      let text = "";
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (typeof parsed === "string") {
              text += parsed;
              setStyleAnalysis(text);
            }
          } catch {
            /* skip */
          }
        }
      }
      setIsAnalyzing(false);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "分析失败");
      setIsAnalyzing(false);
    }
  }, [user]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        加载中...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => router.push("/")}
            className="text-gray-400 hover:text-gray-600 text-sm"
          >
            &larr; 返回首页
          </button>
          <h1 className="text-sm font-semibold text-gray-800">个人中心</h1>
          <div className="w-16" />
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* User card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center text-3xl">
              {user.avatar}
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-gray-800">{user.nickname}</h2>
              <p className="text-sm text-gray-400">@{user.username}</p>
            </div>
          </div>

          {/* Stats grid */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
              <StatCard label="总辩论" value={stats.totalDebates} unit="场" />
              <StatCard
                label="人机对战"
                value={stats.totalVsAi}
                unit="场"
                sub={stats.totalVsAi > 0 ? `${stats.wins}胜 ${stats.losses}负` : undefined}
              />
              <StatCard
                label="胜率"
                value={stats.winRate}
                unit="%"
                color={stats.winRate >= 50 ? "text-green-600" : "text-orange-500"}
              />
              <StatCard
                label="平均得分"
                value={stats.avgScore || "-"}
                unit={stats.avgScore ? "/10" : ""}
              />
            </div>
          )}
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => setTab("history")}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
              tab === "history"
                ? "bg-white text-gray-800 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            📋 辩论历史
          </button>
          <button
            onClick={() => setTab("style")}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
              tab === "style"
                ? "bg-white text-gray-800 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            🧠 风格分析
          </button>
        </div>

        {/* Tab content */}
        {tab === "history" ? (
          <div className="space-y-3">
            {records.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
                <div className="text-4xl mb-3">📭</div>
                <p className="text-gray-400 text-sm">还没有辩论记录</p>
                <button
                  onClick={() => router.push("/")}
                  className="mt-4 px-4 py-2 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  去开始一场辩论
                </button>
              </div>
            ) : (
              records.map((record) => (
                <HistoryCard
                  key={record.id}
                  record={record}
                  onDelete={handleDelete}
                />
              ))
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-purple-50 to-blue-50 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-800">
                🧠 AI 辩论风格分析
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                基于你的辩论历史，AI 为你生成的专属辩手画像
              </p>
            </div>
            <div className="p-6">
              {!styleAnalysis && !isAnalyzing && !analysisError && (
                <div className="text-center py-8">
                  <div className="text-4xl mb-4">🎭</div>
                  <p className="text-gray-500 text-sm mb-4">
                    AI 将分析你的辩论风格、优势和成长空间
                  </p>
                  <button
                    onClick={generateStyleAnalysis}
                    className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl text-sm font-medium hover:from-purple-700 hover:to-blue-700 transition-all"
                  >
                    开始分析我的风格
                  </button>
                </div>
              )}

              {analysisError && (
                <div className="text-center py-8">
                  <div className="text-4xl mb-4">😅</div>
                  <p className="text-gray-500 text-sm mb-4">{analysisError}</p>
                  <button
                    onClick={() => router.push("/")}
                    className="px-4 py-2 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    去辩论
                  </button>
                </div>
              )}

              {(styleAnalysis || isAnalyzing) && (
                <div className="prose text-sm text-gray-700 leading-relaxed">
                  <SimpleMarkdown content={styleAnalysis} />
                  {isAnalyzing && (
                    <span className="inline-block w-0.5 h-4 bg-gray-400 ml-0.5 animate-pulse align-middle" />
                  )}
                  {!isAnalyzing && styleAnalysis && (
                    <div className="mt-6 pt-4 border-t border-gray-100 flex justify-center">
                      <button
                        onClick={generateStyleAnalysis}
                        className="px-4 py-2 text-xs text-gray-500 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        🔄 重新分析
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ Stat Card ============
function StatCard({
  label,
  value,
  unit,
  sub,
  color,
}: {
  label: string;
  value: number | string;
  unit: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-gray-50 rounded-xl px-4 py-3 text-center">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`text-xl font-bold ${color || "text-gray-800"}`}>
        {value}
        <span className="text-xs font-normal text-gray-400 ml-0.5">{unit}</span>
      </div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

// ============ History Card ============
function HistoryCard({
  record,
  onDelete,
}: {
  record: DebateRecord;
  onDelete: (id: string) => void;
}) {
  const router = useRouter();
  const isVsAi = record.type === "user-vs-ai";

  const resultColor =
    record.result === "win"
      ? "bg-green-100 text-green-700"
      : record.result === "lose"
      ? "bg-red-100 text-red-700"
      : record.result === "draw"
      ? "bg-yellow-100 text-yellow-700"
      : "bg-gray-100 text-gray-500";

  const resultLabel =
    record.result === "win"
      ? "👑 赢了"
      : record.result === "lose"
      ? "😤 输了"
      : record.result === "draw"
      ? "🤝 平局"
      : "🤖 观战";

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className={`px-2 py-0.5 rounded-md text-xs font-medium ${resultColor}`}
            >
              {resultLabel}
            </span>
            {isVsAi && (
              <span className="px-2 py-0.5 rounded-md text-xs bg-purple-50 text-purple-600">
                vs {record.aiAlias || record.aiCharacter || "AI"}
              </span>
            )}
            {!isVsAi && (
              <span className="px-2 py-0.5 rounded-md text-xs bg-blue-50 text-blue-600">
                AI vs AI
              </span>
            )}
          </div>
          <h3 className="text-sm font-medium text-gray-800 truncate">
            {record.topic}
          </h3>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
            <span>{formatDate(record.createdAt)}</span>
            <span>{record.totalRounds} 回合</span>
            <span>{formatTime(record.totalTime)}</span>
            {isVsAi && record.userScore && (
              <span>
                得分 {record.userScore} vs {record.aiScore}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {record.report && (
            <button
              onClick={() => {
                // 可以展开看 report，这里简单跳到一个模态
                alert("评审报告功能开发中...");
              }}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="查看评审报告"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </button>
          )}
          <button
            onClick={() => onDelete(record.id)}
            className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            title="删除记录"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ Simple Markdown ============
function SimpleMarkdown({ content }: { content: string }) {
  return (
    <div>
      {content.split("\n").map((line, i) => {
        if (line.startsWith("## "))
          return (
            <h2 key={i} className="text-base font-bold mt-5 mb-2">
              {line.slice(3)}
            </h2>
          );
        if (line.startsWith("### "))
          return (
            <h3 key={i} className="text-sm font-semibold mt-4 mb-1.5">
              {line.slice(4)}
            </h3>
          );
        if (line.startsWith("- "))
          return (
            <div key={i} className="flex gap-2 ml-2 my-0.5">
              <span className="text-gray-400">&#8226;</span>
              <span>{fmtBold(line.slice(2))}</span>
            </div>
          );
        if (line.startsWith("---"))
          return <hr key={i} className="my-3 border-gray-200" />;
        if (line.trim() === "") return <div key={i} className="h-2" />;
        return (
          <p key={i} className="my-1">
            {fmtBold(line)}
          </p>
        );
      })}
    </div>
  );
}

function fmtBold(text: string) {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((p, i) =>
      p.startsWith("**") && p.endsWith("**") ? (
        <strong key={i} className="font-semibold">
          {p.slice(2, -2)}
        </strong>
      ) : (
        p
      )
    );
}

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-gray-400">
          加载中...
        </div>
      }
    >
      <ProfileContent />
    </Suspense>
  );
}
