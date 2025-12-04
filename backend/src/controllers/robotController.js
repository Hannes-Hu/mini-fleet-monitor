const Robot = require('../models/Robot');
const { validationResult } = require('express-validator');
const { broadcastUpdate } = require('../services/websocketService');

const getAllRobots = async (req, res) => {
  try {
    const robots = await Robot.findAll();
    res.json(robots);
  } catch (error) {
    console.error('Get robots error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getRobotById = async (req, res) => {
  try {
    const robot = await Robot.findById(req.params.id);
    if (!robot) {
      return res.status(404).json({ error: 'Robot not found' });
    }
    res.json(robot);
  } catch (error) {
    console.error('Get robot error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const createRobot = async (req, res) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, lat, lon } = req.body;
    const robot = await Robot.create(name, lat, lon);
    
    // Broadcast new robot to all connected clients
    broadcastUpdate({
      type: 'ROBOT_CREATED',
      robot
    });

    res.status(201).json(robot);
  } catch (error) {
    console.error('Create robot error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const updateRobotPosition = async (req, res) => {
  try {
    const robot = await Robot.findById(req.params.id);
    
    if (!robot) {
      return res.status(404).json({ error: 'Robot not found' });
    }

    // Generate random position near current location
    const newLat = parseFloat(robot.lat) + (Math.random() - 0.5) * 0.01;
    const newLon = parseFloat(robot.lon) + (Math.random() - 0.5) * 0.01;
    
    const updatedRobot = await Robot.updatePosition(
      req.params.id,
      newLat,
      newLon
    );

    // Broadcast update to all WebSocket clients
    broadcastUpdate({
      type: 'POSITION_UPDATE',
      robot: updatedRobot
    });

    res.json(updatedRobot);
  } catch (error) {
    console.error('Update position error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  getAllRobots,
  getRobotById,
  createRobot,
  updateRobotPosition
};