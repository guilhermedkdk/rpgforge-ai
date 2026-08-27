import { isAxiosError } from 'axios';

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
