const express = require('express');
const router = express.Router();
const Reminder = require('../models/Reminder');
const Lead = require('../models/Lead');
const auth = require('../middleware/auth');
const { sendReminderNotifications } = require('../services/notificationService');

router.get('/', auth, async (req, res) => {
  try {
    const reminders = await Reminder.find().sort({ dueDate: 1 });
    res.json({ success: true, reminders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { title, description, dueDate, dueTime, leadId, priority } = req.body;
    if (!title || !dueDate) {
      return res.status(400).json({ success: false, message: 'Title and date required' });
    }
    let leadData = {};
    if (leadId) {
      const lead = await Lead.findById(leadId);
      if (lead) {
        leadData = {
          lead: lead._id,
          leadName: lead.name,
          leadPhone: lead.phone || '',
          leadEmail: lead.email || ''
        };
      }
    }
    const reminder = new Reminder({
      title, description: description || '',
      dueDate: new Date(dueDate),
      dueTime: dueTime || '09:00',
      priority: priority || 'Medium',
      ...leadData
    });
    await reminder.save();
    let notificationResults = {};
    try {
      notificationResults = await sendReminderNotifications(reminder);
      reminder.smsSentToCustomer = notificationResults?.customer?.sms?.success || false;
      reminder.smsSentToAdmin = notificationResults?.admin?.sms?.success || false;
      reminder.emailSentToCustomer = notificationResults?.customer?.email?.success || false;
      reminder.notificationSentAt = new Date();
      await reminder.save();
    } catch (err) {
      console.error('Notification error:', err.message);
    }
    res.status(201).json({ success: true, reminder, notifications: notificationResults });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const reminder = await Reminder.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!reminder) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, reminder });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await Reminder.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;