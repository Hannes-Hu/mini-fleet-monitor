const express = require('express');
const router = express.Router();
const authRoutes = require('./authRoutes');
const robotRoutes = require('./robotRoutes');

router.use('/auth', authRoutes);
router.use('/robots', robotRoutes);

module.exports = router;