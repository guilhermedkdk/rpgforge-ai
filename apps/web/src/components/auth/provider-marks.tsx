import type { OAuthProviderId } from '@rpgforce-ai/shared';

/**
 * Google's four-colour mark.
 *
 * Inlined rather than fetched so the button never flashes without it, and kept in Google's own
 * colours because their sign-in branding guidelines require the mark to be reproduced unaltered.
 */
const GoogleMark = () => (
  <svg viewBox="0 0 18 18" className="size-4" aria-hidden="true" focusable="false">
    <path
      fill="#4285F4"
      d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
    />
    <path
      fill="#34A853"
      d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
    />
    <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
    <path
      fill="#EA4335"
      d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
    />
  </svg>
);

/** Discord's "Clyde" mark, in their brand blurple. Their guidelines require it unaltered. */
const DiscordMark = () => (
  <svg viewBox="0 0 24 18" className="size-4" aria-hidden="true" focusable="false">
    <path
      fill="#5865F2"
      d="M20.32 1.51A19.8 19.8 0 0 0 15.43 0a13.9 13.9 0 0 0-.63 1.28 18.4 18.4 0 0 0-5.49 0A13.6 13.6 0 0 0 8.68 0 19.7 19.7 0 0 0 3.79 1.52C.69 6.13-.15 10.62.27 15.05a19.9 19.9 0 0 0 6 3.03c.49-.66.92-1.36 1.29-2.09a12.9 12.9 0 0 1-2.03-.97c.17-.12.34-.25.5-.38a14.2 14.2 0 0 0 12.06 0c.16.14.33.26.5.38-.65.38-1.33.71-2.04.98.37.73.8 1.42 1.29 2.08a19.8 19.8 0 0 0 6.01-3.03c.5-5.13-.85-9.58-3.53-13.54ZM8.02 12.33c-1.18 0-2.15-1.07-2.15-2.39s.95-2.4 2.15-2.4 2.17 1.08 2.15 2.4c0 1.32-.95 2.39-2.15 2.39Zm7.94 0c-1.18 0-2.15-1.07-2.15-2.39s.95-2.4 2.15-2.4 2.17 1.08 2.15 2.4c0 1.32-.95 2.39-2.15 2.39Z"
    />
  </svg>
);

const MARKS: Record<OAuthProviderId, () => React.ReactElement> = {
  google: GoogleMark,
  discord: DiscordMark,
};

/** The provider's logo. A missing entry is a compile error, never a blank button. */
export const ProviderMark = ({ provider }: { provider: OAuthProviderId }) => {
  const Mark = MARKS[provider];
  return <Mark />;
};
