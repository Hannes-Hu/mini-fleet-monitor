import api from './api';

export const getRobots = async () => {
  const response = await api.get('/robots');
  return response.data;
};

export const getRobotById = async (id) => {
  const response = await api.get(`/robots/${id}`);
  return response.data;
};

export const createRobot = async (robotData) => {
  const response = await api.post('/robots', robotData);
  return response.data;
};

export const moveRobot = async (robotId) => {
  const response = await api.post(`/robots/${robotId}/move`);
  return response.data;
};