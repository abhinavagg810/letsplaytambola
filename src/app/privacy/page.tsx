// ⚠ DRAFT LEGAL TEXT — NOT REVIEWED BY A LAWYER.
// Written for v2 (no accounts) from the product facts in docs/design_handoff/README.md and docs/BUILD_NOTES.md.
// Have a qualified lawyer review it before launch, and replace the placeholders:
//   • the contact email (CONTACT_EMAIL_PLACEHOLDER in src/features/website/legal.ts)
//   • the Grievance Officer's name and postal address (section "contact")
//   • the legal name of the business that runs the site
// If the product changes (analytics, ads, new data, longer storage), this page must change with it.
// "{email}" in the text is replaced by a mail link.
import type { Metadata } from 'next';
import { LegalPage } from '@/features/website/LegalPage';
import type { LegalSection } from '@/features/website/legal';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'What Letsplaytambola collects, why, how long it is kept and how you stay in control. No sign-up, and game data is deleted after 24 hours.',
  alternates: { canonical: '/privacy' },
  openGraph: { title: 'Privacy Policy — Letsplaytambola', url: '/privacy' },
};

const SUMMARY =
  'There is nothing to sign up for. We keep the name you type, a random code that remembers your device, and the game itself — and we delete games 24 hours after the last activity. We never sell your data and we never handle money.';

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
      'Basic technical data. Like every website, our hosting providers process your IP address, browser type and the time of each request to deliver the pages, keep the service secure and limit abuse.',
    ],
  },
  {
    id: 'use',
    title: 'How we use it',
    bullets: [
      'To run your game live: deal tickets, show the shared board, call numbers, check claims and show the winners.',
      'To bring you back to your own ticket, or your host controls, when you reopen the link on the same device.',
      'To send one WhatsApp message when the app launches — only to numbers given in “Notify me”.',
      'To keep the service secure, prevent misuse and fix problems.',
      'We do not show ads, we do not build profiles of you, and we never sell your personal data.',
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
      'Vercel hosts the website and its servers.',
      'Supabase stores game data and “Notify me” numbers, and delivers the live updates during a game.',
      'These providers work for us under their own data-protection terms and may process data on servers outside India.',
      'Authorities, only when the law requires it.',
    ],
  },
  {
    id: 'storage',
    title: 'Cookies and browser storage',
    paras: [
      'We do not use advertising or tracking cookies. The site keeps a few small items in your browser’s local storage so the game works without any registration:',
    ],
    bullets: [
      'Your device token (see “What we collect”).',
      'The last name you typed, so you do not have to type it again next time.',
      'Your sound on/off choice for the voice caller.',
    ],
  },
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
      'Games — including names, tickets, dabs, called numbers and winners — stop working and are deleted from our servers 24 hours after the last activity in the game.',
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
      'To ask about, correct or erase anything else, write to {email}. Because we do not know who you are, we may ask for the game code and the name you used.',
      'You may nominate someone to use these rights for you in case of death or incapacity, as allowed by Indian law.',
      'If you are unhappy with our answer, you can complain to our Grievance Officer (below) and, after that, to the Data Protection Board of India.',
    ],
  },
  {
    id: 'children',
    title: 'Children',
    paras: [
      'Tambola is a family game and children often play along. A person under 18 should host or join a game only with the permission and supervision of a parent or guardian, who should type the child’s name for them (a first name or nickname is enough).',
      'We do not knowingly collect phone numbers from children, we do not track children and we do not show ads to anyone. If you believe a child has given us a phone number, write to us and we will delete it.',
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
