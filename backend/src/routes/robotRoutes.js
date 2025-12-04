const express = require('express');
const router = express.Router();
const {
  getAllRobots,
  getRobotById,
  createRobot,
  updateRobotPosition
} = require('../controllers/robotController');
const { validateRobot } = require('../middleware/validationMiddleware');
const { authenticateToken } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authenticateToken);

// GET all robots
router.get('/', getAllRobots);

// GET specific robot
router.get('/:id', getRobotById);

// POST create new robot 
router.post('/', validateRobot, createRobot);

// POST update robot position (simulate movement)
router.post('/:id/move', updateRobotPosition);

module.exports = router;