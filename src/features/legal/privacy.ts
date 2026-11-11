// DRAFT — NOT LEGAL ADVICE. Written from what the code does (see the file references below); it MUST be reviewed by a
// lawyer before launch, and re-checked whenever the app's data handling changes. See docs/RELEASE.md, section 12.
// Still to be supplied by the owner / lawyer: the legal name and address of whoever operates the app, a named
// grievance contact (DPDP Act), the real contact mailbox (CONTACT_EMAIL in LegalPage.tsx is a placeholder), the
// SMS provider's name, how long the hosting provider keeps backups, and the effective date below.
// Do not show the word "draft" to end users.
//
// Where each statement comes from:
//   "servers in India" ................................ assumes the Supabase project is created in Mumbai, as supabase/README.md says
//   phone + code sign-in, Google/Apple, guests ........ src/backend/supabase.ts (auth)
//   hashed contact matching ............................ supabase.ts matchContacts + 0001_init.sql (phone_hash, match_contacts)
//   numbers stored only for contacts you invite ........ pending_invites, game_contacts (0001_init.sql)
//   tickets private to their owner ..................... tickets table + RLS (0001_init.sql)
//   no payments ........................................ docs/BUILD_NOTES.md hard rules; there is no payment code
//   no ads today ....................................... src/lib/ads.tsx renders nothing; docs/ADS.md
//   account deletion ................................... 0002_delete_account.sql, src/backend/local.ts (scrubGame)
import type { LegalDoc } from './LegalPage';

export const PRIVACY: LegalDoc = {
  eyebrow: 'Privacy',
  title: 'Privacy policy',
  updated: '11 November 2026',
  intro:
    'Letsplaytambola is an app for hosting and playing Tambola (Housie) with family and friends. This page explains, in plain words, what we know about you, why, and what you can do about it. The service is run from India.',
  other: { label: 'Terms of use', href: '/terms' },
  sections: [
    {
      title: 'The short version',
      body: [{ points: [
        'We ask for your mobile number so you can sign in and so friends can find you.',
        'Your phone’s contacts are only used if you choose to invite from them. They are scrambled on your phone before anything is checked with us.',
        'The app never takes, holds or pays out money.',
        'There are no ads in the app today.',
        'You can delete your account yourself, in the app, at any time.',
      ] }],
    },
    {
      title: 'What we collect',
      body: [
        { points: [
          'Your mobile number. We text you a one-time code to check it is yours. It is how you sign in.',
          'Your name and the username you pick. Other players see these, along with the colour of your initial.',
          'Your email address and name, only if you sign in with Google or Apple. We get them from Google or Apple. We do not get your password. Other players never see your email.',
          'If you join from an invite link as a guest: just the name you type.',
          'Your games: the games you hosted or joined, your tickets, the numbers you marked, prizes won, and any ticket price and prize amounts the host typed in.',
          'Your friends list, your groups, and the people you invited.',
        ] },
        'We do not ask for your location, photos, camera or microphone. The caller’s voice is made by your own phone.',
      ],
    },
    {
      title: 'Your phone’s contacts',
      body: [
        'The app only looks at your contacts if you tap to invite people from them and allow it. The app works fully without this.',
        'To show which of your contacts already play, your phone turns each number into a scrambled code (a one-way “hash”). Only these codes are sent to us, not the names or numbers. We compare them with the codes of people who have signed up and tell your phone which ones matched. We do not keep the codes you send.',
        'We store a contact’s name and number only when you choose to invite that person. We keep it so that you can send them the invite yourself on WhatsApp, and so the two of you become friends in the app when they join. Only you can see it.',
        'Nothing is ever sent to your contacts automatically. You press send yourself, in your own WhatsApp.',
        'If someone invites you this way, your name and number as saved in their phone are kept in their invite list until you join, or until they remove the invite or delete their account. You can also ask us to remove it.',
      ],
    },
    {
      title: 'What other players can see',
      body: [{ points: [
        'People in a game with you see your name, username, the prizes you claim and the reactions you send.',
        'Nobody else can see your ticket or which numbers you have marked — not even the host.',
        'Anyone with a game’s invite link can see the game’s name, the host’s name, the ticket price and how many seats are left.',
        'Someone who already has your mobile number saved in their phone can find out that you use the app, and see your name and username, when they invite from their contacts.',
        'Anyone signed in who knows your username can look you up by it and see your name.',
        'Other players never see your phone number or email in the app.',
      ] }],
    },
    {
      title: 'Money',
      body: [
        'The app does not process payments. A ticket price or prize amount is only a note typed in by the host, so the group can keep count. Any money is settled between you and your friends, outside the app. We never ask for card, bank or UPI details.',
      ],
    },
    {
      title: 'Ads',
      body: [
        'There are no ads in the app today, and we do not track you for advertising.',
        'We may add ads later, only on browsing screens such as Home and Results, never during a game. If we do, we will update this policy first and tell you what changes.',
      ],
    },
    {
      title: 'Why we use your information',
      body: [
        { points: [
          'To sign you in and keep your account safe.',
          'To run games: deal tickets, call numbers, check claims and show results.',
          'To help you and your friends find each other.',
          'To keep the history of your games.',
          'To fix problems and stop misuse.',
        ] },
        'We use your information because you ask us to provide the app and agree to this when you sign in. We do not sell your information, and we do not use it for anything else.',
      ],
    },
    {
      title: 'Where it is kept and who helps us',
      body: [
        'Your information is stored with Supabase, the company that provides our database and sign-in system, on servers in India. It is sent over an encrypted connection.',
        { points: [
          'A text-message company delivers your sign-in code. It receives your mobile number and the code.',
          'Google or Apple, if you choose to sign in with them.',
          'WhatsApp, when you choose to share an invite. The app opens WhatsApp with a message ready; you decide whether to send it.',
        ] },
        'These companies only handle your information to do these jobs for us. We may also share information if the law requires it.',
        'On your own device the app keeps a few things so it works: that you are signed in, and your settings such as caller voice and auto-dab. On the website this uses your browser’s storage. If you install the Android app from an invite link, Google Play tells the app which game the link was for, so it can open that game. We do not use advertising cookies.',
      ],
    },
    {
      title: 'How long we keep it',
      body: [
        'We keep your information for as long as you have an account. When you delete your account it is removed straight away, as described below. Copies in our hosting provider’s routine backups may take a short while longer to be overwritten.',
      ],
    },
    {
      title: 'Deleting your account',
      body: [
        'Open the app, go to Profile, and tap “Delete my account”. It happens straight away and cannot be undone.',
        { points: [
          'Removed: your profile, mobile number, email, username, friends, groups, the invites you saved, and your tickets.',
          'Games you were hosting that have not finished are removed.',
          'Finished games you played stay in your friends’ history so that their results still add up, but your name is replaced with “Deleted player”.',
        ] },
        'If you cannot use the app, write to us at the address below from your registered email, or tell us your mobile number, and we will delete the account for you.',
      ],
    },
    {
      title: 'Your rights',
      body: [
        'Under India’s Digital Personal Data Protection Act, 2023, you can:',
        { points: [
          'Ask what information we hold about you and what we do with it.',
          'Ask us to correct or update it.',
          'Ask us to erase it. You can do this yourself by deleting your account.',
          'Take back your consent at any time. You can refuse contacts access in your phone’s settings, or stop using the app and delete your account.',
          'Name another person who can use these rights for you if you die or are unable to.',
          'Complain to us and get an answer. If you are not satisfied with our answer, you can complain to the Data Protection Board of India.',
        ] },
        'To use any of these, write to us at the address below. We will reply as soon as we can.',
      ],
    },
    {
      title: 'Children',
      body: [
        'The app is made for adults and families playing together. It is not directed at children under 13, and we do not knowingly collect information from them. If you are under 18, please use the app only with a parent or guardian. If you believe a child has given us information, write to us and we will delete it.',
      ],
    },
    {
      title: 'Changes to this policy',
      body: [
        'If we change how we handle your information, we will update this page and change the date at the top before the change takes effect.',
      ],
    },
  ],
};
