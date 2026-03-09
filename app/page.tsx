"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthButton from "@/app/components/AuthButton";

const EXAMPLE_TOPICS = [
  "现在的孩子应该「快乐教育」还是「精英教育」？",
  "人工智能的发展对人类是利大于弊还是弊大于利？",
  "大学生应该先就业还是先考研？",
  "网络匿名发言应该被限制还是被保障？",
  "远程办公会取代传统办公吗？",
];

type Mode = "ai-vs-ai" | "user-vs-ai";

export default function Home() {
  const [topic, setTopic] = useState("");
  const [mode, setMode] = useState<Mode>("ai-vs-ai");
  const [side, setSide] = useState<"pro" | "con">("pro");
  const router = useRouter();

  const startDebate = () => {
    if (!topic.trim()) return;
    const t = encodeURIComponent(topic.trim());
    if (mode === "ai-vs-ai") {
      router.push(`/debate?topic=${t}`);
    } else {
      router.push(`/vs-ai?topic=${t}&side=${side}`);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4">
      <AuthButton />
      <div className="w-full max-w-2xl text-center">
        {/* Logo */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-red-500 flex items-center justify-center text-white font-bold text-lg">
              辩
            </div>
            <h1 className="text-3xl font-bold tracking-tight">AI 辩论场</h1>
          </div>
          <p className="text-gray-500 text-sm">选择模式，输入辩题，开始一场精彩辩论</p>
        </div>

        {/* Mode selector */}
        <div className="flex justify-center gap-3 mb-6">
          <button
            onClick={() => setMode("ai-vs-ai")}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl border-2 transition-all ${
              mode === "ai-vs-ai"
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
            }`}
          >
            <span className="text-lg">🤖</span>
            <div className="text-left">
              <div className="text-sm font-semibold">AI vs AI</div>
              <div className="text-xs opacity-70">观看 AI 对决</div>
            </div>
          </button>
          <button
            onClick={() => setMode("user-vs-ai")}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl border-2 transition-all ${
              mode === "user-vs-ai"
                ? "border-red-500 bg-red-50 text-red-700"
                : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
            }`}
          >
            <span className="text-lg">🎤</span>
            <div className="text-left">
              <div className="text-sm font-semibold">我 vs AI</div>
              <div className="text-xs opacity-70">亲自上场辩论</div>
            </div>
          </button>
        </div>

        {/* Side selector (only for user-vs-ai) */}
        {mode === "user-vs-ai" && (
          <div className="flex justify-center gap-3 mb-6 animate-fade-in">
            <button
              onClick={() => setSide("pro")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                side === "pro"
                  ? "bg-blue-500 text-white shadow-md"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              🔵 我打正方
            </button>
            <button
              onClick={() => setSide("con")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                side === "con"
                  ? "bg-red-500 text-white shadow-md"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              🔴 我打反方
            </button>
          </div>
        )}

        {/* Input */}
        <div className="relative mb-6">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && startDebate()}
            placeholder="输入辩论主题..."
            className="w-full px-5 py-4 text-lg border border-gray-200 rounded-2xl bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
          />
          <button
            onClick={startDebate}
            disabled={!topic.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-xl font-medium hover:from-blue-700 hover:to-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {mode === "ai-vs-ai" ? "开始辩论" : "开始挑战"}
          </button>
        </div>

        {/* Examples */}
        <div className="space-y-2">
          <p className="text-xs text-gray-400 uppercase tracking-wider">试试这些辩题</p>
          <div className="flex flex-wrap justify-center gap-2">
            {EXAMPLE_TOPICS.map((t) => (
              <button
                key={t}
                onClick={() => setTopic(t)}
                className="px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:border-gray-300 hover:text-gray-800 transition-all"
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
