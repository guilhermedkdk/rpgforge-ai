import type { ElementType } from 'react';

/**
 * What the sign-in dialog passes to the shared login/register forms.
 *
 * These are the SAME forms the `/auth` pages render, so there stays exactly one implementation of
 * the auth error mapping, the validation and the provider buttons. Every prop here is absent on the
 * pages, where the defaults reproduce the original behaviour.
 */
export interface EmbeddedAuthFormProps {
  /** Replaces the page copy, so the dialog can say why it appeared. */
  description?: string;
  /** Authenticate without navigating, then hand control back to the dialog. */
  onAuthenticated?: () => void;
  /** Swap panes in place instead of linking to the other auth page. */
  onSwitchMode?: () => void;
  /** Where the provider round trip should land. The pages read this from the URL instead. */
  redirectTo?: string;
  /** Last call before the browser leaves for the provider. */
  onBeforeStart?: () => void;
  /**
   * Failure to show on open, already resolved to a message.
   *
   * The pages read theirs from the query string. The dialog cannot: the gate strips the query before
   * opening it, so that a reload does not resurrect an error the person already read.
   */
  initialError?: string | null;
  titleAs?: ElementType;
  descriptionAs?: ElementType;
}
