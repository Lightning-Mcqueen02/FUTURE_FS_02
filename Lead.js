const mongoose = require('mongoose');

const NoteSchema = new mongoose.Schema({
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const LeadSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: { type: String, trim: true, default: '' },
  company: { type: String, trim: true, default: '' },
  status: {
    type: String,
    enum: ['New', 'Contacted', 'Qualified', 'Converted', 'Lost'],
    default: 'New'
  },
  score: { type: Number, min: 0, max: 100, default: 50 },
  source: {
    type: String,
    enum: ['Website', 'Referral', 'Social Media', 'Cold Call', 'Email', 'Other'],
    default: 'Other'
  },
  notes: [NoteSchema],
  lastContacted: { type: Date },
  smsSent: { type: Boolean, default: false },
  emailSent: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Lead', LeadSchema);