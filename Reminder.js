const mongoose = require('mongoose');

const ReminderSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  dueDate: { type: Date, required: true },
  dueTime: { type: String, default: '09:00' },
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
  leadName: { type: String, default: '' },
  leadPhone: { type: String, default: '' },
  leadEmail: { type: String, default: '' },
  priority: { type: String, enum: ['High','Medium','Low'], default: 'Medium' },
  done: { type: Boolean, default: false },
  smsSentToCustomer: { type: Boolean, default: false },
  smsSentToAdmin: { type: Boolean, default: false },
  emailSentToCustomer: { type: Boolean, default: false },
  notificationSentAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Reminder', ReminderSchema);