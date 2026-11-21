// Who is asking, as far as the request HEADERS tell: network address and the approximate place Vercel derives from it.
// Nothing here ever reads a request body — a browser cannot tell us where it is.
//
// On Vercel the edge sets these (and overwrites anything the client sent with the same names):
//   x-forwarded-for            client address (the first hop is the visitor)        x-real-ip   the same address
//   x-vercel-ip-country        ISO 3166-1 alpha-2, e.g. IN
//   x-vercel-ip-country-region ISO 3166-2 region part, e.g. MH
//   x-vercel-ip-city           URL-encoded city name, e.g. Navi%20Mumbai
//   x-vercel-ip-latitude / x-vercel-ip-longitude / x-vercel-ip-timezone / x-vercel-ip-postal-code
// Locally (and on any host that does not set them) they are absent: every field is then null and the admin shows "Unknown".
// The place is the network's, not the person's: a city-level guess that is wrong behind VPNs and often for mobile data.
import { isIP } from 'node:net';

export interface ClientInfo {
  /** IPv4 or IPv6 text, normalised; null when unknown or malformed. */
  ip: string | null;
  /** Two upper-case letters (ISO country), or null. */
  country: string | null;
  /** Region / state code within the country (1–3 letters or digits, upper case), or null. */
  region: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
  /** IANA time zone of the address, e.g. Asia/Kolkata. */
  timezone: string | null;
  postal: string | null;
}

export const NO_CLIENT_INFO: ClientInfo = { ip: null, country: null, region: null, city: null, lat: null, lon: null, timezone: null, postal: null };

const MAX_CITY = 64;

/** One address out of a header value: trims, drops a port and IPv6 brackets, unwraps IPv4-mapped IPv6. Null when it is not an IP. */
export function cleanIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s || s.length > 64) return null;
  const bracket = /^\[([^\]]+)\](?::\d+)?$/.exec(s);
  if (bracket) s = bracket[1];
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(s)) s = s.slice(0, s.lastIndexOf(':'));
  const zone = s.indexOf('%');
  if (zone > 0) s = s.slice(0, zone);
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(s);
  if (mapped) s = mapped[1];
  return isIP(s) ? s.toLowerCase() : null;
}

function decode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

/** Free text from a header: decoded, control characters removed, trimmed, capped. Null when nothing is left. */
function text(raw: string | null, max: number): string | null {
  if (!raw) return null;
  const s = decode(raw).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  return s || null;
}

function coord(raw: string | null, limit: number): number | null {
  if (!raw || raw.length > 24 || !/^-?\d{1,3}(\.\d+)?$/.test(raw.trim())) return null;
  const n = Number(raw);
  return Number.isFinite(n) && Math.abs(n) <= limit ? Math.round(n * 10000) / 10000 : null;
}

/** The request's address and place, from headers only. Every field is validated and capped; anything odd becomes null. */
export function clientInfo(headers: Headers): ClientInfo {
  const ip = cleanIp(headers.get('x-forwarded-for')?.split(',')[0]) ?? cleanIp(headers.get('x-real-ip'));
  const country = headers.get('x-vercel-ip-country')?.trim().toUpperCase() ?? '';
  const region = headers.get('x-vercel-ip-country-region')?.trim().toUpperCase() ?? '';
  const tz = headers.get('x-vercel-ip-timezone')?.trim() ?? '';
  const postal = headers.get('x-vercel-ip-postal-code')?.trim() ?? '';
  return {
    ip,
    country: /^[A-Z]{2}$/.test(country) && country !== 'XX' ? country : null,
    region: /^[A-Z0-9]{1,3}$/.test(region) ? region : null,
    city: text(headers.get('x-vercel-ip-city'), MAX_CITY),
    lat: coord(headers.get('x-vercel-ip-latitude'), 90),
    lon: coord(headers.get('x-vercel-ip-longitude'), 180),
    timezone: /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){1,2}$/.test(tz) && tz.length <= 40 ? tz : null,
    postal: /^[A-Za-z0-9 -]{2,12}$/.test(postal) ? postal.toUpperCase() : null,
  };
}

/** Primary language of an Accept-Language header: "en-IN,en;q=0.9,hi;q=0.8" → "en-IN". Null when missing or malformed. */
export function primaryLanguage(headers: Headers): string | null {
  const first = headers.get('accept-language')?.split(',')[0]?.split(';')[0]?.trim() ?? '';
  if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/.test(first)) return null;
  const [lang, ...rest] = first.split('-');
  return [lang.toLowerCase(), ...rest.map((p) => (p.length === 2 ? p.toUpperCase() : p))].join('-');
}

// ---------------------------------------------------------------- names for the admin

const COUNTRY_NAMES: Record<string, string> = {
  IN: 'India', US: 'United States', GB: 'United Kingdom', AE: 'United Arab Emirates', CA: 'Canada', AU: 'Australia', SG: 'Singapore',
  NP: 'Nepal', BD: 'Bangladesh', LK: 'Sri Lanka', PK: 'Pakistan', DE: 'Germany', FR: 'France', NL: 'Netherlands', SA: 'Saudi Arabia',
  QA: 'Qatar', KW: 'Kuwait', OM: 'Oman', BH: 'Bahrain', MY: 'Malaysia', NZ: 'New Zealand', ZA: 'South Africa', KE: 'Kenya', IE: 'Ireland',
  JP: 'Japan', HK: 'Hong Kong', TH: 'Thailand', ID: 'Indonesia', CH: 'Switzerland', SE: 'Sweden', IT: 'Italy', ES: 'Spain', MU: 'Mauritius',
};

/** Indian states and union territories by ISO 3166-2:IN code (the part after "IN-"). */
export const IN_STATES: Record<string, string> = {
  AN: 'Andaman & Nicobar', AP: 'Andhra Pradesh', AR: 'Arunachal Pradesh', AS: 'Assam', BR: 'Bihar', CH: 'Chandigarh', CG: 'Chhattisgarh', CT: 'Chhattisgarh',
  DH: 'Dadra & Nagar Haveli and Daman & Diu', DN: 'Dadra & Nagar Haveli', DD: 'Daman & Diu', DL: 'Delhi', GA: 'Goa', GJ: 'Gujarat', HR: 'Haryana',
  HP: 'Himachal Pradesh', JK: 'Jammu & Kashmir', JH: 'Jharkhand', KA: 'Karnataka', KL: 'Kerala', LA: 'Ladakh', LD: 'Lakshadweep', MP: 'Madhya Pradesh',
  MH: 'Maharashtra', MN: 'Manipur', ML: 'Meghalaya', MZ: 'Mizoram', NL: 'Nagaland', OD: 'Odisha', OR: 'Odisha', PY: 'Puducherry', PB: 'Punjab',
  RJ: 'Rajasthan', SK: 'Sikkim', TN: 'Tamil Nadu', TS: 'Telangana', TG: 'Telangana', TR: 'Tripura', UP: 'Uttar Pradesh', UK: 'Uttarakhand', UT: 'Uttarakhand', WB: 'West Bengal',
};

/** Any other ISO country code, named by the runtime's own data ("BR" → "Brazil"); null when it does not know it. */
function intlCountryName(code: string): string | null {
  try {
    if (!/^[A-Z]{2}$/.test(code)) return null;
    const name = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' }).of(code);
    return name && name !== code ? name : null;
  } catch {
    return null;
  }
}

export function countryName(code: string | null | undefined): string {
  if (!code) return 'Unknown';
  return COUNTRY_NAMES[code] ?? intlCountryName(code) ?? code;
}

/** "Maharashtra" for ("IN", "MH"); the bare code for other countries; "Unknown" when there is none. */
export function regionName(country: string | null | undefined, region: string | null | undefined): string {
  if (!region) return 'Unknown';
  return country === 'IN' ? IN_STATES[region] ?? region : region;
}

/** "Pune, Maharashtra, India" — whatever parts are known; "Unknown" when none is. */
export function placeLabel(p: { city?: string | null; region?: string | null; country?: string | null }): string {
  const parts = [p.city || null, p.region ? regionName(p.country, p.region) : null, p.country ? countryName(p.country) : null].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Unknown';
}
