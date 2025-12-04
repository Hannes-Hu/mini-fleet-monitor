const Robot = require('../models/Robot');
const { broadcastUpdate } = require('./websocketService');

const simulateRobotMovement = async (robotId) => {
  try {
    const robot = await Robot.findById(robotId);
    
    if (!robot) {
      throw new Error('Robot not found');
    }

    // Generate random position near current location
    const newLat = parseFloat(robot.lat) + (Math.random() - 0.5) * 0.01;
    const newLon = parseFloat(robot.lon) + (Math.random() - 0.5) * 0.01;
    
    const updatedRobot = await Robot.updatePosition(robotId, newLat, newLon);

    // Broadcast update
    broadcastUpdate({
      type: 'POSITION_UPDATE',
      robot: updatedRobot
    });

    return updatedRobot;
  } catch (error) {
    console.error('Simulate movement error:', error);
    throw error;
  }
};

module.exports = {
  simulateRobotMovement
};