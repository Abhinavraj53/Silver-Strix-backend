const SibApiV3Sdk = require('sib-api-v3-sdk');
const FormData = require('form-data');
const Mailgun = require('mailgun.js');

// Configure Brevo (Sendinblue) transactional client once
let brevoClient = null;
if (process.env.BREVO_API_KEY) {
    const apiClient = SibApiV3Sdk.ApiClient.instance;
    apiClient.authentications['api-key'].apiKey = process.env.BREVO_API_KEY;
    brevoClient = new SibApiV3Sdk.TransactionalEmailsApi();
}

/**
 * Unified email sender.
 * Priority: Brevo (provided key) -> Mailgun (legacy fallback).
 */
const sendEmail = async ({ to, subject, html, from, provider = 'auto' }) => {
    if (!to || !subject || !html) {
        throw new Error('Missing to/subject/html for email');
    }

    const useBrevo = provider === 'auto' || provider === 'brevo';
    const useMailgun = provider === 'auto' || provider === 'mailgun';
    let brevoError = null;

    // Try Brevo first
    if (useBrevo && brevoClient) {
        try {
            const senderEmail = from || process.env.BREVO_SENDER_EMAIL || 'hello@silverstrix.com';
            const senderName = process.env.BREVO_SENDER_NAME || 'Silver Strix';

            await brevoClient.sendTransacEmail({
                sender: { email: senderEmail, name: senderName },
                to: [{ email: to }],
                subject,
                htmlContent: html
            });

            console.log(`✅ Email sent via Brevo to ${to}`);
            return true;
        } catch (error) {
            brevoError = error;
            console.error('❌ Brevo send error:', error.message || error);
            if (error.response?.text) console.error(error.response.text);
            if (provider === 'brevo') {
                throw error;
            }
            // Fall through to Mailgun fallback when allowed
        }
    } else if (provider === 'brevo') {
        throw new Error('Brevo is not configured. Set BREVO_API_KEY and sender details.');
    }

    // Fallback: Mailgun (requires MAILGUN_* envs)
    if (useMailgun && process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN) {
        try {
            const mailgun = new Mailgun(FormData);
            const mg = mailgun.client({
                username: 'api',
                key: process.env.MAILGUN_API_KEY,
                url: process.env.MAILGUN_BASE_URL || 'https://api.mailgun.net'
            });

            const fromEmail = from
                ? from
                : `"Silver Strix" <info@${process.env.MAILGUN_DOMAIN}>`;

            const data = await mg.messages.create(process.env.MAILGUN_DOMAIN, {
                from: fromEmail,
                to: [to],
                subject,
                html
            });

            console.log(`✅ Email sent via Mailgun to ${to}`, data.id || '');
            return true;
        } catch (error) {
            console.error('❌ Mailgun error:', error.message || error);
            throw error;
        }
    }

    if (brevoError) {
        throw brevoError;
    }

    throw new Error('No email provider configured (missing BREVO_API_KEY and MAILGUN_API_KEY)');
};

module.exports = { sendEmail };
