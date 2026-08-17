import { useState, useRef, useEffect } from 'react'
import logoImg from '@/imports/image.png'

const GROQ_API_KEY = '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'
const GROQ_MODEL = 'llama-3.3-70b-versatile'

const SYSTEM_PROMPT = `You are Xvesting AI, an expert AI investment advisor and financial analyst. You provide sharp, data-driven insights on:
- Stock market analysis (equities, ETFs, indices)
- Portfolio construction and asset allocation
- Macroeconomic trends and their market impact
- Technical and fundamental analysis
- Risk management strategies
- Sector and industry deep-dives
- Earnings analysis and valuation models
- Cryptocurrency and alternative assets

Be direct, concise, and professional. Use specific numbers, percentages, and financial terminology. When asked about specific stocks, provide P/E ratios, revenue trends, and competitive positioning where relevant. Always note that your analysis is informational and not personalized financial advice.`

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: Date
}

const STARTER_PROMPTS = [
  "Analyze the current S&P 500 outlook for Q4",
  "Compare NVDA vs AMD for long-term investment",
  "Best sectors to watch in a high-rate environment",
  "Explain the yield curve and recession signals",
]

async function* streamGroqResponse(messages: { role: string; content: string }[]) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      stream: true,
      temperature: 0.7,
      max_tokens: 1024,
    }),
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value)
    const lines = chunk.split('\n')

    for (const line of lines) {
      if (line.startsWith('data: ') && line !== 'data: [DONE]') {
        try {
          const data = JSON.parse(line.slice(6))
          const delta = data.choices?.[0]?.delta?.content
          if (delta) yield delta
        } catch {
          // skip malformed lines
        }
      }
    }
  }
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-neutral-500"
          style={{
            animation: 'pulse 1.2s ease-in-out infinite',
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} mb-6`}>
      <div
        className={`flex-shrink-0 w-7 h-7 rounded flex items-center justify-center text-xs font-bold font-mono ${
          isUser
            ? 'bg-white text-black'
            : 'bg-neutral-900 border border-neutral-700'
        }`}
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {isUser ? 'YOU' : <img src={logoImg} alt="X" className="w-4 h-4 object-contain invert" />}
      </div>
      <div className={`max-w-[78%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <div
          className={`px-4 py-3 rounded-lg text-sm leading-relaxed ${
            isUser
              ? 'bg-white text-black'
              : 'bg-neutral-900 border border-neutral-800 text-neutral-100'
          }`}
          style={{ fontFamily: "'Inter', sans-serif" }}
        >
          {message.content.split('\n').map((line, i) => (
            <span key={i}>
              {line}
              {i < message.content.split('\n').length - 1 && <br />}
            </span>
          ))}
        </div>
        <span className="text-[11px] text-neutral-600" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          {formatTime(message.timestamp)}
        </span>
      </div>
    </div>
  )
}

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    try {
      const saved = localStorage.getItem('xvesting-conversations')
      if (!saved) return []
      const parsed = JSON.parse(saved)
      return parsed.map((c: Conversation) => ({
        ...c,
        createdAt: new Date(c.createdAt),
        messages: c.messages.map((m: Message) => ({ ...m, timestamp: new Date(m.timestamp) })),
      }))
    } catch {
      return []
    }
  })
  const [activeId, setActiveId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const activeConversation = conversations.find(c => c.id === activeId) ?? null

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeConversation?.messages])

  useEffect(() => {
    try {
      localStorage.setItem('xvesting-conversations', JSON.stringify(conversations))
    } catch {
      // storage quota exceeded — fail silently
    }
  }, [conversations])

  function newConversation() {
    const id = crypto.randomUUID()
    const conv: Conversation = {
      id,
      title: 'New conversation',
      messages: [],
      createdAt: new Date(),
    }
    setConversations(prev => [conv, ...prev])
    setActiveId(id)
  }

  async function sendMessage(content: string) {
    if (!content.trim() || streaming) return

    let convId = activeId
    if (!convId) {
      const id = crypto.randomUUID()
      const conv: Conversation = {
        id,
        title: content.slice(0, 40),
        messages: [],
        createdAt: new Date(),
      }
      setConversations(prev => [conv, ...prev])
      setActiveId(id)
      convId = id
    }

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    }

    setConversations(prev =>
      prev.map(c =>
        c.id === convId
          ? {
              ...c,
              title: c.messages.length === 0 ? content.slice(0, 40) : c.title,
              messages: [...c.messages, userMsg],
            }
          : c
      )
    )
    setInput('')
    setStreaming(true)

    const assistantMsgId = crypto.randomUUID()
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    }

    setConversations(prev =>
      prev.map(c =>
        c.id === convId ? { ...c, messages: [...c.messages, assistantMsg] } : c
      )
    )

    try {
      const conv = conversations.find(c => c.id === convId)
      const history = [
        ...(conv?.messages ?? []),
        userMsg,
      ].map(m => ({ role: m.role, content: m.content }))

      for await (const delta of streamGroqResponse(history)) {
        setConversations(prev =>
          prev.map(c =>
            c.id === convId
              ? {
                  ...c,
                  messages: c.messages.map(m =>
                    m.id === assistantMsgId
                      ? { ...m, content: m.content + delta }
                      : m
                  ),
                }
              : c
          )
        )
      }
    } catch (err) {
      setConversations(prev =>
        prev.map(c =>
          c.id === convId
            ? {
                ...c,
                messages: c.messages.map(m =>
                  m.id === assistantMsgId
                    ? { ...m, content: 'Sorry, something went wrong. Please try again.' }
                    : m
                ),
              }
            : c
        )
      )
    } finally {
      setStreaming(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  function handleTextareaInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 160) + 'px'
    }
  }

  return (
    <div className="flex h-screen bg-black text-white overflow-hidden">
      {/* Sidebar */}
      <aside
        className="flex flex-col border-r border-neutral-900 transition-all duration-200"
        style={{ width: sidebarOpen ? 260 : 0, minWidth: sidebarOpen ? 260 : 0, overflow: 'hidden' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-neutral-900">
          <img src={logoImg} alt="Xvesting AI" className="w-7 h-7 object-contain invert" />
          <span
            className="text-sm font-semibold tracking-tight text-white"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            Xvesting AI
          </span>
        </div>

        {/* New chat */}
        <div className="px-3 py-3 border-b border-neutral-900">
          <button
            onClick={newConversation}
            className="w-full flex items-center gap-2 px-3 py-2 rounded text-sm text-neutral-400 hover:text-white hover:bg-neutral-900 transition-colors"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            New conversation
          </button>
        </div>

        {/* History */}
        <div className="flex-1 overflow-y-auto py-2">
          {conversations.length === 0 ? (
            <p className="text-xs text-neutral-700 px-4 py-3" style={{ fontFamily: "'Inter', sans-serif" }}>
              No conversations yet
            </p>
          ) : (
            conversations.map(conv => (
              <div
                key={conv.id}
                className={`group flex items-center gap-1 px-2 py-0.5 ${
                  conv.id === activeId ? 'bg-neutral-900' : 'hover:bg-neutral-950'
                }`}
              >
                <button
                  onClick={() => setActiveId(conv.id)}
                  className={`flex-1 text-left px-2 py-2 text-xs transition-colors truncate ${
                    conv.id === activeId ? 'text-white' : 'text-neutral-500 group-hover:text-neutral-300'
                  }`}
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  {conv.title || 'Untitled'}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeleteTarget(conv.id)
                  }}
                  className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-1 text-neutral-600 hover:text-white transition-all rounded"
                  title="Delete"
                >
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <path d="M1.5 1.5l8 8M9.5 1.5l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-neutral-900">
          <p
            className="text-[10px] text-neutral-700"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            Not financial advice
          </p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-neutral-900 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="text-neutral-600 hover:text-white transition-colors p-1"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="3" width="14" height="1.5" rx="0.75" fill="currentColor" />
              <rect x="1" y="7.25" width="14" height="1.5" rx="0.75" fill="currentColor" />
              <rect x="1" y="11.5" width="14" height="1.5" rx="0.75" fill="currentColor" />
            </svg>
          </button>
          <span
            className="text-sm text-neutral-400 truncate"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            {activeConversation?.title ?? 'Xvesting AI'}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <span
              className="text-[10px] text-neutral-700 font-mono"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {GROQ_MODEL}
            </span>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {!activeConversation || activeConversation.messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center px-6">
              <img src={logoImg} alt="Xvesting AI" className="w-16 h-16 object-contain invert mb-6 opacity-80" />
              <h1
                className="text-2xl font-bold tracking-tight text-white mb-1"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                Xvesting AI
              </h1>
              <p
                className="text-sm text-neutral-500 mb-10 text-center max-w-xs"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                Your intelligent investing companion. Ask anything about markets, stocks, and portfolio strategy.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                {STARTER_PROMPTS.map(prompt => (
                  <button
                    key={prompt}
                    onClick={() => sendMessage(prompt)}
                    className="text-left px-4 py-3 rounded-lg border border-neutral-800 text-xs text-neutral-400 hover:border-neutral-600 hover:text-white hover:bg-neutral-900 transition-all"
                    style={{ fontFamily: "'Inter', sans-serif" }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto px-4 py-6">
              {activeConversation.messages.map(msg => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              {streaming && activeConversation.messages[activeConversation.messages.length - 1]?.content === '' && (
                <div className="flex gap-3 mb-6">
                  <div className="flex-shrink-0 w-7 h-7 rounded bg-neutral-900 border border-neutral-700 flex items-center justify-center">
                    <img src={logoImg} alt="X" className="w-4 h-4 object-contain invert" />
                  </div>
                  <div className="px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800">
                    <TypingDots />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="flex-shrink-0 px-4 pb-4 pt-2 border-t border-neutral-900">
          <div className="max-w-2xl mx-auto">
            <div className="flex gap-2 items-end bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 focus-within:border-neutral-600 transition-colors">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleTextareaInput}
                onKeyDown={handleKeyDown}
                placeholder="Ask about markets, stocks, portfolio strategy…"
                rows={1}
                disabled={streaming}
                className="flex-1 bg-transparent resize-none outline-none text-sm text-white placeholder-neutral-600 py-1 leading-relaxed disabled:opacity-50"
                style={{
                  fontFamily: "'Inter', sans-serif",
                  minHeight: 24,
                  maxHeight: 160,
                }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || streaming}
                className="flex-shrink-0 w-7 h-7 rounded-md bg-white flex items-center justify-center disabled:opacity-30 hover:bg-neutral-200 transition-colors mb-0.5"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 10V2M2 6l4-4 4 4" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <p
              className="text-center text-[10px] text-neutral-800 mt-2"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              Xvesting AI · For informational purposes only · Not financial advice
            </p>
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="bg-neutral-950 border border-neutral-800 rounded-xl p-6 w-80 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-neutral-900 border border-neutral-700 flex items-center justify-center flex-shrink-0">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 2v5M7 10v1" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  Delete conversation?
                </p>
                <p className="text-xs text-neutral-500 mt-0.5" style={{ fontFamily: "'Inter', sans-serif" }}>
                  This can't be undone.
                </p>
              </div>
            </div>
            <p className="text-xs text-neutral-400 mb-5 leading-relaxed" style={{ fontFamily: "'Inter', sans-serif" }}>
              "{conversations.find(c => c.id === deleteTarget)?.title ?? 'Untitled'}" will be permanently deleted.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-3 py-2 rounded-lg border border-neutral-800 text-xs text-neutral-400 hover:text-white hover:border-neutral-600 transition-colors"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setConversations(prev => prev.filter(c => c.id !== deleteTarget))
                  if (activeId === deleteTarget) setActiveId(null)
                  setDeleteTarget(null)
                }}
                className="flex-1 px-3 py-2 rounded-lg bg-red-950 border border-red-900 text-xs text-red-400 hover:bg-red-900 hover:text-red-200 transition-colors"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
