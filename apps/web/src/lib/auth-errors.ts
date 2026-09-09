import { isAxiosError } from 'axios';
import {
  isOAuthErrorCode,
  isOAuthProviderId,
  OAUTH_PROVIDER_LABELS,
  type OAuthErrorCode,
  type OAuthProviderId,
} from '@rpgforce-ai/shared';

/** The query the API appends to report a failed provider round trip. */
const OAUTH_ERROR_PARAMS = ['error', 'provider'] as const;

/**
 * The current query string without the failure report.
 *
 * Needed in two places for one reason: the report must never be carried forward. As a redirect
 * target it would come back in the URL after a SUCCESSFUL sign-in, where nothing clears it any more
 * (the gate ignores a signed-in user), and it would then fire at the end of the session, on logout,
 * as an error about a cancellation the person already dealt with.
 */
export const withoutOAuthErrorParams = (search: string): string => {
  const params = new URLSearchParams(search);
  for (const key of OAUTH_ERROR_PARAMS) params.delete(key);
  const query = params.toString();
  return query ? `?${query}` : '';
};

/** Inputs an auth submit error can point at. */
export type AuthFormField = 'email' | 'password' | 'confirmPassword';

/** A submit failure resolved into what the form should show. */
export interface AuthFormErrorInfo {
  /** Kept short: it replaces the card subtitle, which must stay on one line. */
  message: string;
  /** Inputs flagged invalid. Empty when the server cannot say which one is wrong. */
  fields: AuthFormField[];
  /** Input that takes focus, so the correction starts where it is most likely needed. */
  focus?: AuthFormField;
}

const readMessages = (error: unknown): string[] => {
  if (!isAxiosError(error)) return [];
  const message = (error.response?.data as { message?: unknown } | undefined)?.message;
  if (Array.isArray(message)) return message.map(String);
  return typeof message === 'string' ? [message] : [];
};

// class-validator prefixes every message with the property name
const fieldsFromMessages = (messages: string[]): AuthFormField[] => {
  const fields: AuthFormField[] = [];
  if (messages.some((message) => /^email/i.test(message))) fields.push('email');
  if (messages.some((message) => /^password/i.test(message))) fields.push('password');
  return fields;
};

const validationMessage = (messages: string[]): string => {
  for (const message of messages) {
    if (/email must be an email/i.test(message)) return 'Email inválido';
    const minLength = message.match(/password must be longer than or equal to (\d+)/i);
    if (minLength) return `A senha precisa de ao menos ${minLength[1]} caracteres`;
  }
  return 'Dados inválidos';
};

// Failures that say nothing about the credentials: same copy on both forms
const resolveTransportError = (error: unknown): AuthFormErrorInfo | null => {
  if (!isAxiosError(error)) return null;

  if (!error.response) return { message: 'Sem conexão com o servidor', fields: [] };

  const { status } = error.response;

  if (status === 429) return { message: 'Muitas tentativas. Aguarde um instante.', fields: [] };
  if (status >= 500) return { message: 'Servidor indisponível. Tente de novo.', fields: [] };

  return null;
};

const resolveValidationError = (error: unknown): AuthFormErrorInfo => {
  const messages = readMessages(error);
  const fields = fieldsFromMessages(messages);
  return { message: validationMessage(messages), fields, focus: fields[0] };
};

/** Maps a failed `POST /auth/login` to the subtitle message + flagged fields. */
export const resolveLoginError = (error: unknown): AuthFormErrorInfo => {
  const transport = resolveTransportError(error);
  if (transport) return transport;

  const status = isAxiosError(error) ? error.response?.status : undefined;

  if (status === 401) {
    if (readMessages(error).includes(PASSWORD_SIGNIN_UNAVAILABLE)) {
      return {
        message: providerSigninMessage(readProviders(error)),
        fields: [],
        focus: 'password',
      };
    }
    // The API cannot say which one is wrong, so flagging either input would be a guess
    return { message: 'Email ou senha incorretos', fields: [], focus: 'password' };
  }

  if (status === 400) return resolveValidationError(error);

  return { message: 'Não foi possível entrar. Tente de novo.', fields: [] };
};

/** Maps a failed `POST /auth/register` to the subtitle message + flagged fields. */
export const resolveRegisterError = (error: unknown): AuthFormErrorInfo => {
  const transport = resolveTransportError(error);
  if (transport) return transport;

  const status = isAxiosError(error) ? error.response?.status : undefined;

  if (status === 409) {
    return { message: 'Este email já está cadastrado', fields: ['email'], focus: 'email' };
  }

  if (status === 400) return resolveValidationError(error);

  return { message: 'Não foi possível criar a conta. Tente de novo.', fields: [] };
};

/** The API's answer when the address is registered but has no password. */
const PASSWORD_SIGNIN_UNAVAILABLE = 'PASSWORD_SIGNIN_UNAVAILABLE';

/** The providers that DO work, which the 401 carries alongside the message. */
const readProviders = (error: unknown): OAuthProviderId[] => {
  if (!isAxiosError(error)) return [];
  const raw = (error.response?.data as { providers?: unknown } | undefined)?.providers;
  return Array.isArray(raw) ? raw.filter(isOAuthProviderId) : [];
};

/**
 * Names the way in, because "essa conta não usa senha" leaves the person asking what to do instead.
 * The buttons are right above the form, so the message only has to point at the right one.
 */
const providerSigninMessage = (providers: OAuthProviderId[]): string => {
  const labels = providers.map((provider) => OAUTH_PROVIDER_LABELS[provider]);

  if (labels.length === 0) return 'Essa conta não usa senha';
  if (labels.length === 1) return `Essa conta entra pelo ${labels[0]}`;

  return `Essa conta entra pelo ${labels.slice(0, -1).join(', ')} ou ${labels[labels.length - 1]}`;
};

const OAUTH_ERROR_MESSAGES: Record<OAuthErrorCode, string> = {
  access_denied: 'Você cancelou a autorização',
  invalid_state: 'A sessão expirou. Tente de novo.',
  email_unverified: 'Confirme seu email no provedor antes de entrar',
  provider_error: 'O provedor não respondeu. Tente de novo.',
  already_linked: 'Essa conta já está vinculada a outro usuário',
  // Rewritten below with the provider's name, which is the only useful part of it.
  use_linked_provider: 'Essa conta entra por outro provedor',
};

/**
 * Copy for the `?error=` a failed callback lands on.
 *
 * Returns null for anything unrecognised rather than echoing it: the value comes off the URL, so
 * rendering it as given would put attacker-controlled text on the sign-in page.
 */
export const oauthErrorMessage = (
  code: string | null | undefined,
  provider?: string | null
): string | null => {
  if (!isOAuthErrorCode(code)) return null;

  // Naming the provider is the whole point of this one: "entre por outro" leaves them guessing.
  if (code === 'use_linked_provider' && isOAuthProviderId(provider)) {
    return `Essa conta entra pelo ${OAUTH_PROVIDER_LABELS[provider]}`;
  }

  return OAUTH_ERROR_MESSAGES[code];
};
