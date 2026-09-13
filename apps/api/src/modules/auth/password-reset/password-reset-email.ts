import type { MailMessage } from '../../../shared/mail/mail.service';

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The reset mail.
 *
 * Styles are inline and the markup is plain: mail clients drop a stylesheet, and Gmail strips most
 * of what a normal page would rely on. The link is repeated as text so a client that refuses to
 * render the anchor still leaves something to copy.
 */
export const buildPasswordResetEmail = (to: string, resetUrl: string): MailMessage => {
  const url = escapeHtml(resetUrl);

  return {
    to,
    subject: 'Redefinir sua senha do RPGForge AI',
    text: [
      'Alguém pediu para redefinir a senha desta conta no RPGForge AI.',
      '',
      'Abra o endereço abaixo para escolher uma nova senha:',
      resetUrl,
      '',
      'O link vale por 30 minutos e funciona uma única vez. Se você pediu mais de uma vez, só o link mais recente funciona.',
      '',
      'Se não foi você que pediu, ignore este email: sua senha continua a mesma.',
    ].join('\n'),
    html: [
      '<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#1f2937">',
      '<p>Alguém pediu para redefinir a senha desta conta no RPGForge AI.</p>',
      `<p><a href="${url}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:600">Escolher uma nova senha</a></p>`,
      `<p style="font-size:13px;color:#6b7280">Se o botão não funcionar, copie este endereço:<br><span style="word-break:break-all">${url}</span></p>`,
      '<p style="font-size:13px;color:#6b7280">O link vale por 30 minutos e funciona uma única vez. Se você pediu mais de uma vez, só o link mais recente funciona.</p>',
      '<p style="font-size:13px;color:#6b7280">Se não foi você que pediu, ignore este email: sua senha continua a mesma.</p>',
      '</div>',
    ].join(''),
  };
};
