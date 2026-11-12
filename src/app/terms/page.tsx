// ⚠ DRAFT LEGAL TEXT — NOT REVIEWED BY A LAWYER.
// Written for v2 (no accounts) from the product facts in docs/design_handoff/README.md and docs/BUILD_NOTES.md.
// Have a qualified lawyer review it before launch, and replace the placeholders:
//   • the contact email (CONTACT_EMAIL_PLACEHOLDER in src/features/website/legal.ts)
//   • the legal name of the business that runs the site (section "about")
//   • the city whose courts have jurisdiction (section "law")
// "{email}" in the text is replaced by a mail link.
import type { Metadata } from 'next';
import { LegalPage } from '@/features/website/LegalPage';
import type { LegalSection } from '@/features/website/legal';

export const metadata: Metadata = {
  title: 'Terms of Use',
  description: 'The rules for using Letsplaytambola, in plain words: a free Tambola game for fun, with no sign-up and no real-money play.',
  alternates: { canonical: '/terms' },
  openGraph: { title: 'Terms of Use — Letsplaytambola', url: '/terms' },
};

const SUMMARY =
  'Letsplaytambola is a free game for fun with people you know. There is nothing to sign up for, the app never handles money, every number is random, and everyone is expected to play fair and kind.';

const SECTIONS: LegalSection[] = [
  {
    id: 'about',
    title: 'About these terms',
    paras: [
      'These Terms of Use (“Terms”) cover your use of the Letsplaytambola website (the “Service”). By hosting a game, joining a game or otherwise using the Service, you agree to these Terms. If you do not agree, please do not use the Service.',
      'The Service is run from India by the Letsplaytambola team (“we”, “us”). “You” means any host, player or visitor.',
    ],
  },
  {
    id: 'service',
    title: 'What the Service is',
    paras: [
      'Letsplaytambola is a free social game for hosting and playing Tambola (Housie) with people you know. It deals tickets, calls numbers with a voice caller, shows a shared live board to everyone in the game, checks claims and shows the winners.',
    ],
    bullets: [
      'The Service is for entertainment and social use only.',
      'Every number is drawn at random on our servers. Neither the host nor we can choose which number is called.',
      'We may add, change or remove features at any time.',
    ],
  },
  {
    id: 'no-money',
    title: 'No real-money play',
    paras: [
      'The Service does not accept, hold, transfer or pay out money, and it is not a gambling, betting or wagering service. We do not offer cash prizes, coins or rewards of any monetary value.',
      'A host may note a “ticket price” for their game. It is shown for information only — nothing is collected through the Service. Any money or gifts exchanged between the people in a game happen entirely outside the Service, at their own choice and responsibility, and in line with the laws that apply to them. We are not a party to any such arrangement.',
    ],
  },
  {
    id: 'eligibility',
    title: 'Who can use it',
    paras: [
      'You must be 18 or older to host a game. Younger players may join only with the permission and supervision of a parent or guardian, who accepts these Terms on their behalf.',
    ],
  },
  {
    id: 'no-signup',
    title: 'No sign-up: your name and your device',
    bullets: [
      'There is nothing to register and no password. You type a name, and the site remembers your device with a random code kept in your browser.',
      'Your host controls or your ticket live on the device and browser you used. If you clear your browser data, use private browsing or switch to another device, we cannot give them back to you.',
      'Anyone using your device and browser can act as you in that game, so keep your phone to yourself while you play.',
      'Use a name that is not offensive or misleading and does not pretend to be someone else.',
    ],
  },
  {
    id: 'hosting',
    title: 'Hosting and inviting',
    paras: ['Hosts run their own games: the game’s name, the ways to win, the optional ticket price, when numbers are called and when a new round starts.'],
    bullets: [
      'Anyone who has the game link or code can join, so share it only with people you want in the game.',
      'Invites are sent by you, from your own WhatsApp or by reading out the code. Only invite people who would expect to hear from you, and do not use the Service to send spam.',
      'Claims are checked automatically against the numbers called and the player’s dabs. The Service’s check is final for the purpose of the game.',
    ],
  },
  {
    id: 'fair-play',
    title: 'Fair play & community guidelines',
    paras: ['Every game should feel like a friendly evening together. Please do not:'],
    bullets: [
      'Cheat, use bots or automated tools, or try to predict or interfere with the number draw.',
      'Exploit bugs, or try to see other people’s tickets or data, or to act as the host of a game that is not yours.',
      'Use player names or game names that are abusive, hateful, sexual, threatening or unlawful.',
      'Use the Service to run any commercial gambling, lottery or paid prize scheme.',
      'Overload the Service, or copy, reverse-engineer or resell it.',
    ],
  },
  {
    id: 'content',
    title: 'Our content and yours',
    paras: [
      'The Letsplaytambola name, logo, designs, number callouts and software belong to us or our licensors. You may not use them except to use the Service as intended.',
      'The names you type remain yours. You allow us to store them and show them to the people in your game, only to run the Service.',
    ],
  },
  {
    id: 'availability',
    title: 'Availability and game expiry',
    paras: [
      'A game, its link and its code stop working 24 hours after the last activity, and the game’s data is then deleted. We do not keep a history of past games.',
      'We work hard to keep games running smoothly, but the Service is provided “as is” and “as available”. Games may occasionally be interrupted by network issues, maintenance or events outside our control, and we are not responsible for games or results lost as a result.',
    ],
  },
  {
    id: 'liability',
    title: 'Limitation of liability',
    paras: [
      'To the extent permitted by law, we are not liable for indirect or consequential loss, or for any loss arising from arrangements between the people in a game, including money or gifts exchanged outside the Service. Nothing here limits liability that cannot be limited under law.',
    ],
  },
  {
    id: 'ending',
    title: 'Ending games and blocking misuse',
    paras: ['We may end games or block access for anyone who breaks these Terms or puts others at risk. You may stop using the Service at any time.'],
  },
  {
    id: 'law',
    title: 'Governing law and disputes',
    paras: [
      'These Terms are governed by the laws of India, and the courts of India have jurisdiction, subject to your rights under consumer protection law. Please contact us first — most issues are sorted out quickly.',
    ],
  },
  {
    id: 'changes-terms',
    title: 'Changes to these Terms',
    paras: ['We may update these Terms. We will show the new date at the top of this page. Continuing to use the Service means you accept the updated Terms.'],
  },
  {
    id: 'contact-terms',
    title: 'Contact',
    paras: ['Questions? Write to {email}. For complaints about your data, see the Grievance Officer details in our Privacy Policy.'],
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Use"
      intro="The rules for using Letsplaytambola — written in plain words so every player can understand them."
      summary={SUMMARY}
      sections={SECTIONS}
    />
  );
}
