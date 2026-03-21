const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getAIResponse } = require('../services/aiService');

router.post('/chat', auth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ success: false, message: 'Message required' });
    const result = await getAIResponse(message.trim());
    res.json({ success: true, reply: result.message, source: result.source });
  } catch (err) {
    res.status(500).json({ success: false, message: 'AI unavailable' });
  }
});

module.exports = router;