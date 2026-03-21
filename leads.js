const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const auth = require('../middleware/auth');
const { sendWelcomeSMS } = require('../services/notificationService');

router.get('/', auth, async (req, res) => {
  try {
    const { search, status } = req.query;
    let query = {};
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } }
      ];
    }
    const leads = await Lead.find(query).sort({ createdAt: -1 });
    const stats = await Lead.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    const statusCounts = { New:0, Contacted:0, Qualified:0, Converted:0, Lost:0 };
    stats.forEach(s => { statusCounts[s._id] = s.count; });
    res.json({ success: true, leads, total: leads.length, stats: statusCounts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    res.json({ success: true, lead });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { name, email, phone, company, status, source } = req.body;
    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email required' });
    }
    const existing = await Lead.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already exists' });
    }
    const lead = new Lead({ name, email, phone, company, status: status||'New', source: source||'Other' });
    await lead.save();
    let smsSent = false;
    if (phone) {
      const result = await sendWelcomeSMS(lead);
      smsSent = result.success;
    }
    res.status(201).json({ success: true, lead, notifications: { smsSent } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const lead = await Lead.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    res.json({ success: true, lead });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await Lead.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Lead deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/:id/notes', auth, async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    lead.notes.push({ text: req.body.text });
    await lead.save();
    res.json({ success: true, lead });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/', auth, async (req, res) => {
  try {
    await Lead.deleteMany({});
    res.json({ success: true, message: 'All leads deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;