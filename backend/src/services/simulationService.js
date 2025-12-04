const Robot = require('../models/Robot');
const { simulateRobotMovement } = require('./robotService');

let simulationInterval = null;
let isRunning = false;

const startSimulation = async (interval = 2000) => {
  if (isRunning) {
    console.log('Simulation is already running');
    return;
  }

  isRunning = true;
  
  simulationInterval = setInterval(async () => {
    try {
      const robots = await Robot.findAll();
      
      if (robots.length === 0) {
        console.log('No robots to simulate');
        return;
      }
      
      // Pick a random robot
      const randomRobot = robots[Math.floor(Math.random() * robots.length)];
      
      // Move the robot
      await simulateRobotMovement(randomRobot.id);
      
      console.log(`Simulated movement for robot: ${randomRobot.name}`);
    } catch (error) {
      console.error('Simulation error:', error);
    }
  }, interval);

  console.log(`Simulation started with ${interval}ms interval`);
};

const stopSimulation = () => {
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
    isRunning = false;
    console.log('Simulation stopped');
  }
};

const getSimulationStatus = () => {
  return {
    isRunning,
    interval: simulationInterval ? 2000 : null
  };
};

module.exports = {
  startSimulation,
  stopSimulation,
  getSimulationStatus
};