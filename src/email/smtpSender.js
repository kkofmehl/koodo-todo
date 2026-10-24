const nodemailer = require('nodemailer');
const config = require('../config');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createSmtpSender(smtpConfig = config) {
  const configured = Boolean(
    smtpConfig.SMTP_HOST &&
    smtpConfig.SMTP_USER &&
    smtpConfig.SMTP_PASS &&
    smtpConfig.EMAIL_FROM &&
    smtpConfig.APP_URL
  );

  let transporter = null;
  if (configured) {
    transporter = nodemailer.createTransport({
      host: smtpConfig.SMTP_HOST,
      port: smtpConfig.SMTP_PORT,
      secure: smtpConfig.SMTP_SECURE,
      auth: {
        user: smtpConfig.SMTP_USER,
        pass: smtpConfig.SMTP_PASS,
      },
    });
  }

  async function sendMail({ to, subject, text, html }) {
    if (!configured || !transporter) {
      return { sent: false, reason: 'not_configured' };
    }
    if (!to) {
      return { sent: false, reason: 'no_recipient' };
    }

    await transporter.sendMail({
      from: smtpConfig.EMAIL_FROM,
      to,
      subject,
      text,
      html,
    });

    return { sent: true };
  }

  return {
    isConfigured: () => configured,
    sendMail,
    escapeHtml,
  };
}

module.exports = { createSmtpSender, escapeHtml };
