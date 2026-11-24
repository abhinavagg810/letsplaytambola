// POST /api/contact — a message from the contact form (/contact). JSON only, same-site only, ≤ 8 KB, rate limited.
// Stores the message with the IP address, place and device of the request (headers only) for Admin → Messages.
// See docs/API.md.
import { contactResponse, handleContact } from '@/server/contact';

export async function POST(request: Request): Promise<Response> {
  try {
    return contactResponse(await handleContact(request));
  } catch (e) {
    console.error('[api] POST /api/contact', e instanceof Error ? e.message : e);
    return contactResponse({ ok: false, status: 500, code: 'server', error: 'Something went wrong on our side — please try again' });
  }
}
