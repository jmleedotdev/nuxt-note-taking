import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'

// Bound the stream before parsing, even when Content-Length is missing or forged.
export async function readApplicationJSON(event: H3Event, maxBytes: number): Promise<
  { data: unknown } | { error: { code: 'REQUEST_TOO_LARGE' | 'INVALID_REQUEST' } }
> {
  const chunks: Buffer[] = []

  let size = 0

  for await (const chunk of event.node.req) {
    size += Buffer.byteLength(chunk)

    if (size > maxBytes) {
      setResponseStatus(event, 413)

      return {
        error: { code: 'REQUEST_TOO_LARGE' },
      } as const
    }

    chunks.push(Buffer.from(chunk))
  }

  try {
    return {
      data: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown,
    }
  } catch {
    setResponseStatus(event, 400)

    return {
      error: { code: 'INVALID_REQUEST' },
    } as const
  }
}
