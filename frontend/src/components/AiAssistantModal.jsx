import { useState, useRef, useEffect } from "react";
import { sendAiChat } from "../api/adminApi";
import Button from "../ui/Button";

const QUICK_PROMPTS = [
  "Show all overdue tasks",
  "What tasks are currently escalated?",
  "Give me a summary of our team's SLA performance",
  "Show open tasks",
];

export default function AiAssistantModal({ open, onClose }) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "👋 Hello! I am the **Sentinel AI Operations Assistant** powered by IBM watsonx. I can query real-time tasks, analyze SLA breaches, summarize team performance, and execute authorized state actions for your organization.",
      toolCalls: [],
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const chatBottomRef = useRef(null);

  useEffect(() => {
    if (open) {
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);

  if (!open) return null;

  const handleSend = async (textToSend) => {
    const prompt = (textToSend || input).trim();
    if (!prompt || loading) return;

    setError(null);
    setInput("");

    const newMessages = [...messages, { role: "user", content: prompt }];
    setMessages(newMessages);
    setLoading(true);

    try {
      // Send conversation history along with user prompt
      const history = newMessages.slice(-8).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await sendAiChat(prompt, history);

      if (res.success) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: res.message,
            toolCalls: res.toolCalls || [],
            model: res.model,
          },
        ]);
      } else {
        setError(res.message || "Unable to complete request");
      }
    } catch (err) {
      const errMsg =
        err.response?.data?.message ||
        err.response?.data?.error?.message ||
        "Failed to communicate with AI Assistant. Ensure Sentinel API is running.";
      setError(errMsg);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `⚠️ **AI Service Notice:** ${errMsg}`,
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.55)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "700px",
          height: "640px",
          background: "var(--color-bg-card)",
          borderRadius: "var(--radius-xl)",
          border: "1px solid var(--color-border)",
          boxShadow: "var(--shadow-xl)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--color-bg-card)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "var(--radius-md)",
                background: "linear-gradient(135deg, #0F62FE 0%, #0043CE 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#FFFFFF",
                fontSize: "18px",
                fontWeight: 700,
              }}
            >
              ⚡
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--color-text-main)" }}>
                Sentinel AI Operations Assistant
              </h3>
              <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                IBM watsonx.ai Integration • Secure Multi-Tenant Governance
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              fontSize: "20px",
              cursor: "pointer",
              color: "var(--color-text-muted)",
              padding: "4px 8px",
              borderRadius: "var(--radius-sm)",
            }}
          >
            ✕
          </button>
        </div>

        {/* CHAT BODY */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
          }}
        >
          {messages.map((m, idx) => (
            <div
              key={idx}
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "85%",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  color: "var(--color-text-muted)",
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  padding: "0 4px",
                }}
              >
                {m.role === "user" ? "You" : "Sentinel Assistant"}
              </div>

              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: "var(--radius-lg)",
                  fontSize: "14px",
                  lineHeight: "1.55",
                  whiteSpace: "pre-wrap",
                  background:
                    m.role === "user"
                      ? "var(--color-primary)"
                      : m.isError
                      ? "rgba(239, 68, 68, 0.1)"
                      : "var(--color-bg-body)",
                  color:
                    m.role === "user"
                      ? "#FFFFFF"
                      : m.isError
                      ? "var(--color-danger)"
                      : "var(--color-text-main)",
                  border:
                    m.role === "user"
                      ? "none"
                      : `1px solid var(--color-border)`,
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                {m.content}
              </div>

              {/* Tool Execution Badges */}
              {m.toolCalls && m.toolCalls.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "4px" }}>
                  {m.toolCalls.map((tc, tcIdx) => (
                    <span
                      key={tcIdx}
                      style={{
                        fontSize: "11px",
                        padding: "3px 8px",
                        borderRadius: "var(--radius-sm)",
                        background: "rgba(15, 98, 254, 0.12)",
                        color: "#0F62FE",
                        border: "1px solid rgba(15, 98, 254, 0.25)",
                        fontWeight: 600,
                      }}
                    >
                      ⚡ Tool: {tc.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div
              style={{
                alignSelf: "flex-start",
                padding: "10px 16px",
                background: "var(--color-bg-body)",
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--color-border)",
                fontSize: "13px",
                color: "var(--color-text-muted)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span>Consulting IBM watsonx & executing Sentinel tools...</span>
            </div>
          )}

          {error && (
            <div
              style={{
                padding: "10px 14px",
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid var(--color-danger)",
                borderRadius: "var(--radius-md)",
                color: "var(--color-danger)",
                fontSize: "13px",
              }}
            >
              {error}
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* QUICK SUGGESTIONS */}
        <div
          style={{
            padding: "8px 24px",
            borderTop: "1px solid var(--color-border)",
            background: "var(--color-bg-card)",
            display: "flex",
            gap: "8px",
            overflowX: "auto",
            scrollbarWidth: "none",
          }}
        >
          {QUICK_PROMPTS.map((qp, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(qp)}
              disabled={loading}
              style={{
                background: "var(--color-bg-body)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                padding: "5px 12px",
                fontSize: "12px",
                color: "var(--color-text-muted)",
                cursor: loading ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
                transition: "all var(--transition-fast)",
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.borderColor = "var(--color-primary)";
                  e.currentTarget.style.color = "var(--color-primary)";
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.borderColor = "var(--color-border)";
                  e.currentTarget.style.color = "var(--color-text-muted)";
                }
              }}
            >
              {qp}
            </button>
          ))}
        </div>

        {/* INPUT BAR */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          style={{
            padding: "14px 24px",
            borderTop: "1px solid var(--color-border)",
            display: "flex",
            gap: "10px",
            background: "var(--color-bg-card)",
          }}
        >
          <input
            type="text"
            placeholder="Ask Sentinel AI about tasks, SLA breaches, team performance..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-body)",
              color: "var(--color-text-main)",
              fontSize: "14px",
              outline: "none",
            }}
          />
          <Button type="submit" disabled={loading || !input.trim()}>
            {loading ? "Thinking..." : "Send"}
          </Button>
        </form>
      </div>
    </div>
  );
}
