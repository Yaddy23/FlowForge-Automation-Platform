import nodemailer from 'nodemailer';

export interface MailInput {
  to: string;
  subject: string;
  body?: string;
}

/**
 * SMTP mail sender. Configured via SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/
 * SMTP_FROM env vars (systemSettings-based config lands in Task 17). Without
 * SMTP_HOST the mail is logged instead of sent, so dev/test environments never
 * error on email nodes.
 */
type MailTransport = ReturnType<typeof nodemailer.createTransport>;

let transport: MailTransport | null = null;

function getTransport(): MailTransport | null {
  if (!process.env.SMTP_HOST) return null;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT ?? '587', 10) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
    });
  }
  return transport;
}

export async function sendMail(input: MailInput): Promise<void> {
  const tx = getTransport();
  if (!tx) {
    console.warn(`[mailer] SMTP_HOST not set — logged instead of sent: to=${input.to} subject="${input.subject}"`);
    return;
  }
  await tx.sendMail({
    from: process.env.SMTP_FROM ?? 'flowforge@localhost',
    to: input.to,
    subject: input.subject,
    text: input.body,
  });
}
