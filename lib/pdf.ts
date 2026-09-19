// HTML → PDF via headless Chromium (puppeteer-core). Kept server-only.
//
// The Chromium binary is resolved at runtime, in order:
//   1. CHROMIUM_EXECUTABLE_PATH (set this on Vercel — e.g. @sparticuz/chromium)
//   2. PLAYWRIGHT_BROWSERS_PATH/chromium-*/chrome-linux/chrome (dev containers)
//   3. common system locations
// If none launches, htmlToPdf throws PdfUnavailable; callers surface a clear
// message and fall back to the public HTML invoice (which needs no browser).

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export class PdfUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfUnavailable';
  }
}

function fromPlaywright(): string | null {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const dirs = readdirSync(base).filter((d) => d.startsWith('chromium-'));
    for (const d of dirs) {
      const p = join(base, d, 'chrome-linux', 'chrome');
      if (existsSync(p)) return p;
    }
  } catch {
    /* not present */
  }
  return null;
}

function resolveChromium(): string {
  const candidates = [
    process.env.CHROMIUM_EXECUTABLE_PATH,
    fromPlaywright(),
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ].filter(Boolean) as string[];
  for (const p of candidates) if (existsSync(p)) return p;
  throw new PdfUnavailable(
    'No Chromium found. Set CHROMIUM_EXECUTABLE_PATH to a Chromium binary.'
  );
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const executablePath = resolveChromium();
  const puppeteer = (await import('puppeteer-core')).default;

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
  });
  try {
    const page = await browser.newPage();
    // 'networkidle0' lets the Google Fonts (Noto Arabic) load before printing.
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30_000 });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', bottom: '18mm', left: '14mm', right: '14mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
