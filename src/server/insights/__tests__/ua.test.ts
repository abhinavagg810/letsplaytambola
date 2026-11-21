import { describe, expect, it } from 'vitest';
import { parseUserAgent, uaSummary } from '../ua';

// Real-world User-Agent strings. [ua, device, os, osVersion, browser, browserVersion, inApp]
const CASES: [string, string, string | null, string | null, string | null, string | null, string | null][] = [
  // Android Chrome
  ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.122 Mobile Safari/537.36', 'phone', 'Android', '14', 'Chrome', '126', null],
  ['Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36', 'phone', 'Android', '10', 'Chrome', '124', null],
  ['Mozilla/5.0 (Linux; Android 13; Redmi Note 12 Build/TKQ1.221114.001) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36', 'phone', 'Android', '13', 'Chrome', '120', null],
  // iPhone Safari
  ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', 'phone', 'iOS', '17', 'Safari', '17', null],
  ['Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1', 'phone', 'iOS', '16', 'Safari', '16', null],
  // iPhone Chrome and Firefox
  ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1', 'phone', 'iOS', '17', 'Chrome', '125', null],
  ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/126.0 Mobile/15E148 Safari/605.1.15', 'phone', 'iOS', '17', 'Firefox', '126', null],
  // WhatsApp in-app, both platforms
  ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/24.12.78', 'phone', 'iOS', '17', 'WebView', '17', 'WhatsApp'],
  ['Mozilla/5.0 (Linux; Android 13; SM-A536E Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.165 Mobile Safari/537.36 WhatsApp/2.24.11.79', 'phone', 'Android', '13', 'WebView', '125', 'WhatsApp'],
  // Instagram and Facebook in-app
  ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F79 Instagram 334.0.4.32.98 (iPhone14,5; iOS 17_5; en_IN; en; scale=3.00; 1170x2532; 606558431)', 'phone', 'iOS', '17', 'WebView', '17', 'Instagram'],
  ['Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.147 Mobile Safari/537.36 Instagram 333.0.0.42.91 Android (34/14; 480dpi; 1080x2340; samsung; SM-S918B; dm3q; qcom; en_IN; 604247854)', 'phone', 'Android', '14', 'WebView', '125', 'Instagram'],
  ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21E236 [FBAN/FBIOS;FBAV/465.0.0.39.107;FBBV/601218516;FBDV/iPhone13,2;FBMD/iPhone;FBSN/iOS;FBSV/17.4.1;FBSS/3;FBID/phone;FBLC/en_GB;FBOP/5;FBRV/603154339]', 'phone', 'iOS', '17', 'WebView', '17', 'Facebook'],
  ['Mozilla/5.0 (Linux; Android 12; vivo 1920 Build/SP1A.210812.003; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.179 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/466.0.0.44.83;]', 'phone', 'Android', '12', 'WebView', '124', 'Facebook'],
  // Samsung Internet
  ['Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36', 'phone', 'Android', '14', 'Samsung Internet', '25', null],
  // Desktop
  ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', 'desktop', 'Windows', '10', 'Chrome', '126', null],
  ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.87', 'desktop', 'Windows', '10', 'Edge', '126', null],
  ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0', 'desktop', 'Windows', '10', 'Firefox', '127', null],
  ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15', 'desktop', 'macOS', '10', 'Safari', '17', null],
  ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', 'desktop', 'macOS', '10', 'Chrome', '126', null],
  ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36', 'desktop', 'Linux', null, 'Chrome', '125', null],
  ['Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0', 'desktop', 'Linux', null, 'Firefox', '126', null],
  ['Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36', 'desktop', 'ChromeOS', null, 'Chrome', '125', null],
  ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 OPR/111.0.0.0', 'desktop', 'Windows', '10', 'Opera', '111', null],
  // Tablets
  ['Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', 'tablet', 'iPadOS', '17', 'Safari', '17', null],
  ['Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36', 'tablet', 'Android', '13', 'Chrome', '125', null],
  ['Mozilla/5.0 (Linux; Android 12; Lenovo TB-X606F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', 'tablet', 'Android', '12', 'Chrome', '124', null],
  // Other Indian-market browsers
  ['Mozilla/5.0 (Linux; U; Android 11; en-US; RMX2185 Build/RP1A.200720.011) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/100.0.4896.58 UCBrowser/13.4.0.1306 Mobile Safari/537.36', 'phone', 'Android', '11', 'UC Browser', '13', null],
  ['Mozilla/5.0 (Linux; U; Android 12; en-in; Redmi Note 11 Build/SKQ1.211103.001) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/112.0.5615.136 Mobile Safari/537.36 XiaoMi/MiuiBrowser/14.5.2-gn', 'phone', 'Android', '12', 'Mi Browser', '14', null],
  ['Mozilla/5.0 (Linux; Android 13; SM-M127G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36 OPR/82.3.4342.79590', 'phone', 'Android', '13', 'Opera', '82', null],
  ['Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.165 Mobile Safari/537.36 GSA/15.22.31.29.arm64', 'phone', 'Android', '14', 'WebView', '125', 'Google app'],
];

const BOTS: [string, string][] = [
  ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'Googlebot'],
  ['Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.175 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'Googlebot'],
  ['Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)', 'Bingbot'],
  ['facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', 'Facebook preview'],
  ['WhatsApp/2.23.20.0 A', 'WhatsApp preview'],
  ['WhatsApp/2.24.11.79 i', 'WhatsApp preview'],
  ['Twitterbot/1.0', 'Twitterbot'],
  ['TelegramBot (like TwitterBot)', 'Twitterbot'],
  ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.0.0 Safari/537.36', 'Headless Chrome'],
  ['curl/8.5.0', 'curl'],
  ['python-requests/2.31.0', 'Python'],
  ['Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.0; +https://openai.com/gptbot)', 'GPTBot'],
];

describe('parseUserAgent', () => {
  it('covers at least 25 real browsers', () => expect(CASES.length).toBeGreaterThanOrEqual(25));
  it.each(CASES)('%s', (ua, device, os, osVersion, browser, browserVersion, inApp) => {
    expect(parseUserAgent(ua)).toEqual({ device, os, osVersion, browser, browserVersion, inApp });
  });
  it.each(BOTS)('bot: %s', (ua, name) => {
    expect(parseUserAgent(ua)).toMatchObject({ device: 'bot', browser: name, inApp: null });
  });
  it('copes with nothing, nonsense and very long strings', () => {
    const none = { device: 'unknown', os: null, osVersion: null, browser: null, browserVersion: null, inApp: null };
    expect(parseUserAgent(null)).toEqual(none);
    expect(parseUserAgent(undefined)).toEqual(none);
    expect(parseUserAgent('   ')).toEqual(none);
    expect(parseUserAgent('hello')).toEqual(none);
    expect(parseUserAgent(`Mozilla/5.0 (Linux; Android 14) ${'x'.repeat(5000)} Chrome/126.0 Mobile`).os).toBe('Android');
  });
  it('summarises for tables', () => {
    expect(uaSummary(parseUserAgent(CASES[0][0]))).toBe('Android 14 · Chrome 126');
    expect(uaSummary(parseUserAgent(CASES[7][0]))).toBe('iOS 17 · WhatsApp in-app');
    expect(uaSummary({})).toBe('Unknown');
  });
});
