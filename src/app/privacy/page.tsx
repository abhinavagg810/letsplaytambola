// ⚠ DRAFT LEGAL TEXT — NOT REVIEWED BY A LAWYER.
// Written for v2 (no accounts) from the product facts in docs/design_handoff/README.md and docs/BUILD_NOTES.md.
// Have a qualified lawyer review it before launch, and replace the placeholders:
//   • the contact email (CONTACT_EMAIL_PLACEHOLDER in src/features/website/legal.ts)
//   • the Grievance Officer's name and postal address (section "contact")
//   • the legal name of the business that runs the site
// If the product changes (analytics, ads, new data, longer storage), this page must change with it.
// The retention section describes what the code does: tickets and dabs erased at 24 hours, a game summary and an
// anonymous device identifier kept for 90 days for the operator's admin panel (docs/ADMIN.md, supabase/migrations/0002_admin.sql).
// Storing a summary for 90 days for statistics is a NEW purpose since the first draft — ask the lawyer to check it.
// NEW since the second draft (supabase/migrations/0003_insights.sql, src/server/insights, src/lib/track.ts) — ask the lawyer to check
// each of these, and whether consent / a notice is needed for them under the DPDP Act and for visitors from the EU/UK:
//   • the IP address is now STORED by us (before, only the hosting providers processed it), with the approximate location
//     (city / region / country) the host derives from it — never GPS;
//   • browser and device details, how the visitor arrived (referrer, campaign tags), and usage events are recorded;
//   • a per-device record is kept (first/last seen, counts) — kept 90 days, visible only to the operator, erasable on request.
// The sections "collect", "use", "share", "storage", "retention", "rights" and "children" below describe exactly that.
// "{email}" in the text is replaced by a mail link.
import { ADS_ON } from '@/lib/ads';
import type { Metadata } from 'next';
import { LegalPage } from '@/features/website/LegalPage';
import type { LegalSection } from '@/features/website/legal';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'What Letsplaytambola collects, why, how long it is kept and how you stay in control. No sign-up; tickets and dabs are erased after 24 hours, and game summaries, IP addresses and usage records after 90 days.',
  alternates: { canonical: '/privacy' },
};

const SUMMARY =
  'There is nothing to sign up for. We keep the name you type, a random code that remembers your device, and the game itself. To run the site, stop misuse and understand how it is used, we also record your IP address and the approximate place it points to (city, region and country — not GPS), your browser and device details, how you arrived, and what you do on the site. Tickets and dabs are erased 24 hours after a game’s last activity; everything else is kept for up to 90 days and then deleted. Only the person who runs the site can see it. We never sell your data and we never handle money.';

const SECTIONS: LegalSection[] = [
  {
    id: 'intro',
    title: 'Our approach',
    paras: [
      'This Privacy Policy explains what personal data Letsplaytambola collects, why, and the choices you have. We follow India’s Digital Personal Data Protection Act, 2023 (the DPDP Act) and collect only what we need to run a fun, fair game.',
      'You do not need to register, give a phone number or an email address, or create a password to host or play.',
    ],
  },
  {
    id: 'collect',
    title: 'What we collect',
    bullets: [
      'The name you type. Hosts and players type a name to host or join a game. It is shown only to the people in that game.',
      'A device token. When you first use the site, your browser creates a long random code and keeps it on your device. It tells the game “this is the host” or “this is Meera’s ticket” when you come back or refresh. It does not contain your name, number or anything else about you. Our servers keep only a scrambled (hashed) copy of it.',
      'Game data. The game’s name, the optional ticket price the host notes, the ways to win, each player’s ticket and dabs, the numbers called and who won what.',
      'A phone number, only if you ask for the app launch message. If you type your mobile number in “Notify me”, we keep that number.',
      'Your IP address and approximate location. Every request your browser makes carries an IP address (the address of your internet connection). We record it, together with the city, region and country it points to. This is worked out from the IP address by our hosting provider; it is approximate, it can be wrong, and it is never your GPS position or your home address.',
      'Browser and device details. The type of device (phone, tablet or computer), its operating system and browser, whether the link was opened inside another app such as WhatsApp, your browser’s language, screen and window size, time zone, the kind of connection your browser reports, and whether you have added the site to your home screen.',
      'How you arrived. The website that sent you to us, if any (its name only, not the page), any campaign tags in the link you opened, and the first page you saw.',
      'What you do on the site. Which pages you open and when, taps on the main buttons (for example “Host a game”, “Join game”, “Share on WhatsApp”, “Copy link”, sound on or off), the steps of setting up or joining a game, the claims you make and whether they were valid, the kind of message the site showed you, and roughly how long you stayed. We do not record what you type, other than the name described above, and we never record the numbers on your ticket or your dabs for this purpose.',
      'Technical logs. Like every website, our hosting providers also process your IP address, browser type and the time of each request to deliver the pages.',
    ],
  },
  {
    id: 'use',
    title: 'How we use it',
    bullets: [
      'To run your game live: deal tickets, show the shared board, call numbers, check claims and show the winners.',
      'To bring you back to your own ticket, or your host controls, when you reopen the link on the same device.',
      'To send one WhatsApp message when the app launches — only to numbers given in “Notify me”.',
      'To keep the service secure, prevent misuse and fix problems — for example to limit how fast one device or one internet connection can send requests.',
      'To understand how the service is used and improve it: how many people visit and from which cities and states, which devices and browsers they use, where they arrive from, how far they get when hosting or joining a game, how many games are played and which ways to win are popular.',
      'These records are kept per device, not per person: we do not know who you are, and we do not combine them with information from anywhere else.',
      ADS_ON
        ? 'We never sell your personal data, and we do not give these records to advertisers. Ads on the site are explained under “Advertising”.'
        : 'We do not show ads, and we never sell your personal data.',
    ],
  },
  {
    id: 'share',
    title: 'Who can see your data',
    paras: [
      'People in your game see your name, the list of players, the numbers called and the prizes you win. Your ticket and your dabs are sent only to your own device — other players and the host cannot see them.',
      'Anyone who has a game’s link or code can open its invite page and see the host’s name, the game’s name and how many people have joined. Share the link only with people you want in the game.',
    ],
    bullets: [
      'The site’s operator (the person who runs Letsplaytambola) can see the summary of each game described in “How long we keep it”, the “Notify me” numbers, and — for each device — the IP address, approximate location, browser and device details, how it arrived and what it did on the site. Nobody else can: none of this is ever shown to other players or the host, and it is not part of any page of the site. The operator cannot see your ticket or your dabs.',
      'Vercel hosts the website and its servers, and works out the approximate location from the IP address.',
      'Supabase stores game data and “Notify me” numbers, and delivers the live updates during a game.',
      'These providers work for us under their own data-protection terms and may process data on servers outside India.',
      'Authorities, only when the law requires it.',
    ],
  },
  {
    id: 'storage',
    title: 'Cookies and browser storage',
    paras: [
      ADS_ON
        ? 'We set no cookies for the game or for our own usage records. The site keeps a few small items in your browser’s storage so the game works without any registration:'
        : 'We set no cookies, and we use no outside analytics or advertising service: the usage records described above are collected by our own servers only. The site keeps a few small items in your browser’s storage so the game works without any registration:',
    ],
    bullets: [
      'Your device token (see “What we collect”).',
      'The last name you typed, so you do not have to type it again next time.',
      'Your sound on/off choice for the voice caller.',
      'A random code for the current visit, kept only until you close the tab. It lets us count the pages and taps of one visit together.',
    ],
  },
  ...(ADS_ON
    ? [
        {
          id: 'ads',
          title: 'Advertising',
          paras: [
            'To keep the game free we show ads from Google AdSense in two places: the waiting room before a game starts and the results screen after it ends. We never show ads while a game is being played.',
            'Google and its partners may use cookies or similar identifiers in your browser to show and measure ads, including ads based on your earlier visits to this and other websites. We do not give Google the name you type, your ticket or anything about your game.',
            'You can switch off personalised ads in Google’s Ads Settings (adssettings.google.com), and read how Google uses information from sites that use its services at policies.google.com/technologies/partner-sites.',
          ],
        } satisfies LegalSection,
      ]
    : []),
  {
    id: 'whatsapp',
    title: 'WhatsApp, sharing and the voice caller',
    paras: [
      'When you tap “Share on WhatsApp”, we open WhatsApp on your phone with a ready message and the game link. You choose who to send it to, and it is sent by you under WhatsApp’s own terms. We cannot read your chats or see your contacts.',
      'The voice caller uses the speech feature built into your phone or browser. We do not record or listen to any sound.',
    ],
  },
  {
    id: 'retention',
    title: 'How long we keep it',
    bullets: [
      'A game, its link and its code stop working 24 hours after the last activity in the game.',
      'Tickets and dabs are erased from our servers at that point — 24 hours after the game’s last activity.',
      'A summary of each game is kept for up to 90 days after its last activity, and then deleted: the game’s name, the names people typed, the numbers called, who won what, the ticket price the host noted, and the times these things happened. With it we keep an anonymous device identifier — a scrambled copy of the device token — so that we can count how many different devices play. It does not contain your name, number or anything else about you.',
      'Your IP address, the approximate location, your browser and device details, how you arrived and the record of what you did on the site are kept for up to 90 days after we last saw your device, and then deleted.',
      'All of this is used only to run the service, prevent misuse and understand how it is used, and only the site’s operator can see it.',
      '“Notify me” phone numbers are kept until we have sent the launch message, or until you ask us to remove yours, whichever comes first.',
      'The items in your browser stay on your device until you clear your browser’s site data.',
      'Technical logs are kept by our hosting providers for a short period, as set by them.',
    ],
  },
  {
    id: 'rights',
    title: 'Your rights and choices',
    paras: ['Under the DPDP Act you can ask us what personal data we hold about you, ask us to correct it or erase it, and withdraw your consent at any time. In practice:'],
    bullets: [
      'To change your name, simply join the next game with a different one.',
      'To remove what is saved on your device, clear this site’s data in your browser settings. After that the site will not recognise your device, so you may not be able to return to a game that is still running.',
      'To remove your number from the “Notify me” list, write to {email} from any email address and tell us the number. We will delete it promptly.',
      'To have the records about your device erased before the 90 days are up, write to {email}. Because we do not know who you are, please tell us the game code and the name you used so we can find your device. We will then delete its IP addresses, location, browser and device details and usage records, and replace your name with “Erased player” in the game summaries we keep.',
      'To ask about or correct anything else, write to {email}.',
      'You may nominate someone to use these rights for you in case of death or incapacity, as allowed by Indian law.',
      'If you are unhappy with our answer, you can complain to our Grievance Officer (below) and, after that, to the Data Protection Board of India.',
    ],
  },
  {
    id: 'children',
    title: 'Children',
    paras: [
      'Tambola is a family game and children often play along. A person under 18 should host or join a game only with the permission and supervision of a parent or guardian, who should type the child’s name for them (a first name or nickname is enough).',
      ADS_ON
        ? 'We do not knowingly collect phone numbers from children. The usage records described in this policy are kept in the same way for every device — we do not know anyone’s age. If you believe a child has given us a phone number, or you want a child’s device erased from our records, write to us and we will delete it.'
        : 'We do not knowingly collect phone numbers from children, and we do not show ads to anyone. The usage records described in this policy are kept in the same way for every device — we do not know anyone’s age. If you believe a child has given us a phone number, or you want a child’s device erased from our records, write to us and we will delete it.',
    ],
  },
  {
    id: 'security',
    title: 'Security',
    paras: [
      'Data travels over an encrypted (HTTPS) connection. Game data can be read and changed only through our own servers, which check every action — for example, that only the host can call numbers and that your ticket is sent only to your device. No system is perfect, so please tell us if anything looks wrong.',
    ],
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    paras: ['We will update this page when our practices change and show the new date at the top.'],
  },
  {
    id: 'contact',
    title: 'Contact & Grievance Officer',
    paras: [
      'Questions, requests or complaints about your data: write to {email}.',
      'Grievance Officer: Letsplaytambola, India — {email}. We acknowledge complaints within 48 hours and aim to resolve them within 30 days.',
    ],
  },
];

export default function PrivacyPage() {
  return <LegalPage title="Privacy Policy" intro="What we collect, why we collect it, and how you stay in control." summary={SUMMARY} sections={SECTIONS} />;
}
