const nodemailer = require('nodemailer');
const axios = require('axios');

async function sendSMS(to, message) {
  try {
    const apiKey = process.env.FAST2SMS_API_KEY;
    if (!apiKey || apiKey.includes('your_key')) {
      console.log(`[SMS MOCK] To: ${to}\n${message}`);
      return { success: true, mock: true };
    }
    const phone = to.replace(/^\+91|^91/, '').replace(/\D/g, '').slice(-10);
    console.log(`[SMS SENDING] To: ${phone}`);
    const response = await axios.post(
      'https://www.fast2sms.com/dev/bulkV2',
      {
        route: 'v3',
        message: message,
        language: 'english',
        flash: 0,
        numbers: phone
      },
      {
        headers: {
          authorization: apiKey,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(`[SMS RESULT]`, JSON.stringify(response.data));
    return { success: true, data: response.data };
  } catch (err) {
    console.error('[SMS ERROR]', err.response?.data || err.message);
    return { success: false, error: err.message };
  }
}

async function sendEmail(to, subject, html) {
  try {
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;
    if (!user || user.includes('your@gmail')) {
      console.log(`[EMAIL MOCK] To: ${to}`);
      return { success: true, mock: true };
    }
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass }
    });
    const info = await transporter.sendMail({
      from: `"NovaCRM" <${user}>`,
      to, subject, html
    });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error('[EMAIL ERROR]', err.message);
    return { success: false, error: err.message };
  }
}

async function sendReminderNotifications(reminder) {
  const results = { customer: {}, admin: {} };
  const date = new Date(reminder.dueDate).toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
  const time = reminder.dueTime || '09:00';

  if (reminder.leadPhone) {
    results.customer.sms = await sendSMS(
      reminder.leadPhone,
      `Hi ${reminder.leadName || 'there'}! Meeting reminder: ${reminder.title} on ${date} at ${time}. - NovaCRM`
    );
  }

  if (reminder.leadEmail) {
    results.customer.email = await sendEmail(
      reminder.leadEmail,
      `Meeting Reminder: ${reminder.title}`,
      `<div style="font-family:sans-serif;padding:20px">
        <h2 style="color:#00C9A7">Meeting Reminder</h2>
        <p>Hi <strong>${reminder.leadName}</strong>,</p>
        <p><strong>${reminder.title}</strong></p>
        <p>Date: ${date} at ${time}</p>
        <p>- NovaCRM Team</p>
      </div>`
    );
  }

  if (process.env.ADMIN_PHONE) {
    results.admin.sms = await sendSMS(
      process.env.ADMIN_PHONE,
      `NovaCRM Reminder: ${reminder.title} | Lead: ${reminder.leadName || 'Unknown'} | ${date} at ${time}`
    );
  }

  return results;
}

async function sendWelcomeSMS(lead) {
  if (!lead.phone) return { skipped: true };
  return await sendSMS(
    lead.phone,
    `Hi ${lead.name.split(' ')[0]}! Thanks for connecting with us. We will be in touch soon! - NovaCRM`
  );
}

module.exports = { sendSMS, sendEmail, sendReminderNotifications, sendWelcomeSMS };
