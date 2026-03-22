require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static('public'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'NovaCRM API running!',
    time: new Date().toISOString(),
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Auth routes
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const jwt = require('jsonwebtoken');
    if (email !== process.env.ADMIN_EMAIL || password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const token = jwt.sign({ email, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, admin: { email, role: 'admin' } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/auth/me', (req, res) => {
  try {
    const jwt = require('jsonwebtoken');
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'No token' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ success: true, admin: decoded });
  } catch (err) {
    res.status(403).json({ success: false, message: 'Invalid token' });
  }
});

// Middleware
function authMiddleware(req, res, next) {
  try {
    const jwt = require('jsonwebtoken');
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'No token' });
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    res.status(403).json({ success: false, message: 'Invalid token' });
  }
}

// Lead Model
const mongoose2 = mongoose;
const LeadSchema = new mongoose2.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, lowercase: true },
  phone: { type: String, default: '' },
  company: { type: String, default: '' },
  status: { type: String, enum: ['New','Contacted','Qualified','Converted','Lost'], default: 'New' },
  score: { type: Number, default: 50 },
  source: { type: String, default: 'Other' },
  notes: [{ text: String, createdAt: { type: Date, default: Date.now } }],
  smsSent: { type: Boolean, default: false }
}, { timestamps: true });
const Lead = mongoose2.models.Lead || mongoose2.model('Lead', LeadSchema);

// Reminder Model
const ReminderSchema = new mongoose2.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  dueDate: { type: Date, required: true },
  dueTime: { type: String, default: '09:00' },
  leadName: { type: String, default: '' },
  leadPhone: { type: String, default: '' },
  leadEmail: { type: String, default: '' },
  priority: { type: String, default: 'Medium' },
  done: { type: Boolean, default: false },
  smsSentToCustomer: { type: Boolean, default: false },
  smsSentToAdmin: { type: Boolean, default: false }
}, { timestamps: true });
const Reminder = mongoose2.models.Reminder || mongoose2.model('Reminder', ReminderSchema);

// SMS Function
async function sendSMS(to, message) {
  try {
    const axios = require('axios');
    const apiKey = process.env.FAST2SMS_API_KEY;
    if (!apiKey || apiKey.includes('your_key')) {
      console.log(`[SMS MOCK] To: ${to}`);
      return { success: true, mock: true };
    }
    const phone = to.replace(/^\+91|^91/, '').replace(/\D/g, '').slice(-10);
    const response = await axios.post(
      'https://www.fast2sms.com/dev/bulkV2',
      { route: 'v3', message, language: 'english', flash: 0, numbers: phone },
      { headers: { authorization: apiKey, 'Content-Type': 'application/json' } }
    );
    console.log('[SMS]', response.data);
    return { success: true };
  } catch (err) {
    console.error('[SMS ERROR]', err.message);
    return { success: false };
  }
}

// LEADS ROUTES
app.get('/api/leads', authMiddleware, async (req, res) => {
  try {
    const { search, status } = req.query;
    let query = {};
    if (status) query.status = status;
    if (search) query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { company: { $regex: search, $options: 'i' } }
    ];
    const leads = await Lead.find(query).sort({ createdAt: -1 });
    const stats = await Lead.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
    const statusCounts = { New:0, Contacted:0, Qualified:0, Converted:0, Lost:0 };
    stats.forEach(s => { statusCounts[s._id] = s.count; });
    res.json({ success: true, leads, total: leads.length, stats: statusCounts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/leads/:id', authMiddleware, async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, lead });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/leads', authMiddleware, async (req, res) => {
  try {
    const { name, email, phone, company, status, source } = req.body;
    if (!name || !email) return res.status(400).json({ success: false, message: 'Name and email required' });
    const existing = await Lead.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ success: false, message: 'Email already exists' });
    const lead = new Lead({ name, email, phone, company, status: status||'New', source: source||'Other' });
    await lead.save();
    let smsSent = false;
    if (phone) {
      const result = await sendSMS(phone, `Hi ${name.split(' ')[0]}! Thanks for connecting. We will be in touch soon! - NovaCRM`);
      smsSent = result.success;
    }
    res.status(201).json({ success: true, lead, notifications: { smsSent } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/leads/:id', authMiddleware, async (req, res) => {
  try {
    const lead = await Lead.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!lead) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, lead });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/leads/:id', authMiddleware, async (req, res) => {
  try {
    await Lead.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/leads/:id/notes', authMiddleware, async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Not found' });
    lead.notes.push({ text: req.body.text });
    await lead.save();
    res.json({ success: true, lead });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/leads', authMiddleware, async (req, res) => {
  try {
    await Lead.deleteMany({});
    res.json({ success: true, message: 'All leads deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// REMINDER ROUTES
app.get('/api/reminders', authMiddleware, async (req, res) => {
  try {
    const reminders = await Reminder.find().sort({ dueDate: 1 });
    res.json({ success: true, reminders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/reminders', authMiddleware, async (req, res) => {
  try {
    const { title, description, dueDate, dueTime, leadId, priority } = req.body;
    if (!title || !dueDate) return res.status(400).json({ success: false, message: 'Title and date required' });
    let leadData = {};
    if (leadId) {
      const lead = await Lead.findById(leadId);
      if (lead) leadData = { leadName: lead.name, leadPhone: lead.phone||'', leadEmail: lead.email||'' };
    }
    const reminder = new Reminder({
      title, description: description||'',
      dueDate: new Date(dueDate), dueTime: dueTime||'09:00',
      priority: priority||'Medium', ...leadData
    });
    await reminder.save();
    let notificationResults = { customer: {}, admin: {} };
    if (leadData.leadPhone) {
      notificationResults.customer.sms = await sendSMS(leadData.leadPhone,
        `Hi ${leadData.leadName}! Meeting reminder: ${title} on ${new Date(dueDate).toLocaleDateString('en-IN')} at ${dueTime||'09:00'}. - NovaCRM`);
      reminder.smsSentToCustomer = notificationResults.customer.sms.success;
    }
    if (process.env.ADMIN_PHONE) {
      notificationResults.admin.sms = await sendSMS(process.env.ADMIN_PHONE,
        `NovaCRM Reminder: ${title} | Lead: ${leadData.leadName||'Unknown'} | ${new Date(dueDate).toLocaleDateString('en-IN')} at ${dueTime||'09:00'}`);
      reminder.smsSentToAdmin = notificationResults.admin.sms.success;
    }
    await reminder.save();
    res.status(201).json({ success: true, reminder, notifications: notificationResults });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/reminders/:id', authMiddleware, async (req, res) => {
  try {
    const reminder = await Reminder.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, reminder });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/reminders/:id', authMiddleware, async (req, res) => {
  try {
    await Reminder.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// AI CHAT ROUTE
app.post('/api/ai/chat', authMiddleware, async (req, res) => {
  try {
    const { message } = req.body;
    const leads = await Lead.find({}).sort({ createdAt: -1 }).limit(50);
    const reminders = await Reminder.find({ done: false }).sort({ dueDate: 1 }).limit(10);
    const counts = { New:0, Contacted:0, Qualified:0, Converted:0, Lost:0 };
    leads.forEach(l => counts[l.status]++);
    const total = leads.length;
    const convRate = total ? Math.round(counts.Converted/total*100) : 0;
    const topLead = leads.slice().sort((a,b) => b.score-a.score)[0];
    const q = message.toLowerCase();
    let reply = '';
    if (q.match(/top|best|highest/)) {
      reply = topLead ? `🏆 Top lead: ${topLead.name} (Score: ${topLead.score}/100, Status: ${topLead.status})` : 'No leads yet!';
    } else if (q.match(/follow|contact|new/)) {
      const newLeads = leads.filter(l => l.status === 'New');
      reply = newLeads.length ? `📞 ${newLeads.length} leads need follow-up: ${newLeads.map(l=>l.name).join(', ')}` : '✅ All leads contacted!';
    } else if (q.match(/pipeline|summary|overview/)) {
      reply = `📊 Pipeline: New:${counts.New} | Contacted:${counts.Contacted} | Qualified:${counts.Qualified} | Converted:${counts.Converted} | Lost:${counts.Lost}\nConversion: ${convRate}%`;
    } else if (q.match(/reminder|meeting/)) {
      reply = reminders.length ? `🔔 ${reminders.length} reminders pending. Next: "${reminders[0].title}" for ${reminders[0].leadName||'Unknown'}` : '📅 No upcoming reminders!';
    } else if (q.match(/tip|advice/)) {
      reply = '💡 Tip: Contact leads within 1 hour of signup — conversion increases 7x!';
    } else {
      reply = `🤖 You have ${total} leads with ${convRate}% conversion. ${counts.New} need contact. Ask me about pipeline, top leads, or reminders!`;
    }
    res.json({ success: true, reply, source: 'local' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'AI unavailable' });
  }
});

// Start server
async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB connected!');
    app.listen(PORT, () => {
      console.log(`🚀 NovaCRM running on port ${PORT}`);
    });
  } catch (err) {
    console.error('❌ Failed:', err.message);
    process.exit(1);
  }
}

startServer();
