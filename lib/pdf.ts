// HTML → PDF via headless Chromium (puppeteer-core). Server-only.
//
// Two launch paths, chosen at runtime:
//   • Serverless (Vercel / AWS Lambda): @sparticuz/chromium ships a Chromium
//     build sized for the function; its brotli binary decompresses to /tmp at
//     runtime, so it doesn't count against the bundle size.
//   • Local dev / containers: a system or Playwright Chromium, resolved from
//     CHROMIUM_EXECUTABLE_PATH, the Playwright browsers dir, or common paths.
//
// CHROMIUM_EXECUTABLE_PATH, when set, always wins (both paths honour it).
// If no browser can be launched, htmlToPdf throws PdfUnavailable; callers
// surface a clear message and fall back to the public HTML invoice.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export class PdfUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfUnavailable';
  }
}

/** True when running in a Vercel/Lambda serverless function. */
function isServerless(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
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

function resolveLocalChromium(): string {
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

interface LaunchConfig {
  executablePath: string;
  args: string[];
  headless: boolean;
}

async function launchConfig(): Promise<LaunchConfig> {
  const baseArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'];

  if (isServerless() && !process.env.CHROMIUM_EXECUTABLE_PATH) {
    // Serverless: use the @sparticuz Chromium build.
    const chromium = (await import('@sparticuz/chromium')).default;
    const executablePath = await chromium.executablePath();
    if (!executablePath) {
      throw new PdfUnavailable('@sparticuz/chromium did not provide an executable path.');
    }
    return {
      executablePath,
      args: [...chromium.args, '--font-render-hinting=none'],
      headless: true,
    };
  }

  return { executablePath: resolveLocalChromium(), args: baseArgs, headless: true };
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const cfg = await launchConfig();
  const puppeteer = (await import('puppeteer-core')).default;

  const browser = await puppeteer.launch({
    executablePath: cfg.executablePath,
    headless: cfg.headless,
    args: cfg.args,
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
