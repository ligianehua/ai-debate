"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { DEBATE_STAGES } from "@/lib/debate-config";

interface DebateEntry {
  stageId: string;
  stageName: string;
  speaker: string;
  side: "pro" | "con";
  content: string;
}

// ============ TTS Hook ============
function useTTS() {
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const speak = useCallback((id: string, text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    if (speakingId === id) {
      setSpeakingId(null);
      return;
    }

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "zh-CN";
    utter.rate = 1.1;
    utter.onend = () => setSpeakingId(null);
    utter.onerror = () => setSpeakingId(null);
    setSpeakingId(id);
    window.speechSynthesis.speak(utter);
  }, [speakingId]);

  const stop = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeakingId(null);
  }, []);

  useEffect(() => () => { stop(); }, [stop]);

  return { speakingId, speak, stop };
}

// ============ Main Component ============
function DebateContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const topic = searchParams.get("topic") || "";

  const [entries, setEntries] = useState<DebateEntry[]>([]);
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [streamingText, setStreamingText] = useState("");
  const [streamingSide, setStreamingSide] = useState<"pro" | "con">("pro");
  const [streamingSpeaker, setStreamingSpeaker] = useState("");
  const [streamingStageName, setStreamingStageName] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [report, setReport] = useState("");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [status, setStatus] = useState("准备开始...");
  const [error, setError] = useState("");

  const proRef = useRef<HTMLDivElement>(null);
  const conRef = useRef<HTMLDivElement>(null);
  const hasStarted = useRef(false);
  const { speakingId, speak, stop: stopTTS } = useTTS();

  const scrollColumn = useCallback((side: "pro" | "con") => {
    const ref = side === "pro" ? proRef : conRef;
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, []);

  useEffect(() => {
    if (entries.length > 0) scrollColumn(entries[entries.length - 1].side);
  }, [entries, scrollColumn]);

  useEffect(() => {
    if (streamingText) scrollColumn(streamingSide);
  }, [streamingText, streamingSide, scrollColumn]);

  const streamStage = useCallback(
    async (stageIdx: number, freeRoundNum: number, history: DebateEntry[]) => {
      const stage = DEBATE_STAGES[stageIdx];
      if (!stage) return null;

      const isFree = stage.id === "free-debate";
      const side: "pro" | "con" = isFree
        ? freeRoundNum % 2 === 0 ? "pro" : "con"
        : (stage.side as "pro" | "con");
      const speaker = isFree ? (freeRoundNum % 2 === 0 ? "正方" : "反方") : stage.speaker;
      const stageName = isFree ? `自由辩论 · 第${freeRoundNum + 1}轮` : stage.name;

      setStatus(`${stage.name} — ${speaker}发言中...`);
      setIsStreaming(true);
      setStreamingText("");
      setStreamingSide(side);
      setStreamingSpeaker(speaker);
      setStreamingStageName(stageName);

      const res = await fetch("/api/debate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic, stageIndex: stageIdx,
          history: history.map((e) => ({ speaker: e.speaker, content: e.content })),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "API 请求失败");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullText = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (typeof parsed === "string") { fullText += parsed; setStreamingText(fullText); }
            else if (parsed.error) { fullText = `[错误] ${parsed.error}`; setStreamingText(fullText); break; }
          } catch { /* skip */ }
        }
      }

      setIsStreaming(false);
      setStreamingText("");
      return { stageId: stage.id, stageName, speaker, side, content: fullText } as DebateEntry;
    },
    [topic]
  );

  const runDebate = useCallback(async () => {
    if (!topic) return;
    try {
      const allEntries: DebateEntry[] = [];
      let stageIdx = 0;
      let freeRoundIdx = 0;

      while (stageIdx < DEBATE_STAGES.length) {
        const stage = DEBATE_STAGES[stageIdx];
        if (stage.id === "free-debate") {
          const totalRounds = stage.rounds || 4;
          while (freeRoundIdx < totalRounds) {
            const entry = await streamStage(stageIdx, freeRoundIdx, allEntries);
            if (entry) {
              if (entry.content.startsWith("[错误]")) { setError(entry.content); return; }
              allEntries.push(entry);
              setEntries([...allEntries]);
            }
            freeRoundIdx++;
            await new Promise((r) => setTimeout(r, 500));
          }
          freeRoundIdx = 0;
        } else {
          const entry = await streamStage(stageIdx, 0, allEntries);
          if (entry) {
            if (entry.content.startsWith("[错误]")) { setError(entry.content); return; }
            allEntries.push(entry);
            setEntries([...allEntries]);
          }
        }
        stageIdx++;
        setCurrentStageIndex(stageIdx);
        await new Promise((r) => setTimeout(r, 800));
      }

      setIsFinished(true);
      setStatus("辩论结束，正在生成评审报告...");
      setIsGeneratingReport(true);

      const res = await fetch("/api/debate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic, mode: "judge",
          history: allEntries.map((e) => ({ speaker: e.speaker, content: e.content })),
        }),
      });

      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let reportText = "";
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
            if (typeof parsed === "string") { reportText += parsed; setReport(reportText); }
          } catch { /* skip */ }
        }
      }
      setIsGeneratingReport(false);
      setStatus("辩论完成");
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误");
      setIsStreaming(false);
    }
  }, [topic, streamStage]);

  useEffect(() => {
    if (!hasStarted.current && topic) {
      hasStarted.current = true;
      runDebate();
    }
  }, [topic, runDebate]);

  if (!topic) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">未指定辩题</p>
        <button onClick={() => router.push("/")} className="ml-4 text-blue-500 underline">返回首页</button>
      </div>
    );
  }

  const progress = isFinished ? 100 : Math.round((currentStageIndex / DEBATE_STAGES.length) * 100);
  const proEntries = entries.filter((e) => e.side === "pro");
  const conEntries = entries.filter((e) => e.side === "con");

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="shrink-0 bg-white/90 backdrop-blur-md border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => { stopTTS(); router.push("/"); }} className="text-gray-400 hover:text-gray-600 text-sm">&larr; 返回</button>
          <h1 className="text-sm font-semibold text-gray-800 truncate max-w-lg mx-4">{topic}</h1>
          <div className="text-xs text-gray-400 whitespace-nowrap">{status}</div>
        </div>
        <div className="h-0.5 bg-gray-100">
          <div className="h-full bg-gradient-to-r from-blue-500 to-red-500 transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </header>

      {/* Two-column debate */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Pro (left) */}
        <div className="flex-1 flex flex-col border-r border-gray-200">
          <div className="shrink-0 px-4 py-2.5 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <span className="text-sm font-semibold text-blue-700">正方</span>
            <span className="text-xs text-blue-400 ml-auto">{proEntries.length} 次发言</span>
          </div>
          <div ref={proRef} className="flex-1 overflow-y-auto p-3 space-y-3">
            {proEntries.map((entry, idx) => (
              <DebateCard key={`pro-${idx}`} entry={entry} speakingId={speakingId} onSpeak={speak} />
            ))}
            {isStreaming && streamingSide === "pro" && streamingText && (
              <DebateCard entry={{ stageId: "", stageName: streamingStageName, speaker: streamingSpeaker, side: "pro", content: streamingText }} streaming speakingId={speakingId} onSpeak={speak} />
            )}
            {isStreaming && streamingSide === "pro" && !streamingText && (
              <div className="flex items-center gap-2 px-3 py-2 text-gray-400 text-sm"><span className="animate-pulse-dot">●</span><span>正在思考...</span></div>
            )}
          </div>
        </div>

        {/* Con (right) */}
        <div className="flex-1 flex flex-col">
          <div className="shrink-0 px-4 py-2.5 bg-red-50 border-b border-red-100 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className="text-sm font-semibold text-red-700">反方</span>
            <span className="text-xs text-red-400 ml-auto">{conEntries.length} 次发言</span>
          </div>
          <div ref={conRef} className="flex-1 overflow-y-auto p-3 space-y-3">
            {conEntries.map((entry, idx) => (
              <DebateCard key={`con-${idx}`} entry={entry} speakingId={speakingId} onSpeak={speak} />
            ))}
            {isStreaming && streamingSide === "con" && streamingText && (
              <DebateCard entry={{ stageId: "", stageName: streamingStageName, speaker: streamingSpeaker, side: "con", content: streamingText }} streaming speakingId={speakingId} onSpeak={speak} />
            )}
            {isStreaming && streamingSide === "con" && !streamingText && (
              <div className="flex items-center gap-2 px-3 py-2 text-gray-400 text-sm"><span className="animate-pulse-dot">●</span><span>正在思考...</span></div>
            )}
          </div>
        </div>
      </div>

      {/* Error / Report modal */}
      {(error || report) && (
        <div className="fixed inset-0 z-20 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto">
            {error ? (
              <div className="p-8 text-center">
                <p className="text-red-600 font-semibold text-lg mb-2">辩论出错</p>
                <p className="text-sm text-red-500 mb-6">{error}</p>
                <button onClick={() => router.push("/")} className="px-5 py-2.5 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm hover:bg-red-100">返回首页</button>
              </div>
            ) : (
              <>
                <div className="px-6 py-4 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-gray-100 sticky top-0 rounded-t-2xl">
                  <h2 className="text-lg font-bold text-gray-800">评审报告</h2>
                  <p className="text-xs text-gray-500 mt-1">由 AI 评委基于全场辩论生成</p>
                </div>
                <div className="px-6 py-5 prose text-sm text-gray-700 leading-relaxed">
                  <SimpleMarkdown content={report} />
                  {isGeneratingReport && <span className="inline-block w-0.5 h-4 bg-gray-400 ml-0.5 animate-pulse align-middle" />}
                </div>
                {!isGeneratingReport && (
                  <div className="px-6 py-4 border-t border-gray-100 flex justify-center gap-3 sticky bottom-0 bg-white rounded-b-2xl">
                    <button onClick={() => router.push("/")} className="px-5 py-2.5 text-sm bg-gray-900 text-white rounded-xl hover:bg-gray-800">新的辩论</button>
                    <button onClick={() => { stopTTS(); setReport(""); }} className="px-5 py-2.5 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50">关闭报告</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============ Debate Card ============
function DebateCard({ entry, streaming = false, speakingId, onSpeak }: {
  entry: DebateEntry; streaming?: boolean; speakingId: string | null; onSpeak: (id: string, text: string) => void;
}) {
  const isPro = entry.side === "pro";
  const cardId = `${entry.stageName}-${entry.speaker}`;
  const isSpeaking = speakingId === cardId;

  return (
    <div className={`animate-fade-in rounded-xl border overflow-hidden ${isPro ? "border-blue-100 bg-white" : "border-red-100 bg-white"}`}>
      <div className={`flex items-center gap-2 px-3 py-2 border-b ${isPro ? "border-blue-50 bg-blue-50/40" : "border-red-50 bg-red-50/40"}`}>
        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${isPro ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"}`}>{entry.speaker}</span>
        <span className="text-xs text-gray-400 flex-1">{entry.stageName}</span>
        {streaming ? (
          <span className="text-xs text-gray-400 animate-pulse-dot">发言中...</span>
        ) : (
          !entry.content.startsWith("[错误]") && (
            <button onClick={() => onSpeak(cardId, entry.content)}
              className={`p-1 rounded-md transition-colors ${isSpeaking ? "bg-gray-200 text-gray-700" : "text-gray-300 hover:text-gray-500 hover:bg-gray-100"}`}
              title={isSpeaking ? "停止朗读" : "朗读"}>
              {isSpeaking ? (
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.5v7a4.49 4.49 0 002.5-3.5zM14 3.23v2.06a6.51 6.51 0 010 13.42v2.06A8.51 8.51 0 0014 3.23z"/></svg>
              )}
            </button>
          )
        )}
      </div>
      <div className="px-3 py-2.5 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
        {entry.content}
        {streaming && <span className="inline-block w-0.5 h-4 bg-gray-400 ml-0.5 animate-pulse align-middle" />}
      </div>
    </div>
  );
}

// ============ Simple Markdown ============
function SimpleMarkdown({ content }: { content: string }) {
  return (
    <div>
      {content.split("\n").map((line, i) => {
        if (line.startsWith("## ")) return <h2 key={i} className="text-base font-bold mt-5 mb-2">{line.slice(3)}</h2>;
        if (line.startsWith("### ")) return <h3 key={i} className="text-sm font-semibold mt-4 mb-1.5">{line.slice(4)}</h3>;
        if (line.startsWith("- ")) return <div key={i} className="flex gap-2 ml-2 my-0.5"><span className="text-gray-400">&#8226;</span><span>{fmtBold(line.slice(2))}</span></div>;
        if (line.startsWith("---")) return <hr key={i} className="my-3 border-gray-200" />;
        if (line.trim() === "") return <div key={i} className="h-2" />;
        return <p key={i} className="my-1">{fmtBold(line)}</p>;
      })}
    </div>
  );
}

function fmtBold(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong> : p
  );
}

export default function DebatePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400">加载中...</div>}>
      <DebateContent />
    </Suspense>
  );
}
