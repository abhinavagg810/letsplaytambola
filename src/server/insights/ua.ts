// A small hand-written User-Agent parser: just what the admin needs (device type, OS, browser, in-app browser, bot).
// Pure and dependency-free. A UA string is a claim made by the browser — good enough for counting, never for security.

export type DeviceType = 'phone' | 'tablet' | 'desktop' | 'bot' | 'unknown';

export interface UaInfo {
  device: DeviceType;
  /** "Android", "iOS", "iPadOS", "Windows", "macOS", "Linux", "ChromeOS" or null. */
  os: string | null;
  /** Major version as text ("14", "17"), or null. */
  osVersion: string | null;
  /** "Chrome", "Safari", "Firefox", "Edge", "Samsung Internet", "Opera", "UC Browser", "WebView", bot name … or null. */
  browser: string | null;
  browserVersion: string | null;
  /** The app whose built-in browser this is: "WhatsApp", "Instagram", "Facebook", … or null for a normal browser. */
  inApp: string | null;
}

export const UA_MAX = 400;

const BOT = /(bot\b|crawl|spider|slurp|facebookexternalhit|preview|headlesschrome|lighthouse|pingdom|uptime|monitor|python-requests|curl\/|wget\/|axios\/|node-fetch|go-http-client|okhttp|java\/|libwww|httpclient|scrapy|phantomjs|vercel-screenshot|bingpreview|google-inspectiontool|chrome-lighthouse|gptbot|claudebot|bytespider)/i;

const BOT_NAMES: [RegExp, string][] = [
  [/googlebot|google-inspectiontool|adsbot-google|mediapartners-google|googleother/i, 'Googlebot'],
  [/bingbot|bingpreview/i, 'Bingbot'],
  [/facebookexternalhit|facebot/i, 'Facebook preview'],
  [/whatsapp\//i, 'WhatsApp preview'],
  [/twitterbot/i, 'Twitterbot'],
  [/telegrambot/i, 'Telegram preview'],
  [/slackbot/i, 'Slackbot'],
  [/linkedinbot/i, 'LinkedInBot'],
  [/headlesschrome/i, 'Headless Chrome'],
  [/lighthouse/i, 'Lighthouse'],
  [/curl\//i, 'curl'],
  [/python/i, 'Python'],
  [/gptbot/i, 'GPTBot'],
  [/claudebot/i, 'ClaudeBot'],
];

const major = (v: string | undefined | null): string | null => {
  if (!v) return null;
  const m = /^(\d{1,4})/.exec(v.replace(/_/g, '.'));
  return m ? m[1] : null;
};
const pick = (ua: string, re: RegExp): string | null => major(re.exec(ua)?.[1]);

/** Which app's built-in browser, if any. Order matters: Instagram's UA also says FBAN-like tokens. */
function inAppOf(ua: string): string | null {
  if (/\bWhatsApp\//i.test(ua)) return 'WhatsApp';
  if (/\bInstagram\b/i.test(ua)) return 'Instagram';
  if (/\bFBAN\/|\bFBAV\/|\bFB_IAB\/|\bFBIOS\b|\bFB4A\b/i.test(ua)) return 'Facebook';
  if (/\bLine\//i.test(ua)) return 'LINE';
  if (/\bTwitter(?:Android|\s+for)/i.test(ua)) return 'X (Twitter)';
  if (/\bLinkedInApp\b/i.test(ua)) return 'LinkedIn';
  if (/\bSnapchat\b/i.test(ua)) return 'Snapchat';
  if (/\bTelegram\b/i.test(ua)) return 'Telegram';
  if (/\bGSA\//i.test(ua)) return 'Google app';
  if (/\bMicroMessenger\b/i.test(ua)) return 'WeChat';
  return null;
}

export function parseUserAgent(raw: string | null | undefined): UaInfo {
  const ua = (raw ?? '').slice(0, UA_MAX);
  const none: UaInfo = { device: 'unknown', os: null, osVersion: null, browser: null, browserVersion: null, inApp: null };
  if (!ua.trim()) return none;

  // Link-preview fetchers and crawlers first: several of them imitate a phone browser.
  if (BOT.test(ua) || /^WhatsApp\/[\d.]+/i.test(ua)) {
    const name = BOT_NAMES.find(([re]) => re.test(ua))?.[1] ?? 'Bot';
    return { ...none, device: 'bot', browser: name };
  }

  let os: string | null = null;
  let osVersion: string | null = null;
  let device: DeviceType = 'unknown';

  if (/\biPad\b/.test(ua)) {
    os = 'iPadOS'; osVersion = pick(ua, /OS (\d+[_\d]*) like Mac OS X/); device = 'tablet';
  } else if (/\biPhone\b|\biPod\b/.test(ua)) {
    os = 'iOS'; osVersion = pick(ua, /OS (\d+[_\d]*) like Mac OS X/); device = 'phone';
  } else if (/\bAndroid\b/i.test(ua)) {
    os = 'Android'; osVersion = pick(ua, /Android[ /](\d+[.\d]*)/i);
    // Android phones say "Mobile"; tablets do not. Some tablets also carry a tell-tale model token.
    device = /\bMobile\b/i.test(ua) && !/\bTablet\b|\bSM-[TX]\d|\bTab\b/i.test(ua) ? 'phone' : 'tablet';
  } else if (/\bWindows Phone\b/i.test(ua)) {
    os = 'Windows Phone'; device = 'phone';
  } else if (/\bCrOS\b/.test(ua)) {
    os = 'ChromeOS'; device = 'desktop';
  } else if (/\bWindows NT\b/.test(ua)) {
    os = 'Windows'; device = 'desktop';
    const nt = /Windows NT (\d+\.\d+)/.exec(ua)?.[1];
    osVersion = nt === '10.0' ? '10' : nt === '6.3' ? '8' : nt === '6.2' ? '8' : nt === '6.1' ? '7' : null;
  } else if (/\bMacintosh\b|\bMac OS X\b/.test(ua)) {
    os = 'macOS'; osVersion = pick(ua, /Mac OS X (\d+[_.\d]*)/); device = 'desktop';
  } else if (/\bLinux\b|\bX11\b/.test(ua)) {
    os = 'Linux'; device = 'desktop';
  } else if (/\bKAIOS\b/i.test(ua)) {
    os = 'KaiOS'; device = 'phone';
  } else if (/\bMobile\b/i.test(ua)) {
    device = 'phone';
  }

  const inApp = inAppOf(ua);
  let browser: string | null = null;
  let browserVersion: string | null = null;
  const set = (name: string, re: RegExp): boolean => {
    const m = re.exec(ua);
    if (!m) return false;
    browser = name;
    browserVersion = major(m[1]);
    return true;
  };
  // Most specific first: nearly every browser also claims to be Chrome and Safari.
  void (
    set('Edge', /\bEdg(?:e|A|iOS)?\/(\d+[.\d]*)/) ||
    set('Samsung Internet', /\bSamsungBrowser\/(\d+[.\d]*)/) ||
    set('Opera', /\b(?:OPR|OPT|Opera Mini|OPiOS)\/(\d+[.\d]*)/) ||
    set('UC Browser', /\bUC?Browser\/(\d+[.\d]*)/) ||
    set('Mi Browser', /\bMiuiBrowser\/(\d+[.\d]*)/) ||
    set('Brave', /\bBrave\/(\d+[.\d]*)/) ||
    set('DuckDuckGo', /\bDuckDuckGo\/(\d+[.\d]*)/) ||
    set('Firefox', /\b(?:Firefox|FxiOS)\/(\d+[.\d]*)/) ||
    set('Chrome', /\bCriOS\/(\d+[.\d]*)/) ||
    (/; wv\)/.test(ua) && set('WebView', /\bChrome\/(\d+[.\d]*)/)) ||
    set('Chrome', /\bChrome\/(\d+[.\d]*)/) ||
    (/\bSafari\//.test(ua) && set('Safari', /\bVersion\/(\d+[.\d]*)/)) ||
    // iOS in-app browsers carry no "Version/…" and no "Safari/…": they are WKWebView.
    ((os === 'iOS' || os === 'iPadOS') && /AppleWebKit/.test(ua) && set('WebView', /AppleWebKit\/(\d+[.\d]*)/)) ||
    set('Safari', /\bSafari\/(\d+[.\d]*)/)
  );
  if ((os === 'iOS' || os === 'iPadOS') && browser === 'WebView') browserVersion = osVersion;

  return { device, os, osVersion, browser, browserVersion, inApp };
}

/** "Android 14 · Chrome 126 · phone" for tables. */
export function uaSummary(u: { device?: string | null; os?: string | null; osVersion?: string | null; browser?: string | null; browserVersion?: string | null; inApp?: string | null }): string {
  const os = u.os ? `${u.os}${u.osVersion ? ` ${u.osVersion}` : ''}` : null;
  const br = u.inApp ? `${u.inApp} in-app` : u.browser ? `${u.browser}${u.browserVersion ? ` ${u.browserVersion}` : ''}` : null;
  const parts = [os, br].filter(Boolean);
  return parts.length ? parts.join(' · ') : u.device && u.device !== 'unknown' ? u.device : 'Unknown';
}
