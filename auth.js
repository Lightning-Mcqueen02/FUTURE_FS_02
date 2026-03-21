const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@novacrm.app';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';

    if (email !== adminEmail || password !== adminPassword) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const token = jwt.sign(
      { email: adminEmail, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ success: true, token, admin: { email: adminEmail, role: 'admin' } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/me', require('../middleware/auth'), (req, res) => {
  res.json({ success: true, admin: req.admin });
});

module.exports = router;