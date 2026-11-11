// DRAFT — NOT LEGAL ADVICE. Written to match what the app does; it MUST be reviewed by a lawyer before launch
// (see docs/RELEASE.md, section 12). Still to be supplied by the owner / lawyer: the legal name and address of
// whoever operates the app, the limits of liability and the courts that apply, the minimum age you want to set,
// whether Tambola played for stakes is lawful where you offer the app, and the effective date below.
// Do not show the word "draft" to end users.
import type { LegalDoc } from './LegalPage';

export const TERMS: LegalDoc = {
  eyebrow: 'Terms',
  title: 'Terms of use',
  updated: '11 November 2026',
  intro:
    'These are the rules for using Letsplaytambola, an app for hosting and playing Tambola (Housie) with family and friends. By signing in or joining a game you agree to them. If you do not agree, please do not use the app.',
  other: { label: 'Privacy policy', href: '/privacy' },
  sections: [
    {
      title: 'What the app is',
      body: [
        'Letsplaytambola lets a host set up a game, share a link, and call numbers while everyone marks their own ticket. It is meant for fun among people who know each other.',
        'The app is free to use.',
      ],
    },
    {
      title: 'No real-money gaming',
      body: [
        'The app never takes, holds or pays out money. It has no payments, no wallet and no purchases.',
        'A host may type in a ticket price and prize amounts. These are only notes, to help the group keep count. Whether any money changes hands, and how, is entirely between the players, outside the app. We are not part of it and cannot help settle it.',
        'You are responsible for making sure that how your group plays is allowed by the law where you live.',
      ],
    },
    {
      title: 'Your account',
      body: [{ points: [
        'Sign in with your own mobile number, or your own Google or Apple account.',
        'Use a name your friends will recognise. Do not pretend to be someone else.',
        'Keep your phone and your sign-in codes to yourself. You are responsible for what is done from your account.',
        'The app is not directed at children under 13. If you are under 18, use it only with a parent or guardian.',
        'You can delete your account at any time from Profile → “Delete my account”.',
      ] }],
    },
    {
      title: 'Playing fair and being kind',
      body: [
        'Please do not:',
        { points: [
          'Use rude, hateful or misleading names for yourself or your games.',
          'Harass other players or send invites to people who do not want them.',
          'Try to see other players’ tickets, cheat, or interfere with a game.',
          'Use robots or scripts, or try to break, overload or copy the service.',
          'Use the app for anything against the law.',
        ] },
        'The host runs their own game: who is invited, the prizes, and when numbers are called. Claims are checked by the app, and its check is final for that game.',
      ],
    },
    {
      title: 'Inviting people',
      body: [
        'If you invite people from your phone’s contacts, only invite people you know and who would be happy to hear from you. Invites are sent by you, from your own WhatsApp — the app never messages anyone for you. Our privacy policy explains what is stored when you do this.',
      ],
    },
    {
      title: 'Your content',
      body: [
        'Names, usernames, game names and group names you type in remain yours. You allow us to store and show them to the people you play with, so the app can work.',
        'We may remove a name or a game that breaks these terms.',
      ],
    },
    {
      title: 'If things go wrong',
      body: [
        'We work to keep the app running well, but we cannot promise it will always be available or free of mistakes. Connections drop, phones run out of battery, and games can be interrupted.',
        'The app is provided as it is. As far as the law allows, we are not responsible for losses that come from using it or from not being able to use it — including any money players agree to exchange between themselves.',
        'Nothing in these terms takes away rights the law gives you that cannot be removed by agreement.',
      ],
    },
    {
      title: 'Suspending or closing accounts',
      body: [
        'You can stop using the app and delete your account whenever you like.',
        'We may suspend or close an account that breaks these terms or puts other players or the service at risk. Where we reasonably can, we will tell you why.',
      ],
    },
    {
      title: 'Changes',
      body: [
        'We may improve or change the app, and update these terms from time to time. We will change the date at the top when we do. If you keep using the app after a change, you accept the new terms.',
      ],
    },
    {
      title: 'Law',
      body: [
        'These terms are governed by the laws of India.',
      ],
    },
  ],
};
