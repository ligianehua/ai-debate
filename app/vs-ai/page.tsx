"use client";

import { useSearchParams, useRouter } from "next/navigation";
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  Suspense,
} from "react";
import { pickCharacter } from "@/lib/debate-config";

interface ChatEntry {
  role: "user" | "ai";
  side: "pro" | "con";
  content: string;
  speaker: string; // "你" or alias
}

// ============ TTS Hook ============
function useTTS() {
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const speak = useCallback(
    (id: string, text: string) => {
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
    },
    [speakingId]
  );

  const stop = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeakingId(null);
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { speakingId, speak, stop };
}

// ============ PDF Download ============
function generatePdfHtml(
  topic: string,
  entries: ChatEntry[],
  report: string,
  userSide: "pro" | "con",
  aiAlias: string
): string {
  const debateHtml = entries
    .map((e) => {
      const sideLabel = e.side === "pro" ? "🔵 正方" : "🔴 反方";
      const roleLabel = e.role === "user" ? "👤 你" : `🤖 ${aiAlias}`;
      return `
      <div style="margin-bottom:20px;page-break-inside:avoid;">
        <div style="font-size:13px;font-weight:bold;color:${
          e.side === "pro" ? "#2563eb" : "#dc2626"
        };margin-bottom:6px;">
          ${sideLabel} | ${roleLabel}
        </div>
        <div style="font-size:14px;line-height:1.8;color:#333;padding-left:12px;border-left:3px solid ${
          e.side === "pro" ? "#93c5fd" : "#fca5a5"
        };">
          ${e.content.replace(/\n/g, "<br/>")}
        </div>
      </div>`;
    })
    .join("");

  const reportHtml = report
    .replace(
      /^## (.+)$/gm,
      '<h2 style="font-size:16px;font-weight:bold;margin:20px 0 8px;color:#1a1a1a;">$1</h2>'
    )
    .replace(
      /^### (.+)$/gm,
      '<h3 style="font-size:14px;font-weight:bold;margin:16px 0 6px;color:#333;">$1</h3>'
    )
    .replace(
      /^- (.+)$/gm,
      '<div style="margin:4px 0 4px 16px;">• $1</div>'
    )
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n{2,}/g, "<br/><br/>")
    .replace(/\n/g, "<br/>");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>AI辩论 - ${topic}</title>
<style>
  @page{margin:60px 50px;}
  body{font-family:"PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif;color:#333;max-width:700px;margin:0 auto;padding:40px 20px;}
  h1{font-size:22px;text-align:center;margin-bottom:8px;}
  .subtitle{text-align:center;color:#888;font-size:13px;margin-bottom:40px;}
  .section-title{font-size:18px;font-weight:bold;margin:40px 0 20px;padding-bottom:8px;border-bottom:2px solid #e5e7eb;}
  .report{font-size:14px;line-height:1.8;color:#333;}
</style></head><body>
<h1>🎤 AI 辩论场 · 人机对决</h1>
<div class="subtitle">辩题：${topic}<br/>你（${
    userSide === "pro" ? "正方" : "反方"
  }） vs ${aiAlias}（${userSide === "pro" ? "反方" : "正方"}）</div>
<div class="section-title">📜 辩论全文</div>
${debateHtml}
${
  report
    ? `<div class="section-title">📋 评审报告</div><div class="report">${reportHtml}</div>`
    : ""
}
<div style="text-align:center;margin-top:40px;padding-top:20px;border-top:1px solid #e5e7eb;color:#aaa;font-size:12px;">
  由 AI 辩论场自动生成 · ${new Date().toLocaleDateString("zh-CN")}
</div>
</body></html>`;
}

function downloadPdf(
  topic: string,
  entries: ChatEntry[],
  report: string,
  userSide: "pro" | "con",
  aiAlias: string
) {
  const html = generatePdfHtml(topic, entries, report, userSide, aiAlias);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `AI辩论_人机对决_${topic.slice(0, 20)}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

// ============ Main Component ============
function VsAiContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const topic = searchParams.get("topic") || "";
  const userSide = (searchParams.get("side") as "pro" | "con") || "pro";
  const aiSide: "pro" | "con" = userSide === "pro" ? "con" : "pro";

  // AI 角色（只初始化一次）
  const aiCharRef = useRef<{ name: string; alias: string } | null>(null);
  if (!aiCharRef.current) {
    aiCharRef.current = pickCharacter();
  }
  const aiCharacterName = aiCharRef.current.name;
  const aiAlias = aiCharRef.current.alias;

  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [userInput, setUserInput] = useState("");
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [isFinished, setIsFinished] = useState(false);
  const [report, setReport] = useState("");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState("");
  const [roundNumber, setRoundNumber] = useState(0);

  const chatRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasStarted = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const { speakingId, speak, stop: stopTTS } = useTTS();

  // 自动滚动到底部
  const scrollToBottom = useCallback(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [entries, streamingText, scrollToBottom]);

  // ====== 流式获取 AI 回应 ======
  const fetchAiResponse = useCallback(
    async (currentEntries: ChatEntry[], round: number) => {
      setIsAiThinking(true);
      setStreamingText("");

      try {
        const res = await fetch("/api/vs-ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic,
            mode: "respond",
            aiSide,
            characterName: aiCharacterName,
            aiAlias,
            roundNumber: round,
            history: currentEntries.map((e) => ({
              speaker:
                e.role === "user" ? "人类选手" : aiAlias,
              content: e.content,
            })),
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
              if (typeof parsed === "string") {
                fullText += parsed;
                setStreamingText(fullText);
              } else if (parsed.error) {
                throw new Error(parsed.error);
              }
            } catch (e) {
              if (e instanceof Error && e.message !== "Unexpected end of JSON input") {
                // real error from API
                if (e.message && !e.message.includes("JSON")) throw e;
              }
            }
          }
        }

        const aiEntry: ChatEntry = {
          role: "ai",
          side: aiSide,
          content: fullText,
          speaker: aiAlias,
        };

        setStreamingText("");
        setIsAiThinking(false);
        return aiEntry;
      } catch (err) {
        setIsAiThinking(false);
        setStreamingText("");
        setError(err instanceof Error ? err.message : "AI 回应出错");
        return null;
      }
    },
    [topic, aiSide, aiCharacterName, aiAlias]
  );

  // ====== AI 开场 ======
  useEffect(() => {
    if (!hasStarted.current && topic) {
      hasStarted.current = true;
      (async () => {
        const aiEntry = await fetchAiResponse([], 0);
        if (aiEntry) {
          setEntries([aiEntry]);
          setRoundNumber(1);
        }
      })();
    }
  }, [topic, fetchAiResponse]);

  // ====== 用户发言 ======
  const handleSend = useCallback(async () => {
    const text = userInput.trim();
    if (!text || isAiThinking || isFinished) return;

    const userEntry: ChatEntry = {
      role: "user",
      side: userSide,
      content: text,
      speaker: "你",
    };

    const newEntries = [...entries, userEntry];
    setEntries(newEntries);
    setUserInput("");
    setRoundNumber((r) => r + 1);

    // 聚焦回输入框
    setTimeout(() => textareaRef.current?.focus(), 50);

    // AI 回应
    const aiEntry = await fetchAiResponse(newEntries, roundNumber + 1);
    if (aiEntry) {
      setEntries((prev) => [...prev, aiEntry]);
      setRoundNumber((r) => r + 1);
    }
  }, [
    userInput,
    isAiThinking,
    isFinished,
    entries,
    userSide,
    roundNumber,
    fetchAiResponse,
  ]);

  // ====== 结束辩论 ======
  const handleFinish = useCallback(async () => {
    if (entries.length < 2) return;
    setIsFinished(true);
    setIsGeneratingReport(true);

    try {
      const res = await fetch("/api/vs-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          mode: "judge",
          aiSide,
          characterName: aiCharacterName,
          aiAlias,
          history: entries.map((e) => ({
            speaker: e.role === "user" ? "人类选手" : aiAlias,
            content: e.content,
          })),
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
            if (typeof parsed === "string") {
              reportText += parsed;
              setReport(reportText);
            }
          } catch {
            /* skip */
          }
        }
      }
      setIsGeneratingReport(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成报告出错");
      setIsGeneratingReport(false);
    }
  }, [entries, topic, aiSide, aiCharacterName, aiAlias]);

  // ====== 语音输入 ======
  const toggleListening = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;

    if (!SR) {
      alert("您的浏览器不支持语音输入，请使用 Chrome 浏览器");
      return;
    }

    const recognition = new SR();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let finalText = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        }
      }
      if (finalText) {
        setUserInput((prev: string) => prev + finalText);
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening]);

  // ====== Keyboard shortcuts ======
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  if (!topic) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">未指定辩题</p>
        <button
          onClick={() => router.push("/")}
          className="ml-4 text-blue-500 underline"
        >
          返回首页
        </button>
      </div>
    );
  }

  const userSideLabel = userSide === "pro" ? "正方" : "反方";
  const aiSideLabel = aiSide === "pro" ? "正方" : "反方";
  const totalRounds = Math.floor(entries.length / 2);

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="shrink-0 bg-white/90 backdrop-blur-md border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => {
              stopTTS();
              router.push("/");
            }}
            className="text-gray-400 hover:text-gray-600 text-sm"
          >
            &larr; 返回
          </button>
          <div className="text-center flex-1 mx-4">
            <h1 className="text-sm font-semibold text-gray-800 truncate">
              {topic}
            </h1>
            <div className="text-xs text-gray-400 mt-0.5">
              <span className={userSide === "pro" ? "text-blue-500" : "text-red-500"}>
                你（{userSideLabel}）
              </span>
              {" vs "}
              <span className={aiSide === "pro" ? "text-blue-500" : "text-red-500"}>
                {aiAlias}（{aiSideLabel}）
              </span>
              {totalRounds > 0 && ` · 第 ${totalRounds} 轮`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isFinished && report && !isGeneratingReport && (
              <button
                onClick={() =>
                  downloadPdf(topic, entries, report, userSide, aiAlias)
                }
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                title="下载辩论全文+评审报告"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                下载
              </button>
            )}
            {!isFinished && entries.length >= 2 && (
              <button
                onClick={handleFinish}
                disabled={isAiThinking}
                className="px-3 py-1.5 text-xs bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors"
              >
                结束辩论
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Chat area */}
      <div ref={chatRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          {/* Welcome message */}
          {entries.length === 0 && !isAiThinking && (
            <div className="text-center py-12 text-gray-400">
              <div className="text-4xl mb-4">🎤</div>
              <p className="text-sm">AI 对手正在准备开场白...</p>
            </div>
          )}

          {entries.length === 0 && isAiThinking && (
            <div className="text-center py-12">
              <div className="text-4xl mb-4 animate-bounce">🤖</div>
              <p className="text-sm text-gray-400">
                {aiAlias} 正在组织开场白...
              </p>
            </div>
          )}

          {/* Entries */}
          {entries.map((entry, idx) => (
            <ChatBubble
              key={idx}
              entry={entry}
              userSide={userSide}
              aiAlias={aiAlias}
              speakingId={speakingId}
              onSpeak={speak}
              idx={idx}
            />
          ))}

          {/* Streaming AI response */}
          {isAiThinking && streamingText && (
            <ChatBubble
              entry={{
                role: "ai",
                side: aiSide,
                content: streamingText,
                speaker: aiAlias,
              }}
              userSide={userSide}
              aiAlias={aiAlias}
              speakingId={speakingId}
              onSpeak={speak}
              idx={-1}
              streaming
            />
          )}

          {/* AI thinking indicator */}
          {isAiThinking && !streamingText && entries.length > 0 && (
            <div className={`flex ${aiSide === "pro" ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                aiSide === "pro"
                  ? "bg-blue-50 text-blue-600"
                  : "bg-red-50 text-red-600"
              }`}>
                <div className="flex items-center gap-2 text-sm">
                  <span className="animate-pulse">●</span>
                  <span>{aiAlias} 正在思考...</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input area */}
      {!isFinished ? (
        <div className="shrink-0 bg-white border-t border-gray-200">
          <div className="max-w-3xl mx-auto px-4 py-3">
            <div className="flex items-end gap-2">
              {/* Voice button */}
              <button
                onClick={toggleListening}
                disabled={isAiThinking}
                className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                  isListening
                    ? "bg-red-500 text-white animate-pulse"
                    : "bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                } disabled:opacity-40`}
                title={isListening ? "停止录音" : "语音输入"}
              >
                {isListening ? (
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <rect x="6" y="5" width="4" height="14" rx="1" />
                    <rect x="14" y="5" width="4" height="14" rx="1" />
                  </svg>
                ) : (
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                  </svg>
                )}
              </button>

              {/* Text input */}
              <div className="flex-1 relative">
                <textarea
                  ref={textareaRef}
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    isAiThinking
                      ? "等待 AI 回应..."
                      : "输入你的论点... (Enter 发送, Shift+Enter 换行)"
                  }
                  disabled={isAiThinking}
                  rows={1}
                  className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:opacity-50 disabled:bg-gray-50 transition-all overflow-hidden"
                  style={{ minHeight: "42px", maxHeight: "120px" }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = "auto";
                    target.style.height =
                      Math.min(target.scrollHeight, 120) + "px";
                  }}
                />
                {isListening && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <span className="flex items-center gap-1 text-xs text-red-500">
                      <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                      录音中
                    </span>
                  </div>
                )}
              </div>

              {/* Send button */}
              <button
                onClick={handleSend}
                disabled={!userInput.trim() || isAiThinking}
                className="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-white flex items-center justify-center hover:from-blue-700 hover:to-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                  />
                </svg>
              </button>
            </div>

            {/* Hint */}
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-gray-400">
                {isListening
                  ? "🔴 正在录音，说完会自动填入..."
                  : entries.length < 2
                  ? "等待 AI 开场后开始你的反击"
                  : "提出你的论点，针对对方的具体观点进行反驳"}
              </p>
              {entries.length >= 2 && !isAiThinking && (
                <button
                  onClick={handleFinish}
                  className="text-xs text-amber-500 hover:text-amber-600"
                >
                  结束辩论 →
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="shrink-0 bg-white border-t border-gray-200">
          <div className="max-w-3xl mx-auto px-4 py-3 text-center text-sm text-gray-400">
            {isGeneratingReport
              ? "📝 正在生成评审报告..."
              : "辩论已结束"}
          </div>
        </div>
      )}

      {/* Error / Report modal */}
      {(error || report) && (
        <div className="fixed inset-0 z-20 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto">
            {error && !report ? (
              <div className="p-8 text-center">
                <p className="text-red-600 font-semibold text-lg mb-2">
                  出错了
                </p>
                <p className="text-sm text-red-500 mb-6">{error}</p>
                <button
                  onClick={() => router.push("/")}
                  className="px-5 py-2.5 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm hover:bg-red-100"
                >
                  返回首页
                </button>
              </div>
            ) : (
              <>
                <div className="px-6 py-4 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-gray-100 sticky top-0 rounded-t-2xl">
                  <h2 className="text-lg font-bold text-gray-800">
                    评审报告
                  </h2>
                  <p className="text-xs text-gray-500 mt-1">
                    由 AI 评委基于全场辩论生成
                  </p>
                </div>
                <div className="px-6 py-5 prose text-sm text-gray-700 leading-relaxed">
                  <SimpleMarkdown content={report} />
                  {isGeneratingReport && (
                    <span className="inline-block w-0.5 h-4 bg-gray-400 ml-0.5 animate-pulse align-middle" />
                  )}
                </div>
                {!isGeneratingReport && (
                  <div className="px-6 py-4 border-t border-gray-100 flex justify-center gap-3 sticky bottom-0 bg-white rounded-b-2xl">
                    <button
                      onClick={() =>
                        downloadPdf(
                          topic,
                          entries,
                          report,
                          userSide,
                          aiAlias
                        )
                      }
                      className="px-5 py-2.5 text-sm bg-gray-900 text-white rounded-xl hover:bg-gray-800 flex items-center gap-1.5"
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
                          d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      下载全文
                    </button>
                    <button
                      onClick={() => router.push("/")}
                      className="px-5 py-2.5 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50"
                    >
                      新的辩论
                    </button>
                    <button
                      onClick={() => {
                        stopTTS();
                        setReport("");
                      }}
                      className="px-5 py-2.5 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50"
                    >
                      关闭
                    </button>
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

// ============ Chat Bubble ============
function ChatBubble({
  entry,
  userSide,
  aiAlias,
  speakingId,
  onSpeak,
  idx,
  streaming = false,
}: {
  entry: ChatEntry;
  userSide: "pro" | "con";
  aiAlias: string;
  speakingId: string | null;
  onSpeak: (id: string, text: string) => void;
  idx: number;
  streaming?: boolean;
}) {
  const isUser = entry.role === "user";
  const isPro = entry.side === "pro";
  const cardId = `chat-${idx}`;
  const isSpeaking = speakingId === cardId;

  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"} animate-fade-in`}
    >
      <div
        className={`max-w-[80%] ${
          isUser
            ? isPro
              ? "bg-blue-500 text-white rounded-2xl rounded-br-md"
              : "bg-red-500 text-white rounded-2xl rounded-br-md"
            : isPro
            ? "bg-blue-50 text-gray-800 rounded-2xl rounded-bl-md border border-blue-100"
            : "bg-red-50 text-gray-800 rounded-2xl rounded-bl-md border border-red-100"
        }`}
      >
        {/* Header */}
        <div
          className={`px-4 pt-3 pb-1 flex items-center gap-2 text-xs ${
            isUser
              ? "text-white/70"
              : isPro
              ? "text-blue-500"
              : "text-red-500"
          }`}
        >
          <span className="font-medium">
            {isUser ? `👤 你（${entry.side === "pro" ? "正方" : "反方"}）` : `🤖 ${aiAlias}`}
          </span>
          {!isUser && !streaming && (
            <button
              onClick={() => onSpeak(cardId, entry.content)}
              className={`ml-auto p-1 rounded transition-colors ${
                isSpeaking
                  ? "bg-black/10"
                  : "hover:bg-black/5"
              }`}
              title={isSpeaking ? "停止朗读" : "朗读"}
            >
              {isSpeaking ? (
                <svg
                  className="w-3.5 h-3.5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg
                  className="w-3.5 h-3.5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.5v7a4.49 4.49 0 002.5-3.5zM14 3.23v2.06a6.51 6.51 0 010 13.42v2.06A8.51 8.51 0 0014 3.23z" />
                </svg>
              )}
            </button>
          )}
        </div>
        {/* Content */}
        <div className="px-4 pb-3 text-sm leading-relaxed whitespace-pre-wrap">
          {entry.content}
          {streaming && (
            <span className="inline-block w-0.5 h-4 bg-current ml-0.5 animate-pulse align-middle opacity-60" />
          )}
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

export default function VsAiPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-gray-400">
          加载中...
        </div>
      }
    >
      <VsAiContent />
    </Suspense>
  );
}
