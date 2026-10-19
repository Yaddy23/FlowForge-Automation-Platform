import { registerAction, type ActionHandler } from './registry';
import { sendMail } from '../services/mailer';

/**
 * action.email — sends an email via SMTP. Config arrives template-resolved
 * (the engine pre-resolves {{...}} against the run scope), so `to: '{{payload
 * .requesterEmail}}'` is already a concrete address here.
 */
const emailAction: ActionHandler = async (config) => {
  const to = String(config.to ?? '');
  const subject = String(config.subject ?? '');
  const body = config.body === undefined ? undefined : String(config.body);
  if (!to || !subject) {
    throw Object.assign(new Error('email requires "to" and "subject"'), { code: 'EMAIL_CONFIG' });
  }
  await sendMail({ to, subject, body });
  return { output: { sent: true, to, subject } };
};

export function registerEmailAction(): void {
  registerAction('action.email', emailAction);
}
