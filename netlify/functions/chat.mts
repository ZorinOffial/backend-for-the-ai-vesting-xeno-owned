import type { Config } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-sonnet-5'

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

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const anthropic = new Anthropic()

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  let messages: ChatMessage[]
  try {
    const body = await req.json()
    messages = body.messages
    if (!Array.isArray(messages)) throw new Error('invalid messages')
  } catch {
    return new Response('Invalid request body', { status: 400 })
  }

  const stream = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    stream: true,
  })

  return new Response(
    new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        try {
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(event.delta.text))
            }
          }
        } catch (err) {
          controller.enqueue(encoder.encode('\n\n[Error: response interrupted]'))
        } finally {
          controller.close()
        }
      },
    }),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  )
}

export const config: Config = {
  path: '/api/chat',
}
