export type Format = 'ass' | 'ssa' | 'srt' | 'vtt' | 'sub'

export const FORMATS: readonly Format[] = ['ass', 'ssa', 'srt', 'vtt', 'sub']

const MIME: Record<Format, string> = {
  ass: 'text/x-ssa',
  ssa: 'text/x-ssa',
  srt: 'application/x-subrip',
  vtt: 'text/vtt',
  sub: 'text/plain'
}

export function formatOf (fileName: string): Format | undefined {
  const ext = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase()
  return FORMATS.find(f => f === ext)
}

export function decodeText (bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  try {
    // drops a utf-8 bom too
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    // older arabic subs are windows-1256
    return new TextDecoder('windows-1256').decode(bytes)
  }
}

// vtt may leave the hours out
const TIMES = /(?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{1,3}\s*-->\s*(?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{1,3}/

// what the text is, whatever the file is called (subbers save srt as txt). credits come out as nothing
export function detectFormat (text: string): Format | undefined {
  if (/^\s*\[Script Info\]/im.test(text) || /^Dialogue:/m.test(text)) return 'ass'
  if (/^\s*WEBVTT/.test(text) && TIMES.test(text)) return 'vtt'
  if (TIMES.test(text)) return 'srt'
  if (/^[{[]\d+[}\]][{[]\d+[}\]]/m.test(text)) return 'sub'
}

// the interface (fetch) and the ios app (urlsession) both open a data url without help
export function toDataUrl (text: string, format: Format): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  // in chunks, one big spread blows the stack
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:${MIME[format]};charset=utf-8;base64,${btoa(binary)}`
}
