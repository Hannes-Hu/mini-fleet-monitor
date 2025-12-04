import React, { useState, useEffect, useCallback } from 'react';
import { Container, Row, Col, Card, Button, Badge, Alert } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';
import { getRobots, moveRobot, createRobot } from '../services/robotService';
import useWebSocket from '../hooks/useWebSocket';
import RobotMap from '../components/RobotMap';
import RobotList from '../components/RobotList';

const DashboardPage = () => {
  const [robots, setRobots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [simulationActive, setSimulationActive] = useState(false);
  const [connectedClients, setConnectedClients] = useState(0);
  const { token, logout, user } = useAuth();

  // Fetch robots on mount
  useEffect(() => {
    fetchRobots();
  }, []);

  // WebSocket connection for live updates
  const handleWebSocketMessage = useCallback((data) => {
    console.log('WebSocket message received:', data);
    
    switch (data.type) {
      case 'POSITION_UPDATE':
        setRobots(prevRobots => 
          prevRobots.map(robot => 
            robot.id === data.robot.id ? data.robot : robot
          )
        );
        break;
      
      case 'ROBOT_CREATED':
        setRobots(prevRobots => [...prevRobots, data.robot]);
        break;
      
      case 'CONNECTED':
        console.log('WebSocket connected:', data.message);
        break;
      
      case 'CLIENT_COUNT_UPDATE':
        setConnectedClients(data.count);
        break;
      
      default:
        console.log('Unknown message type:', data.type);
    }
  }, []);

  const wsUrl = `${process.env.REACT_APP_WS_URL}?token=${token}`;
  useWebSocket(wsUrl, handleWebSocketMessage);

  const fetchRobots = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getRobots(token);
      setRobots(data);
    } catch (err) {
      setError('Failed to load robots. Please try again.');
      console.error('Error fetching robots:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleMoveRobot = async (robotId) => {
    try {
      await moveRobot(robotId, token);
      // The WebSocket will update the robot position
    } catch (err) {
      console.error('Error moving robot:', err);
      alert('Failed to move robot. Please try again.');
    }
  };

  const handleStartSimulation = () => {
    setSimulationActive(true);
    // Start moving robots randomly
    const interval = setInterval(() => {
      if (robots.length > 0) {
        const randomRobot = robots[Math.floor(Math.random() * robots.length)];
        handleMoveRobot(randomRobot.id);
      }
    }, 2000);

    // Store interval for cleanup
    return () => clearInterval(interval);
  };

  const handleStopSimulation = () => {
    setSimulationActive(false);
  };

  const handleAddRobot = async () => {
    const name = prompt('Enter robot name:');
    if (name) {
      try {
        await createRobot({ name }, token);
        // Robot will be added via WebSocket update
      } catch (err) {
        console.error('Error creating robot:', err);
        alert('Failed to create robot. Please try again.');
      }
    }
  };

  return (
    <Container fluid className="p-0">
      {/* Header */}
      <div className="bg-dark text-white p-3 mb-4">
        <Row className="align-items-center">
          <Col>
            <h1 className="h3 mb-0">Mini-Fleet Monitor</h1>
            <div className="small">
              {user && `Logged in as: ${user.email}`}
            </div>
          </Col>
          <Col className="text-end">
            <div className="mb-2">
              <Badge bg="info" className="me-2">
                Robots: {robots.length}
              </Badge>
              <Badge bg="success">
                Connected: {connectedClients}
              </Badge>
            </div>
            <Button
              variant="outline-light"
              size="sm"
              onClick={logout}
            >
              Logout
            </Button>
          </Col>
        </Row>
      </div>

      <Container>
        {/* Controls */}
        <Row className="mb-4">
          <Col>
            <Card>
              <Card.Body className="py-3">
                <div className="d-flex justify-content-between align-items-center">
                  <div>
                    <Button
                      variant="primary"
                      onClick={fetchRobots}
                      disabled={loading}
                      className="me-2"
                    >
                      {loading ? 'Loading...' : 'Refresh Robots'}
                    </Button>
                    <Button
                      variant="success"
                      onClick={handleAddRobot}
                      className="me-2"
                    >
                      Add Robot
                    </Button>
                    <Button
                      variant={simulationActive ? "danger" : "warning"}
                      onClick={simulationActive ? handleStopSimulation : handleStartSimulation}
                    >
                      {simulationActive ? 'Stop Simulation' : 'Start Simulation'}
                    </Button>
                  </div>
                  <div className="text-muted small">
                    Updates every 2 seconds
                  </div>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {error && (
          <Alert variant="danger" className="mb-4">
            {error}
          </Alert>
        )}

        {/* Main Content */}
        <Row>
          {/* Map */}
          <Col lg={8} className="mb-4">
            <Card className="h-100">
              <Card.Header>
                <h5 className="mb-0">Robot Locations</h5>
              </Card.Header>
              <Card.Body className="p-0" style={{ minHeight: '600px' }}>
                <RobotMap robots={robots} />
              </Card.Body>
              <Card.Footer className="text-muted small">
                {robots.length} robots displayed on map
              </Card.Footer>
            </Card>
          </Col>

          {/* Robot List */}
          <Col lg={4}>
            <Card className="h-100">
              <Card.Header className="d-flex justify-content-between align-items-center">
                <h5 className="mb-0">Robot List</h5>
                <Badge bg="primary">{robots.length}</Badge>
              </Card.Header>
              <Card.Body className="p-0" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                <RobotList
                  robots={robots}
                  onMoveRobot={handleMoveRobot}
                  loading={loading}
                />
              </Card.Body>
              <Card.Footer className="text-muted small">
                Click "Move" to simulate robot movement
              </Card.Footer>
            </Card>
          </Col>
        </Row>

        {/* Status Bar */}
        <Row className="mt-4">
          <Col>
            <Card>
              <Card.Body className="py-2">
                <div className="d-flex justify-content-between align-items-center">
                  <div className="small">
                    <span className="text-muted">Last updated: </span>
                    <span>{new Date().toLocaleTimeString()}</span>
                  </div>
                  <div className="small">
                    <span className="text-muted">Status: </span>
                    <Badge bg={simulationActive ? "warning" : "success"}>
                      {simulationActive ? 'Simulation Active' : 'Idle'}
                    </Badge>
                  </div>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </Container>
  );
};

export default DashboardPage;