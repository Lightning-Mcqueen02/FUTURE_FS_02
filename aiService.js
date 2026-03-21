const Lead = require('../models/Lead');
const Reminder = require('../models/Reminder');

async function getAIResponse(userMessage) {
  const leads = await Lead.find({}).sort({ createdAt: -1 }).limit(50);
  const reminders = await Reminder.find({ done: false }).sort({ dueDate: 1 }).limit(10);

  const counts = { New:0, Contacted:0, Qualified:0, Converted:0, Lost:0 };
  leads.forEach(l => counts[l.status]++);
  const total = leads.length;
  const convRate = total ? Math.round(counts.Converted / total * 100) : 0;
  const topLead = leads.slice().sort((a,b) => b.score - a.score)[0];
  const q = userMessage.toLowerCase();

  if (q.match(/top|best|highest|score/)) {
    return { success:true, source:'local', message: topLead
      ? `🏆 Top lead: ${topLead.name} (Score: ${topLead.score}/100, ${topLead.status}). Contact today!`
      : 'No leads yet!' };
  }
  if (q.match(/follow|contact|new lead/)) {
    const n = leads.filter(l => l.status==='New');
    return { success:true, source:'local', message: n.length
      ? `📞 ${n.length} need follow-up: ${n.map(l=>l.name).join(', ')}. Contact within 24h!`
      : '✅ All leads contacted!' };
  }
  if (q.match(/pipeline|summary|overview/)) {
    return { success:true, source:'local', message:
      `📊 Pipeline:\n🆕 New: ${counts.New}\n📞 Contacted: ${counts.Contacted}\n✅ Qualified: ${counts.Qualified}\n🎉 Converted: ${counts.Converted}\n❌ Lost: ${counts.Lost}\nConversion: ${convRate}%` };
  }
  if (q.match(/reminder|meeting/)) {
    if (!reminders.length) return { success:true, source:'local', message:'📅 No reminders yet!' };
    const next = reminders[0];
    return { success:true, source:'local', message:`🔔 ${reminders.length} reminder(s). Next: "${next.title}" on ${new Date(next.dueDate).toLocaleDateString('en-IN')}` };
  }
  if (q.match(/tip|advice/)) {
    return { success:true, source:'local', message:'💡 Contact leads within 1 hour of signup — conversion increases 7x!' };
  }
  return { success:true, source:'local', message:`🤖 You have ${total} leads, ${convRate}% conversion. Ask: "pipeline summary", "top lead", "follow up", "reminder"` };
}

module.exports = { getAIResponse };