const cron = require('node-cron');

function startCronJobs() {
  console.log('[CRON] Reminder scheduler started');

  cron.schedule('*/15 * * * *', async () => {
    try {
      const Reminder = require('../models/Reminder');
      const { sendReminderNotifications } = require('./notificationService');
      const now = new Date();
      const in30 = new Date(now.getTime() + 30 * 60 * 1000);
      const in15 = new Date(now.getTime() + 15 * 60 * 1000);

      const upcoming = await Reminder.find({
        done: false,
        dueDate: { $gte: in15, $lte: in30 },
        notificationSentAt: null
      });

      for (const reminder of upcoming) {
        await sendReminderNotifications(reminder);
        reminder.notificationSentAt = new Date();
        await reminder.save();
        console.log(`[CRON] Notified: ${reminder.title}`);
      }
    } catch (err) {
      console.error('[CRON ERROR]', err.message);
    }
  });
}

module.exports = { startCronJobs };