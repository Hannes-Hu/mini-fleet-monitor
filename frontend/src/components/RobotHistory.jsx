import React, { useState, useEffect } from 'react';
import { Card, Button, Table, Badge } from 'react-bootstrap';
import './RobotHistory.css'; 

const RobotHistory = ({ robotId, robotName }) => {
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  const fetchPositionHistory = async () => {
    if (!robotId) return;
    
    try {
      setLoading(true);
      setError('');
      
      const token = localStorage.getItem('fleet_token');
      const response = await fetch(`http://localhost:3000/robots/${robotId}/positions?limit=20`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch position history (${response.status})`);
      }

      const data = await response.json();
      setPositions(data.positions);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching position history:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRobotStatistics = async () => {
    if (!robotId) return;
    
    try {
      const token = localStorage.getItem('fleet_token');
      const response = await fetch(`http://localhost:3000/robots/${robotId}/statistics`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data.statistics);
      }
    } catch (err) {
      console.error('Error fetching robot statistics:', err);
    }
  };

  useEffect(() => {
    if (showHistory && robotId) {
      fetchPositionHistory();
      fetchRobotStatistics();
    }
  }, [showHistory, robotId]);

  const formatCoordinate = (coord) => {
    if (coord === null || coord === undefined) return 'N/A';
    const num = typeof coord === 'number' ? coord : parseFloat(coord);
    return isNaN(num) ? 'N/A' : num.toFixed(6);
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  if (!robotId) {
    return (
      <Card className="mt-4">
        <Card.Body className="text-center text-muted">
          Select a robot to view position history
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card className="mt-4 robot-history-card">
      <Card.Header className="d-flex justify-content-between align-items-center">
        <h5 className="mb-0">
          Position History: {robotName}
          {stats && (
            <Badge bg="info" className="ms-2">
              {stats.positionCount} positions
            </Badge>
          )}
        </h5>
        <Button
          variant="outline-primary"
          size="sm"
          onClick={() => setShowHistory(!showHistory)}
        >
          {showHistory ? 'Hide History' : 'Show History'}
        </Button>
      </Card.Header>
      
      {showHistory && (
        <Card.Body>
          {/* Statistics */}
          {stats && (
            <div className="mb-4 p-3 bg-light rounded stats-container">
              <h6>Travel Statistics</h6>
              <div className="row">
                <div className="col-md-3">
                  <div className="stat-item">
                    <span className="stat-label">Total Positions:</span>
                    <span className="stat-value">{stats.positionCount}</span>
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="stat-item">
                    <span className="stat-label">Distance Traveled:</span>
                    <span className="stat-value">{stats.approximateDistanceKm} km</span>
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="stat-item">
                    <span className="stat-label">First Move:</span>
                    <span className="stat-value">
                      {stats.firstPosition ? formatDate(stats.firstPosition.created_at) : 'N/A'}
                    </span>
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="stat-item">
                    <span className="stat-label">Active Since:</span>
                    <span className="stat-value">
                      {stats.activeSince ? formatDate(stats.activeSince) : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Position History Table */}
          {loading ? (
            <div className="text-center p-4">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </div>
          ) : error ? (
            <div className="alert alert-danger">{error}</div>
          ) : positions.length === 0 ? (
            <div className="text-center p-4 text-muted">
              No position history available
            </div>
          ) : (
            <div className="table-responsive position-table" style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <Table striped bordered hover size="sm">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Time</th>
                    <th>Latitude</th>
                    <th>Longitude</th>
                    <th>Age</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((pos, index) => {
                    const age = Math.floor((new Date() - new Date(pos.created_at)) / 1000);
                    const minutes = Math.floor(age / 60);
                    const seconds = age % 60;
                    
                    return (
                      <tr key={pos.id}>
                        <td>{index + 1}</td>
                        <td>{formatTime(pos.created_at)}</td>
                        <td className="font-monospace">{formatCoordinate(pos.lat)}</td>
                        <td className="font-monospace">{formatCoordinate(pos.lon)}</td>
                        <td>
                          {minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`} ago
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          )}

          <div className="d-flex justify-content-between mt-3">
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={fetchPositionHistory}
              disabled={loading}
            >
              Refresh History
            </Button>
            <small className="text-muted">
              Showing {positions.length} most recent positions
            </small>
          </div>
        </Card.Body>
      )}
    </Card>
  );
};

export default RobotHistory;