import React from 'react';
import { ListGroup, Badge, Button } from 'react-bootstrap';

const RobotList = ({ robots, onMoveRobot, loading }) => {
  if (loading) {
    return (
      <div className="text-center p-4">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading robots...</span>
        </div>
      </div>
    );
  }

  if (robots.length === 0) {
    return (
      <div className="text-center p-4 text-muted">
        No robots found
      </div>
    );
  }

  return (
    <ListGroup variant="flush">
      {robots.map(robot => (
        <ListGroup.Item key={robot.id} className="py-3">
          <div className="d-flex justify-content-between align-items-start">
            <div className="flex-grow-1">
              <h6 className="mb-1">
                {robot.name}
                <Badge 
                  bg={robot.status === 'moving' ? 'warning' : 'success'} 
                  className="ms-2"
                >
                  {robot.status}
                </Badge>
              </h6>
              <div className="text-muted small mb-1">
                ID: {robot.id}
              </div>
              <div className="text-muted small">
                <div>Latitude: {parseFloat(robot.lat).toFixed(6)}</div>
                <div>Longitude: {parseFloat(robot.lon).toFixed(6)}</div>
                <div>Updated: {new Date(robot.updated_at).toLocaleTimeString()}</div>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline-primary"
              onClick={() => onMoveRobot(robot.id)}
              className="ms-2"
            >
              Move
            </Button>
          </div>
        </ListGroup.Item>
      ))}
    </ListGroup>
  );
};

export default RobotList;