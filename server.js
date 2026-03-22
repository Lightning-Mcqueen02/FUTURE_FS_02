require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static('public'));

// ── AUTH MIDDLEWARE ──
function auth(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'No token' });
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(403).json({ success: false, message: 'Invalid token' });
  }
}

// ── MODELS ──
const Lead = mongoose.models.Lead || mongoose.model('Lead', new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, lowercase: true },
  phone: { type: String, default: '' },
  company: { type: String, default: '' },
  status: { type: String, enum: ['New','Contacted','Qualified','Converted','Lost'], default: 'New' },
  score: { type: Number, default: 50 },
  source: { type: String, default: 'Other' },
  notes: [{ text: String, createdAt: { type: Date, default: Date.now } }]
}, { timestamps: true }));

const Reminder = mongoose.models.Reminder || mongoose.model('Reminder', new mongoose.Schema({
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
}, { timestamps: true }));

// ── SMS ──
async function sendSMS(to, message) {
  try {
    const apiKey = process.env.FAST2SMS_API_KEY;
    if (!apiKey || apiKey.includes('your_key')) {
      console.log(`[SMS MOCK] To:${to}`);
      return { success: true, mock: true };
    }
    const phone = to.replace(/^\+91|^91/,'').replace(/\D/g,'').slice(-10);
    const r = await axios.post(
      'https://www.fast2sms.com/dev/bulkV2',
      { route:'v3', message, language:'english', flash:0, numbers:phone },
      { headers:{ authorization:apiKey, 'Content-Type':'application/json' } }
    );
    console.log('[SMS]', r.data);
    return { success: true };
  } catch(e) {
    console.error('[SMS ERROR]', e.message);
    return { success: false };
  }
}

// ── AUTH ROUTES ──
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (email !== process.env.ADMIN_EMAIL || password !== process.env.ADMIN_PASSWORD)
    return res.status(401).json({ success:false, message:'Invalid credentials' });
  const token = jwt.sign({ email, role:'admin' }, process.env.JWT_SECRET, { expiresIn:'7d' });
  res.json({ success:true, token, admin:{ email, role:'admin' } });
});

app.get('/api/auth/me', auth, (req, res) => {
  res.json({ success:true, admin:req.admin });
});

// ── LEAD ROUTES ──
app.get('/api/leads', auth, async (req, res) => {
  try {
    const { search, status } = req.query;
    let q = {};
    if (status) q.status = status;
    if (search) q.$or = [
      { name:{$regex:search,$options:'i'} },
      { email:{$regex:search,$options:'i'} },
      { company:{$regex:search,$options:'i'} }
    ];
    const leads = await Lead.find(q).sort({ createdAt:-1 });
    const stats = await Lead.aggregate([{ $group:{ _id:'$status', count:{$sum:1} } }]);
    const statusCounts = { New:0,Contacted:0,Qualified:0,Converted:0,Lost:0 };
    stats.forEach(s => { statusCounts[s._id] = s.count; });
    res.json({ success:true, leads, total:leads.length, stats:statusCounts });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

app.get('/api/leads/:id', auth, async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success:false, message:'Not found' });
    res.json({ success:true, lead });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

app.post('/api/leads', auth, async (req, res) => {
  try {
    const { name, email, phone, company, status, source } = req.body;
    if (!name || !email) return res.status(400).json({ success:false, message:'Name and email required' });
    const existing = await Lead.findOne({ email:email.toLowerCase() });
    if (existing) return res.status(409).json({ success:false, message:'Email already exists' });
    const lead = new Lead({ name, email, phone, company, status:status||'New', source:source||'Other' });
    await lead.save();
    let smsSent = false;
    if (phone) {
      const r = await sendSMS(phone, `Hi ${name.split(' ')[0]}! Thanks for connecting. We will be in touch soon! - NovaCRM`);
      smsSent = r.success;
    }
    res.status(201).json({ success:true, lead, notifications:{ smsSent } });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

app.put('/api/leads/:id', auth, async (req, res) => {
  try {
    const lead = await Lead.findByIdAndUpdate(req.params.id, req.body, { new:true });
    if (!lead) return res.status(404).json({ success:false, message:'Not found' });
    res.json({ success:true, lead });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

app.delete('/api/leads/:id', auth, async (req, res) => {
  try {
    await Lead.findByIdAndDelete(req.params.id);
    res.json({ success:true, message:'Deleted' });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

app.post('/api/leads/:id/notes', auth, async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success:false, message:'Not found' });
    lead.notes.push({ text:req.body.text });
    await lead.save();
    res.json({ success:true, lead });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

app.delete('/api/leads', auth, async (req, res) => {
  try {
    await Lead.deleteMany({});
    res.json({ success:true, message:'All leads deleted' });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

// ── REMINDER ROUTES ──
app.get('/api/reminders', auth, async (req, res) => {
  try {
    const reminders = await Reminder.find().sort({ dueDate:1 });
    res.json({ success:true, reminders });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

app.post('/api/reminders', auth, async (req, res) => {
  try {
    const { title, description, dueDate, dueTime, leadId, priority } = req.body;
    if (!title || !dueDate) return res.status(400).json({ success:false, message:'Title and date required' });
    let leadData = {};
    if (leadId) {
      const lead = await Lead.findById(leadId);
      if (lead) leadData = { leadName:lead.name, leadPhone:lead.phone||'', leadEmail:lead.email||'' };
    }
    const reminder = new Reminder({
      title, description:description||'',
      dueDate:new Date(dueDate), dueTime:dueTime||'09:00',
      priority:priority||'Medium', ...leadData
    });
    await reminder.save();
    const n = { customer:{}, admin:{} };
    if (leadData.leadPhone) {
      n.customer.sms = await sendSMS(leadData.leadPhone,
        `Hi ${leadData.leadName}! Meeting reminder: ${title} on ${new Date(dueDate).toLocaleDateString('en-IN')} at ${dueTime||'09:00'}. - NovaCRM`);
      reminder.smsSentToCustomer = n.customer.sms?.success || false;
    }
    if (process.env.ADMIN_PHONE) {
      n.admin.sms = await sendSMS(process.env.ADMIN_PHONE,
        `NovaCRM Reminder: ${title} | Lead: ${leadData.leadName||'Unknown'} | ${new Date(dueDate).toLocaleDateString('en-IN')}`);
      reminder.smsSentToAdmin = n.admin.sms?.success || false;
    }
    await reminder.save();
    res.status(201).json({ success:true, reminder, notifications:n });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

app.put('/api/reminders/:id', auth, async (req, res) => {
  try {
    const reminder = await Reminder.findByIdAndUpdate(req.params.id, req.body, { new:true });
    res.json({ success:true, reminder });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

app.delete('/api/reminders/:id', auth, async (req, res) => {
  try {
    await Reminder.findByIdAndDelete(req.params.id);
    res.json({ success:true, message:'Deleted' });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

// ── AI CHAT ──
app.post('/api/ai/chat', auth, async (req, res) => {
  try {
    const { message } = req.body;
    const leads = await Lead.find({}).sort({ createdAt:-1 }).limit(50);
    const reminders = await Reminder.find({ done:false }).sort({ dueDate:1 }).limit(10);
    const counts = { New:0,Contacted:0,Qualified:0,Converted:0,Lost:0 };
    leads.forEach(l => counts[l.status]++);
    const total = leads.length;
    const convRate = total ? Math.round(counts.Converted/total*100) : 0;
    const topLead = leads.slice().sort((a,b) => b.score-a.score)[0];
    const q = message.toLowerCase();
    let reply = '';
    if (q.match(/top|best|highest/)) {
      reply = topLead ? `🏆 Top lead: ${topLead.name} (Score: ${topLead.score}/100, Status: ${topLead.status})` : 'No leads yet!';
    } else if (q.match(/follow|contact|new/)) {
      const nl = leads.filter(l => l.status==='New');
      reply = nl.length ? `📞 ${nl.length} leads need follow-up: ${nl.map(l=>l.name).join(', ')}` : '✅ All contacted!';
    } else if (q.match(/pipeline|summary/)) {
      reply = `📊 New:${counts.New} | Contacted:${counts.Contacted} | Qualified:${counts.Qualified} | Converted:${counts.Converted} | Lost:${counts.Lost} | Rate:${convRate}%`;
    } else if (q.match(/reminder|meeting/)) {
      reply = reminders.length ? `🔔 ${reminders.length} reminders. Next: "${reminders[0].title}" for ${reminders[0].leadName||'Unknown'}` : '📅 No reminders!';
    } else if (q.match(/tip|advice/)) {
      reply = '💡 Contact leads within 1 hour of signup — conversion increases 7x!';
    } else {
      reply = `🤖 You have ${total} leads, ${convRate}% conversion rate. ${counts.New} need contact!`;
    }
    res.json({ success:true, reply, source:'local' });
  } catch(e) { res.status(500).json({ success:false, message:'AI unavailable' }); }
});

// ── HEALTH ──
app.get('/api/health', (req, res) => {
  res.json({ success:true, message:'NovaCRM running!', db: mongoose.connection.readyState===1?'connected':'disconnected' });
});

// ── START ──
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected!');
    app.listen(PORT, () => console.log(`🚀 Running on port ${PORT}`));
  })
  .catch(err => {
    console.error('❌', err.message);
    process.exit(1);
  });
