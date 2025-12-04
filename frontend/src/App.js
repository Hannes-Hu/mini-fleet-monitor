import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import MapComponent from './components/MapComponent';
import RobotHistory from './components/RobotHistory';

function App() {
  // State Management
  const [email, setEmail] = useState('admin@test.com');
  const [password, setPassword] = useState('test123');
  const [token, setToken] = useState(() => localStorage.getItem('fleet_token') || '');
  const [robots, setRobots] = useState([]);
  const [selectedRobot, setSelectedRobot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);
  const [simulationActive, setSimulationActive] = useState(false);
  const [connectedClients, setConnectedClients] = useState(0);
  const [webSocketConnected, setWebSocketConnected] = useState(false);
  const [viewMode, setViewMode] = useState('map');
  
  // Modal States
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalContent, setModalContent] = useState('');
  const [modalType, setModalType] = useState('info'); // 'info', 'positions', 'statistics', 'activity'
  const [modalData, setModalData] = useState(null);
  
  // WebSocket Reference
  const wsRef = React.useRef(null);
  const reconnectTimeoutRef = React.useRef(null);
  const pingIntervalRef = React.useRef(null);

  // Helper function to handle robot updates from WebSocket
  const handleRobotUpdate = useCallback((updatedRobot) => {
    if (!updatedRobot || !updatedRobot.id) {
      console.error('Invalid robot update received:', updatedRobot);
      return;
    }
    
    // Validate and format robot data
    const formattedRobot = {
      ...updatedRobot,
      lat: parseFloat(updatedRobot.lat) || 52.520008,
      lon: parseFloat(updatedRobot.lon) || 13.404954,
      status: updatedRobot.status || 'idle'
    };
    
    setRobots(prevRobots => {
      const exists = prevRobots.some(robot => robot.id === formattedRobot.id);
      
      if (exists) {
        return prevRobots.map(robot => 
          robot.id === formattedRobot.id ? { ...robot, ...formattedRobot } : robot
        );
      } else {
        return [...prevRobots, formattedRobot];
      }
    });
    
    if (selectedRobot && selectedRobot.id === formattedRobot.id) {
      setSelectedRobot(prev => ({ ...prev, ...formattedRobot }));
    }
  }, [selectedRobot]);

  // Initialize WebSocket connection
  const initializeWebSocket = useCallback(() => {
    // Clear any existing reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    // Check if token exists
    if (!token) {
      console.log('No token, skipping WebSocket connection');
      return;
    }
    
    // Check if WebSocket is already connected or connecting
    if (wsRef.current) {
      const state = wsRef.current.readyState;
      if (state === WebSocket.OPEN) {
        console.log('WebSocket already connected');
        return;
      }
      
      // Clean up previous connection
      if (state !== WebSocket.CONNECTING) {
        wsRef.current.close();
        wsRef.current = null;
      } else {
        return;
      }
    }
    
    // Use the correct WebSocket URL
    const wsUrl = `ws://localhost:3000/ws`;
    console.log('Connecting to WebSocket:', wsUrl);
    
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      ws.onopen = () => {
        console.log('✅ WebSocket connected successfully');
        setWebSocketConnected(true);
        
        // Send authentication immediately
        if (token) {
          // Small delay to ensure connection is fully established
          setTimeout(() => {
            try {
              ws.send(JSON.stringify({
                type: 'AUTHENTICATE',
                token: token
              }));
              console.log('Authentication sent');
            } catch (sendError) {
              console.error('Error sending authentication:', sendError);
            }
          }, 100);
        }
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          switch (data.type) {
            case 'CONNECTED':
              console.log('WebSocket connection confirmed');
              break;
              
            case 'AUTH_SUCCESS':
              console.log('WebSocket authentication successful');
              break;
              
            case 'ROBOT_UPDATE':
              handleRobotUpdate(data.robot);
              break;
              
            case 'CLIENT_COUNT_UPDATE':
              setConnectedClients(data.count);
              break;
              
            case 'PONG':
              // Keep alive response
              break;
              
            case 'ERROR':
              console.error('WebSocket server error:', data.message);
              break;
              
            default:
              console.log('Unknown message type:', data.type, data);
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err, event.data);
        }
      };
      
      ws.onclose = (event) => {
        console.log('WebSocket disconnected', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean
        });
        setWebSocketConnected(false);
        wsRef.current = null;
        
        // Clear ping interval
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
        
        // Attempt to reconnect after delay (except for normal closure)
        if (event.code !== 1000 && token) {
          console.log('Attempting to reconnect in 3 seconds...');
          reconnectTimeoutRef.current = setTimeout(() => {
            if (token) {
              initializeWebSocket();
            }
          }, 3000);
        }
      };
      
      // Handle errors properly without causing infinite loops
      ws.onerror = (error) => {
        console.error('WebSocket error occurred');
        // The onclose event will handle reconnection
      };
      
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      setWebSocketConnected(false);
      
      // Try to reconnect after error
      reconnectTimeoutRef.current = setTimeout(() => {
        if (token) {
          initializeWebSocket();
        }
      }, 5000);
    }
  }, [token, handleRobotUpdate]);

  // Effects
  useEffect(() => {
    if (token) {
      fetchUserProfile();
      fetchRobots();
      initializeWebSocket();
      
      // Ping interval to keep connection alive
      pingIntervalRef.current = setInterval(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          try {
            wsRef.current.send(JSON.stringify({
              type: 'PING',
              timestamp: Date.now()
            }));
          } catch (error) {
            console.error('Error sending ping:', error);
          }
        }
      }, 30000); // Send ping every 30 seconds
      
      return () => {
        // Cleanup WebSocket
        if (wsRef.current) {
          wsRef.current.close(1000, 'Component unmounting');
          wsRef.current = null;
        }
        
        // Cleanup reconnect timeout
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
        
        // Cleanup ping interval
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
      };
    }
  }, [token, initializeWebSocket]);

  // Modal Functions
  const showModal = (title, content, type = 'info', data = null) => {
    setModalTitle(title);
    setModalContent(content);
    setModalType(type);
    setModalData(data);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setModalTitle('');
    setModalContent('');
    setModalType('info');
    setModalData(null);
  };

  // Handle robot selection from map or list
  const handleRobotSelect = (robot) => {
    setSelectedRobot(robot);
  };

  // Fetch robots from API
  const fetchRobots = async () => {
    if (!token) return;
    
    try {
      setLoading(true);
      setError('');
      
      const response = await fetch('http://localhost:3000/robots', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          handleLogout();
          throw new Error('Session expired. Please login again.');
        }
        throw new Error(`Failed to fetch robots (${response.status})`);
      }

      const data = await response.json();
      // Format robot data to ensure valid coordinates
      const formattedRobots = data.map(robot => ({
        ...robot,
        lat: parseFloat(robot.lat) || 52.520008,
        lon: parseFloat(robot.lon) || 13.404954,
        status: robot.status || 'idle'
      }));
      
      setRobots(formattedRobots);
      console.log(`Loaded ${formattedRobots.length} robots`);
      
    } catch (err) {
      console.error('Error fetching robots:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Move robot function
  const handleMoveRobot = async (robotId) => {
    try {
      const response = await fetch(`http://localhost:3000/robots/${robotId}/move`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to move robot (${response.status})`);
      }

      const data = await response.json();
      console.log('Robot moved:', data.robot.name);
      
      // Update local state immediately
      const updatedRobot = {
        ...data.robot,
        lat: parseFloat(data.robot.lat) || 52.520008,
        lon: parseFloat(data.robot.lon) || 13.404954
      };
      
      setRobots(prevRobots => 
        prevRobots.map(robot => 
          robot.id === updatedRobot.id ? { ...robot, ...updatedRobot } : robot
        )
      );
      
      if (selectedRobot && selectedRobot.id === updatedRobot.id) {
        setSelectedRobot(updatedRobot);
      }
      
    } catch (err) {
      console.error('Error moving robot:', err);
      showModal('Error', `Failed to move robot: ${err.message}`, 'error');
    }
  };

  const handleAddRobot = async () => {
    const name = prompt('Enter robot name:');
    if (!name || name.trim().length === 0) return;
    
    try {
      const response = await fetch('http://localhost:3000/robots', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: name.trim() }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to create robot (${response.status})`);
      }

      const data = await response.json();
      console.log('Robot created:', data.robot.name);
      
      // Format and add robot to local state
      const formattedRobot = {
        ...data.robot,
        lat: parseFloat(data.robot.lat) || 52.520008,
        lon: parseFloat(data.robot.lon) || 13.404954
      };
      
      setRobots(prevRobots => [...prevRobots, formattedRobot]);
      
      showModal('Success', `Robot "${data.robot.name}" created successfully!`, 'success');
      
    } catch (err) {
      console.error('Error creating robot:', err);
      showModal('Error', `Failed to create robot: ${err.message}`, 'error');
    }
  };

  const handleStartSimulation = async () => {
    try {
      const response = await fetch('http://localhost:3000/simulation/start', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to start simulation (${response.status})`);
      }

      const data = await response.json();
      setSimulationActive(true);
      console.log('Simulation started');
      
    } catch (err) {
      console.error('Error starting simulation:', err);
      showModal('Error', `Failed to start simulation: ${err.message}`, 'error');
    }
  };

  const handleStopSimulation = async () => {
    try {
      const response = await fetch('http://localhost:3000/simulation/stop', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to stop simulation (${response.status})`);
      }

      const data = await response.json();
      setSimulationActive(false);
      console.log('Simulation stopped');
      
    } catch (err) {
      console.error('Error stopping simulation:', err);
      showModal('Error', `Failed to stop simulation: ${err.message}`, 'error');
    }
  };

  const handleLogout = () => {
    setToken('');
    setUser(null);
    setRobots([]);
    setSelectedRobot(null);
    setSimulationActive(false);
    localStorage.removeItem('fleet_token');
    
    // Cleanup WebSocket
    if (wsRef.current) {
      wsRef.current.close(1000, 'User logged out');
      wsRef.current = null;
    }
    
    // Cleanup reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    // Cleanup ping interval
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    
    console.log('User logged out');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      console.log('Attempting login...');
      
      const response = await fetch('http://localhost:3000/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `Login failed (${response.status})`);
      }

      console.log('Login successful:', data.user.email);
      
      // Save token and user
      setToken(data.token);
      localStorage.setItem('fleet_token', data.token);
      setUser(data.user);
      
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const fetchUserProfile = async () => {
    if (!token) return;
    
    try {
      const response = await fetch('http://localhost:3000/auth/profile', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    }
  };

  // Helper function to safely format coordinates
  const formatCoordinate = (coord) => {
    if (coord === null || coord === undefined) return 'N/A';
    const num = typeof coord === 'number' ? coord : parseFloat(coord);
    return isNaN(num) ? 'N/A' : num.toFixed(6);
  };

  // Format time
  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Format date and time
  const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString([], { 
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Debug function
  const debugMap = () => {
    console.log('=== MAP DEBUG INFO ===');
    console.log('Robots:', robots);
    console.log('Robot count:', robots.length);
    console.log('Selected robot:', selectedRobot);
    console.log('WebSocket connected:', webSocketConnected);
    console.log('Connected clients:', connectedClients);
    console.log('WebSocket state:', wsRef.current?.readyState);
    
    // Check coordinates
    robots.forEach(robot => {
      if (robot.lat && robot.lon) {
        const lat = parseFloat(robot.lat);
        const lon = parseFloat(robot.lon);
        console.log(`Robot ${robot.name}: lat=${lat}, lon=${lon}, valid=${!isNaN(lat) && !isNaN(lon)}`);
      } else {
        console.log(`Robot ${robot.name}: missing coordinates`);
      }
    });
  };

  // Position History Functions
  const handleShowPositions = async () => {
    if (!selectedRobot) return;
    
    try {
      const token = localStorage.getItem('fleet_token');
      const response = await fetch(
        `http://localhost:3000/robots/${selectedRobot.id}/positions?limit=10`, 
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      
      if (!response.ok) throw new Error('API error');
      
      const data = await response.json();
      
      if (data.positions && data.positions.length > 0) {
        const positionsHtml = data.positions.map((pos, i) => `
          <div class="position-item" style="margin-bottom: 15px; padding: 12px; background: #f8f9fa; border-radius: 6px; border-left: 4px solid #007bff;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
              <span style="font-weight: bold; color: #495057;">#${i+1}</span>
              <span style="color: #6c757d; font-size: 0.85rem;">${formatDateTime(pos.created_at)}</span>
            </div>
            <div style="display: flex; gap: 20px;">
              <div style="flex: 1;">
                <div style="font-size: 0.8rem; color: #6c757d;">Latitude</div>
                <div style="font-weight: 600; color: #28a745;">${parseFloat(pos.lat).toFixed(6)}</div>
              </div>
              <div style="flex: 1;">
                <div style="font-size: 0.8rem; color: #6c757d;">Longitude</div>
                <div style="font-weight: 600; color: #17a2b8;">${parseFloat(pos.lon).toFixed(6)}</div>
              </div>
            </div>
          </div>
        `).join('');
        
        showModal(
          `📋 Position History: ${selectedRobot.name}`,
          `<div>${positionsHtml}</div>`,
          'positions',
          data.positions
        );
      } else {
        showModal(
          'No History Found',
          'No position history found for this robot. Try moving the robot first!',
          'info'
        );
      }
    } catch (err) {
      console.error('Error:', err);
      showModal('Error', 'Could not fetch position history. Please try again.', 'error');
    }
  };

  const handleShowStatistics = async () => {
    if (!selectedRobot) return;
    
    try {
      const token = localStorage.getItem('fleet_token');
      const response = await fetch(
        `http://localhost:3000/robots/${selectedRobot.id}/statistics`, 
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      
      if (!response.ok) throw new Error('API error');
      
      const data = await response.json();
      const stats = data.statistics || {};
      
      const statsHtml = `
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
          <div class="stat-card" style="padding: 15px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 8px; text-align: center;">
            <div style="font-size: 2rem; font-weight: bold;">${stats.positionCount || 0}</div>
            <div style="font-size: 0.85rem; opacity: 0.9;">Total Positions</div>
          </div>
          
          <div class="stat-card" style="padding: 15px; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; border-radius: 8px; text-align: center;">
            <div style="font-size: 2rem; font-weight: bold;">${stats.approximateDistanceKm || '0.00'}</div>
            <div style="font-size: 0.85rem; opacity: 0.9;">Distance (km)</div>
          </div>
          
          <div class="stat-card" style="padding: 15px; background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white; border-radius: 8px; text-align: center; grid-column: span 2;">
            <div style="font-size: 1.2rem; margin-bottom: 5px;">Active Since</div>
            <div style="font-size: 1.1rem; font-weight: 600;">
              ${stats.activeSince ? formatDateTime(stats.activeSince) : 'N/A'}
            </div>
          </div>
        </div>
        
        ${stats.firstPosition ? `
          <div style="margin-top: 20px; padding: 15px; background: #e8f4fd; border-radius: 8px; border: 1px solid #b3d7ff;">
            <div style="font-weight: bold; color: #0066cc; margin-bottom: 10px;">📍 First Recorded Position</div>
            <div style="display: flex; gap: 20px; align-items: center;">
              <div style="flex: 1;">
                <div style="font-size: 0.85rem; color: #666;">Date & Time</div>
                <div style="font-weight: 600;">${formatDateTime(stats.firstPosition.created_at)}</div>
              </div>
              <div style="flex: 1;">
                <div style="font-size: 0.85rem; color: #666;">Coordinates</div>
                <div style="font-family: monospace; color: #28a745;">
                  ${parseFloat(stats.firstPosition.lat).toFixed(6)}, ${parseFloat(stats.firstPosition.lon).toFixed(6)}
                </div>
              </div>
            </div>
          </div>
        ` : ''}
      `;
      
      showModal(
        `📊 Statistics: ${selectedRobot.name}`,
        statsHtml,
        'statistics',
        stats
      );
    } catch (err) {
      console.error('Error:', err);
      showModal('Error', 'Could not fetch statistics. Please try again.', 'error');
    }
  };

  const handleShowRecentActivity = async () => {
    try {
      const token = localStorage.getItem('fleet_token');
      const response = await fetch(
        `http://localhost:3000/positions/recent?limit=5`, 
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      
      if (!response.ok) throw new Error('API error');
      
      const data = await response.json();
      
      if (data.positions && data.positions.length > 0) {
        const activityHtml = data.positions.map((pos, i) => `
          <div class="activity-item" style="margin-bottom: 15px; padding: 12px; background: #fff; border-radius: 6px; border: 1px solid #e9ecef; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; align-items: center;">
              <span style="display: flex; align-items: center; gap: 8px;">
                <span style="background: #${i === 0 ? '007bff' : i === 1 ? '28a745' : i === 2 ? 'ffc107' : '6c757d'}; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem;">
                  ${i+1}
                </span>
                <span style="font-weight: bold; color: #495057;">${pos.robot_name || 'Unknown Robot'}</span>
              </span>
              <span style="color: #6c757d; font-size: 0.85rem;">${formatDateTime(pos.created_at)}</span>
            </div>
            <div style="display: flex; gap: 15px; font-family: monospace;">
              <div style="flex: 1;">
                <div style="font-size: 0.8rem; color: #6c757d;">Latitude</div>
                <div style="color: #28a745;">${parseFloat(pos.lat).toFixed(6)}</div>
              </div>
              <div style="flex: 1;">
                <div style="font-size: 0.8rem; color: #6c757d;">Longitude</div>
                <div style="color: #17a2b8;">${parseFloat(pos.lon).toFixed(6)}</div>
              </div>
            </div>
          </div>
        `).join('');
        
        showModal(
          '🔄 Recent System Activity',
          activityHtml,
          'activity',
          data.positions
        );
      } else {
        showModal(
          'No Recent Activity',
          'No recent position updates in the system.',
          'info'
        );
      }
    } catch (err) {
      console.error('Error:', err);
      showModal('Error', 'Could not fetch recent activity.', 'error');
    }
  };

  // Login Form
  if (!token) {
    return (
      <div className="app-container">
        <div className="login-container">
          <div className="login-card">
            <div className="login-header">
              <h1 className="app-title">Mini-Fleet Monitor</h1>
              <p className="app-subtitle">Virtual Robot Fleet Management System</p>
            </div>
            
            {error && (
              <div className="error-alert">
                <strong>Error:</strong> {error}
              </div>
            )}
            
            <form onSubmit={handleLogin} className="login-form">
              <div className="form-group">
                <label htmlFor="email">Email Address</label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@test.com"
                  required
                  disabled={loading}
                  autoComplete="username"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="password">Password</label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="test123"
                  required
                  disabled={loading}
                  autoComplete="current-password"
                />
              </div>
              
              <button 
                type="submit" 
                className="login-button"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner-small"></span>
                    Logging in...
                  </>
                ) : 'Login'}
              </button>
            </form>
            
            <div className="login-info">
              <h4>Test Credentials</h4>
              <p><strong>Email:</strong> admin@test.com</p>
              <p><strong>Password:</strong> test123</p>
            </div>
            
            <div className="system-status">
              <h4>System Status</h4>
              <div className="status-indicators">
                <div className="status-item">
                  <span className="status-label">Backend API</span>
                  <span className="status-value status-good">Connected</span>
                </div>
                <div className="status-item">
                  <span className="status-label">Database</span>
                  <span className="status-value status-good">Connected</span>
                </div>
                <div className="status-item">
                  <span className="status-label">WebSocket</span>
                  <span className="status-value status-good">Ready</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Dashboard (Logged in)
  return (
    <div className="app-container">
      {/* Modal Overlay */}
      {modalVisible && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className={`modal-header modal-${modalType}`}>
              <h3 className="modal-title">
                {modalType === 'positions' && '📍 '}
                {modalType === 'statistics' && '📊 '}
                {modalType === 'activity' && '🔄 '}
                {modalType === 'success' && '✅ '}
                {modalType === 'error' && '❌ '}
                {modalTitle}
              </h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <div className="modal-body" dangerouslySetInnerHTML={{ __html: modalContent }} />
            <div className="modal-footer">
              <button className="modal-button primary" onClick={closeModal}>
                Close
              </button>
              {modalType === 'positions' && modalData && (
                <button className="modal-button secondary" onClick={() => {
                  const csvContent = modalData.map(pos => 
                    `${pos.robot_id},${pos.lat},${pos.lon},"${pos.created_at}"`
                  ).join('\n');
                  const blob = new Blob([csvContent], { type: 'text/csv' });
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `robot-positions-${selectedRobot?.name || 'data'}.csv`;
                  a.click();
                  showModal('Success', 'CSV file downloaded successfully!', 'success');
                }}>
                  Download CSV
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      
      <header className="app-header">
        <div className="header-content">
          <div className="header-left">
            <h1 className="app-title">Mini-Fleet Monitor</h1>
            <div className="header-subtitle">Live Robot Tracking System</div>
          </div>
          
          <div className="header-right">
            <div className="user-info">
              <div className="user-email">{user?.email}</div>
              <div className="connection-status">
                <span className={`ws-status ${webSocketConnected ? 'connected' : 'disconnected'}`}>
                  {webSocketConnected ? 'Live' : 'Offline'}
                </span>
                <span className="clients-count">{connectedClients} clients</span>
              </div>
            </div>
            <button onClick={handleLogout} className="logout-button">
              Logout
            </button>
          </div>
        </div>
      </header>
      
      <main className="dashboard-container">
        {/* View Mode Toggle */}
        <div className="view-mode-toggle">
          <button 
            className={`toggle-button ${viewMode === 'map' ? 'active' : ''}`}
            onClick={() => setViewMode('map')}
          >
            Map View
          </button>
          <button 
            className={`toggle-button ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
          >
            List View
          </button>
        </div>
        
        {/* Controls */}
        <div className="dashboard-controls">
          <div className="control-section">
            <h3>Robot Controls</h3>
            <div className="control-buttons">
              <button 
                onClick={fetchRobots} 
                className="control-button primary"
                disabled={loading}
              >
                Refresh Robots
              </button>
              <button 
                onClick={handleAddRobot} 
                className="control-button success"
              >
                Add New Robot
              </button>
              {robots.length > 0 && (
                <button 
                  onClick={() => {
                    const randomRobot = robots[Math.floor(Math.random() * robots.length)];
                    handleMoveRobot(randomRobot.id);
                  }} 
                  className="control-button warning"
                >
                  Move Random Robot
                </button>
              )}
            </div>
          </div>
          
          <div className="control-section">
            <h3>Simulation</h3>
            <div className="control-buttons">
              {!simulationActive ? (
                <button 
                  onClick={handleStartSimulation} 
                  className="control-button danger"
                  disabled={robots.length === 0}
                >
                  Start Auto-Simulation
                </button>
              ) : (
                <button 
                  onClick={handleStopSimulation} 
                  className="control-button secondary"
                >
                  Stop Simulation
                </button>
              )}
            </div>
            <div className="simulation-info">
              {simulationActive && (
                <div className="simulation-active">
                  <span className="pulse-dot"></span>
                  Auto-moving robots every 2 seconds
                </div>
              )}
            </div>
          </div>
          
          <div className="stats-display">
            <div className="stat-card">
              <div className="stat-icon">🤖</div>
              <div className="stat-content">
                <div className="stat-value">{robots.length}</div>
                <div className="stat-label">Active Robots</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">📡</div>
              <div className="stat-content">
                <div className="stat-value">{connectedClients}</div>
                <div className="stat-label">Connected</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">⚡</div>
              <div className="stat-content">
                <div className="stat-value status-value">
                  {simulationActive ? 'Running' : 'Idle'}
                </div>
                <div className="stat-label">Simulation</div>
              </div>
            </div>
          </div>
          
          {/* Debug button and test button */}
          <div className="debug-info">
            <button 
              onClick={debugMap}
              className="debug-button"
            >
              Debug Info
            </button>
            
            {/* Temporary test button */}
            <div className="debug-test mt-3">
              <button 
                onClick={() => {
                  console.log('=== DEBUG INFO ===');
                  console.log('Selected Robot:', selectedRobot);
                  console.log('Selected Robot ID:', selectedRobot?.id);
                  console.log('RobotHistory imported:', typeof RobotHistory);
                  
                  if (selectedRobot) {
                    showModal(
                      'Debug Info',
                      `Selected Robot: ${selectedRobot.name}<br>
                       ID: ${selectedRobot.id}<br>
                       Status: ${selectedRobot.status}<br>
                       Position: ${formatCoordinate(selectedRobot.lat)}, ${formatCoordinate(selectedRobot.lon)}`,
                      'info'
                    );
                  } else {
                    showModal('Info', 'No robot selected - cannot show position history', 'info');
                  }
                }}
                className="btn btn-warning btn-sm"
                style={{
                  backgroundColor: '#ffc107',
                  color: '#000',
                  border: '1px solid #ffc107',
                  padding: '5px 10px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Debug Position History
              </button>
            </div>
          </div>
        </div>
        
        {error && (
          <div className="error-alert dashboard-error">
            <strong>Error:</strong> {error}
            <button onClick={() => setError('')} className="error-close">×</button>
          </div>
        )}
        
        {/* Main Content Area */}
        <div className="main-content">
          {/* Map View with Robot List */}
          {viewMode === 'map' && (
            <div className="map-with-list-container">
              <div className="map-section">
                <div className="map-header">
                  <div className="map-header-left">
                    <h2>Robot Locations</h2>
                    <p className="map-subtitle">
                      {robots.length} robots visible • Click markers for details
                    </p>
                  </div>
                  <div className="map-actions">
                    <button 
                      onClick={fetchRobots}
                      className="action-button"
                      disabled={loading}
                    >
                      {loading ? 'Refreshing...' : 'Refresh Map'}
                    </button>
                    {selectedRobot && (
                      <button 
                        onClick={() => handleMoveRobot(selectedRobot.id)}
                        className="action-button primary"
                      >
                        Move Selected
                      </button>
                    )}
                    <button 
                      onClick={() => {
                        if (robots.length > 0) {
                          showModal(
                            'Map Information',
                            `Map showing <strong>${robots.length}</strong> robots<br>
                             Valid coordinates: <strong>${robots.filter(r => !isNaN(parseFloat(r.lat)) && !isNaN(parseFloat(r.lon))).length}</strong><br>
                             Simulation: <strong>${simulationActive ? 'Active' : 'Inactive'}</strong><br>
                             WebSocket: <strong>${webSocketConnected ? 'Connected' : 'Disconnected'}</strong>`,
                            'info'
                          );
                        }
                      }}
                      className="action-button"
                    >
                      Map Info
                    </button>
                  </div>
                </div>
                
                <div className="map-wrapper">
                  <MapComponent 
                    robots={robots}
                    selectedRobot={selectedRobot}
                    onRobotSelect={handleRobotSelect}
                  />
                </div>
              </div>
              
              <div className="robot-list-section">
                <div className="list-header">
                  <h3>Robot List</h3>
                  <span className="list-count">{robots.length} robots</span>
                </div>
                
                <div className="robot-list-container">
                  {loading ? (
                    <div className="loading-container">
                      <div className="spinner"></div>
                      <p>Loading robots...</p>
                    </div>
                  ) : robots.length === 0 ? (
                    <div className="empty-state">
                      <p>No robots found. Add your first robot!</p>
                    </div>
                  ) : (
                    <div className="robot-list">
                      {robots.map(robot => {
                        const isSelected = selectedRobot?.id === robot.id;
                        return (
                          <div 
                            key={robot.id} 
                            className={`robot-list-item ${isSelected ? 'selected' : ''}`}
                            onClick={() => handleRobotSelect(robot)}
                          >
                            <div className="robot-list-header">
                              <div className="robot-list-name">
                                <span className="robot-name">{robot.name}</span>
                                <span className="robot-id">#{robot.id}</span>
                              </div>
                              <span className={`robot-status ${robot.status}`}>
                                {robot.status}
                              </span>
                            </div>
                            
                            <div className="robot-list-details">
                              <div className="detail-item">
                                <span className="detail-label">Position:</span>
                                <span className="detail-value">
                                  {formatCoordinate(robot.lat)}, {formatCoordinate(robot.lon)}
                                </span>
                              </div>
                              <div className="detail-item">
                                <span className="detail-label">Last Updated:</span>
                                <span className="detail-value">
                                  {formatTime(robot.updated_at)}
                                </span>
                              </div>
                            </div>
                            
                            <div className="robot-list-actions">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveRobot(robot.id);
                                }}
                                className="list-action-button"
                              >
                                Move
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  showModal(
                                    `Robot Details: ${robot.name}`,
                                    `<div style="display: grid; gap: 10px;">
                                      <div style="display: flex; gap: 15px;">
                                        <div style="flex: 1;">
                                          <div style="font-size: 0.9rem; color: #6c757d;">Name</div>
                                          <div style="font-weight: 600;">${robot.name}</div>
                                        </div>
                                        <div style="flex: 1;">
                                          <div style="font-size: 0.9rem; color: #6c757d;">ID</div>
                                          <div style="font-family: monospace;">${robot.id}</div>
                                        </div>
                                      </div>
                                      <div style="display: flex; gap: 15px;">
                                        <div style="flex: 1;">
                                          <div style="font-size: 0.9rem; color: #6c757d;">Status</div>
                                          <div style="font-weight: 600; color: ${robot.status === 'moving' ? '#28a745' : '#6c757d'};">${robot.status.toUpperCase()}</div>
                                        </div>
                                        <div style="flex: 1;">
                                          <div style="font-size: 0.9rem; color: #6c757d;">Valid Coordinates</div>
                                          <div style="font-weight: 600; color: ${!isNaN(parseFloat(robot.lat)) && !isNaN(parseFloat(robot.lon)) ? '#28a745' : '#dc3545'};">${!isNaN(parseFloat(robot.lat)) && !isNaN(parseFloat(robot.lon)) ? 'YES' : 'NO'}</div>
                                        </div>
                                      </div>
                                      <div style="background: #f8f9fa; padding: 12px; border-radius: 6px; margin-top: 5px;">
                                        <div style="font-size: 0.9rem; color: #6c757d;">Position</div>
                                        <div style="font-family: monospace; font-weight: 600;">${formatCoordinate(robot.lat)}, ${formatCoordinate(robot.lon)}</div>
                                      </div>
                                      <div style="font-size: 0.9rem; color: #6c757d;">
                                        Last Updated: ${new Date(robot.updated_at).toLocaleString()}
                                      </div>
                                    </div>`,
                                    'info'
                                  );
                                }}
                                className="list-action-button secondary"
                              >
                                Details
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* Full List View */}
          {viewMode === 'list' && (
            <div className="list-view">
              <div className="section-header">
                <h2>Robot Fleet ({robots.length})</h2>
                <div className="section-actions">
                  <span className="last-updated">
                    Last updated: {new Date().toLocaleTimeString()}
                  </span>
                </div>
              </div>
              
              {loading ? (
                <div className="loading-container">
                  <div className="spinner"></div>
                  <p>Loading robots...</p>
                </div>
              ) : robots.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">🤖</div>
                  <h3>No Robots Found</h3>
                  <p>Add your first robot to get started!</p>
                  <button onClick={handleAddRobot} className="empty-action-button">
                    Create First Robot
                  </button>
                </div>
              ) : (
                <div className="robots-grid">
                  {robots.map(robot => {
                    const lat = formatCoordinate(robot.lat);
                    const lon = formatCoordinate(robot.lon);
                    
                    return (
                      <div 
                        key={robot.id} 
                        className={`robot-card ${selectedRobot?.id === robot.id ? 'selected' : ''}`}
                        onClick={() => handleRobotSelect(robot)}
                      >
                        <div className="robot-card-header">
                          <div className="robot-title">
                            <h3 className="robot-name">{robot.name}</h3>
                            <span className="robot-id">#{robot.id}</span>
                          </div>
                          <span className={`robot-status ${robot.status}`}>
                            {robot.status === 'moving' ? 'Moving' : 'Idle'}
                          </span>
                        </div>
                        
                        <div className="robot-details">
                          <div className="detail-row">
                            <span className="detail-label">Position:</span>
                            <span className="detail-value coordinate">
                              {lat}, {lon}
                            </span>
                          </div>
                          <div className="detail-row">
                            <span className="detail-label">Last Updated:</span>
                            <span className="detail-value">
                              {formatTime(robot.updated_at)}
                            </span>
                          </div>
                          <div className="detail-row">
                            <span className="detail-label">Status:</span>
                            <span className={`detail-value status-${robot.status}`}>
                              {robot.status.toUpperCase()}
                            </span>
                          </div>
                        </div>
                        
                        <div className="robot-actions">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveRobot(robot.id);
                            }}
                            className="action-button move-button"
                          >
                            Move Robot
                          </button>
                          <button 
                            className="action-button details-button"
                            onClick={(e) => {
                              e.stopPropagation();
                              showModal(
                                `Robot Details: ${robot.name}`,
                                `<div style="display: grid; gap: 15px;">
                                  <div style="display: flex; gap: 20px; align-items: center;">
                                    <div style="width: 50px; height: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 1.5rem;">
                                      🤖
                                    </div>
                                    <div>
                                      <div style="font-size: 1.5rem; font-weight: bold;">${robot.name}</div>
                                      <div style="color: #6c757d;">ID: ${robot.id}</div>
                                    </div>
                                  </div>
                                  
                                  <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
                                    <div style="padding: 12px; background: #f8f9fa; border-radius: 6px;">
                                      <div style="font-size: 0.9rem; color: #6c757d;">Status</div>
                                      <div style="font-size: 1.1rem; font-weight: 600; color: ${robot.status === 'moving' ? '#28a745' : '#6c757d'};">${robot.status.toUpperCase()}</div>
                                    </div>
                                    <div style="padding: 12px; background: #f8f9fa; border-radius: 6px;">
                                      <div style="font-size: 0.9rem; color: #6c757d;">Coordinates Valid</div>
                                      <div style="font-size: 1.1rem; font-weight: 600; color: ${!isNaN(parseFloat(robot.lat)) && !isNaN(parseFloat(robot.lon)) ? '#28a745' : '#dc3545'};">${!isNaN(parseFloat(robot.lat)) && !isNaN(parseFloat(robot.lon)) ? 'YES' : 'NO'}</div>
                                    </div>
                                  </div>
                                  
                                  <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 15px; border-radius: 8px;">
                                    <div style="font-size: 0.9rem; opacity: 0.9;">Current Position</div>
                                    <div style="font-size: 1.3rem; font-family: monospace; font-weight: bold; margin-top: 5px;">${lat}, ${lon}</div>
                                  </div>
                                  
                                  <div style="color: #6c757d; font-size: 0.9rem;">
                                    Last updated: ${new Date(robot.updated_at).toLocaleString()}
                                  </div>
                                </div>`,
                                'info'
                              );
                            }}
                          >
                            Details
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Selected Robot Details */}
        {selectedRobot && (
          <div className="selected-robot-details">
            <div className="details-header">
              <h3>Selected Robot: {selectedRobot.name}</h3>
              <button onClick={() => setSelectedRobot(null)} className="close-button">
                ×
              </button>
            </div>
            
            <div className="robot-detail-grid">
              <div className="detail-item">
                <span className="detail-label">ID:</span>
                <span className="detail-value">{selectedRobot.id}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Status:</span>
                <span className={`detail-value status-${selectedRobot.status}`}>
                  {selectedRobot.status.toUpperCase()}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Position:</span>
                <span className="detail-value">
                  {formatCoordinate(selectedRobot.lat)}, {formatCoordinate(selectedRobot.lon)}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Last Updated:</span>
                <span className="detail-value">
                  {formatTime(selectedRobot.updated_at)}
                </span>
              </div>
            </div>
            
            <div className="detail-actions">
              <button 
                onClick={() => handleMoveRobot(selectedRobot.id)}
                className="detail-action-button primary"
              >
                Move This Robot
              </button>
              <button 
                className="detail-action-button secondary"
                onClick={() => {
                  showModal(
                    `Robot Details: ${selectedRobot.name}`,
                    `<div style="display: grid; gap: 20px;">
                      <div style="display: flex; gap: 20px; align-items: center;">
                        <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 2rem;">
                          🤖
                        </div>
                        <div>
                          <div style="font-size: 1.8rem; font-weight: bold;">${selectedRobot.name}</div>
                          <div style="color: #6c757d; font-size: 1.1rem;">Robot ID: ${selectedRobot.id}</div>
                        </div>
                      </div>
                      
                      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
                        <div style="padding: 15px; background: #e8f4fd; border-radius: 8px; text-align: center;">
                          <div style="font-size: 0.9rem; color: #0066cc;">Status</div>
                          <div style="font-size: 1.2rem; font-weight: 600; color: ${selectedRobot.status === 'moving' ? '#28a745' : '#6c757d'}; margin-top: 5px;">${selectedRobot.status.toUpperCase()}</div>
                        </div>
                        <div style="padding: 15px; background: #e8f4fd; border-radius: 8px; text-align: center;">
                          <div style="font-size: 0.9rem; color: #0066cc;">Latitude</div>
                          <div style="font-size: 1.2rem; font-weight: 600; color: #28a745; margin-top: 5px;">${formatCoordinate(selectedRobot.lat)}</div>
                        </div>
                        <div style="padding: 15px; background: #e8f4fd; border-radius: 8px; text-align: center;">
                          <div style="font-size: 0.9rem; color: #0066cc;">Longitude</div>
                          <div style="font-size: 1.2rem; font-weight: 600; color: #17a2b8; margin-top: 5px;">${formatCoordinate(selectedRobot.lon)}</div>
                        </div>
                      </div>
                      
                      <div style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white; padding: 20px; border-radius: 10px; text-align: center;">
                        <div style="font-size: 1.1rem;">Current Position</div>
                        <div style="font-size: 1.5rem; font-family: monospace; font-weight: bold; margin-top: 10px;">
                          ${formatCoordinate(selectedRobot.lat)}, ${formatCoordinate(selectedRobot.lon)}
                        </div>
                      </div>
                      
                      <div style="color: #6c757d; font-size: 1rem; text-align: center;">
                        Last updated: ${new Date(selectedRobot.updated_at).toLocaleString()}
                      </div>
                    </div>`,
                    'info'
                  );
                }}
              >
                View Full Details
              </button>
            </div>
            
            {/* ===== POSITION HISTORY ===== */}
            <div className="simple-position-history mt-4">
              <div className="card" style={{ border: '1px solid #dee2e6', borderRadius: '8px' }}>
                <div className="card-header" style={{ 
                  backgroundColor: '#f8f9fa', 
                  borderBottom: '1px solid #dee2e6',
                  padding: '12px 16px'
                }}>
                  <h5 style={{ margin: 0 }}>
                    📍 Position History: {selectedRobot.name}
                  </h5>
                </div>
                <div className="card-body" style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' }}>
                    <button 
                      className="btn btn-outline-primary btn-sm"
                      onClick={handleShowPositions}
                      style={{
                        backgroundColor: 'transparent',
                        border: '1px solid #007bff',
                        color: '#007bff',
                        padding: '8px 16px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        transition: 'all 0.3s'
                      }}
                      onMouseOver={(e) => {
                        e.target.style.backgroundColor = '#007bff';
                        e.target.style.color = 'white';
                      }}
                      onMouseOut={(e) => {
                        e.target.style.backgroundColor = 'transparent';
                        e.target.style.color = '#007bff';
                      }}
                    >
                      Show Last 10 Positions
                    </button>
                    
                    <button 
                      className="btn btn-outline-info btn-sm"
                      onClick={handleShowStatistics}
                      style={{
                        backgroundColor: 'transparent',
                        border: '1px solid #17a2b8',
                        color: '#17a2b8',
                        padding: '8px 16px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        transition: 'all 0.3s'
                      }}
                      onMouseOver={(e) => {
                        e.target.style.backgroundColor = '#17a2b8';
                        e.target.style.color = 'white';
                      }}
                      onMouseOut={(e) => {
                        e.target.style.backgroundColor = 'transparent';
                        e.target.style.color = '#17a2b8';
                      }}
                    >
                      Show Statistics
                    </button>
                    
                    <button 
                      className="btn btn-outline-success btn-sm"
                      onClick={handleShowRecentActivity}
                      style={{
                        backgroundColor: 'transparent',
                        border: '1px solid #28a745',
                        color: '#28a745',
                        padding: '8px 16px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        transition: 'all 0.3s'
                      }}
                      onMouseOver={(e) => {
                        e.target.style.backgroundColor = '#28a745';
                        e.target.style.color = 'white';
                      }}
                      onMouseOut={(e) => {
                        e.target.style.backgroundColor = 'transparent';
                        e.target.style.color = '#28a745';
                      }}
                    >
                      Recent System Activity
                    </button>
                  </div>
                  
                  <div style={{ fontSize: '12px', color: '#6c757d', padding: '10px', background: '#f8f9fa', borderRadius: '4px' }}>
                    <strong>Tip:</strong> Move robots to generate position history. Each movement is saved to the database.
                    Click the buttons above to view detailed information in beautiful modals!
                  </div>
                </div>
              </div>
            </div>
            {/* ===== END POSITION HISTORY ===== */}
          </div>
        )}
        
        {/* System Info */}
        <div className="system-info">
          <h3>System Information</h3>
          <div className="info-grid">
            <div className="info-card">
              <h4>Connections</h4>
              <ul>
                <li>WebSocket: <span className={webSocketConnected ? 'status-good' : 'status-bad'}>
                  {webSocketConnected ? 'Connected' : 'Disconnected'}
                </span></li>
                <li>Connected Clients: <strong>{connectedClients}</strong></li>
                <li>API Endpoint: <code>http://localhost:3000</code></li>
              </ul>
            </div>
            <div className="info-card">
              <h4>Simulation</h4>
              <ul>
                <li>Status: <span className={simulationActive ? 'status-warning' : 'status-good'}>
                  {simulationActive ? 'ACTIVE' : 'INACTIVE'}
                </span></li>
                <li>Interval: <strong>2000ms</strong></li>
                <li>Last Update: <strong>{new Date().toLocaleTimeString()}</strong></li>
              </ul>
            </div>
            <div className="info-card">
              <h4>Quick Actions</h4>
              <div className="quick-actions">
                <button onClick={() => window.open('http://localhost:3000', '_blank')}>
                  Open API Docs
                </button>
                <button onClick={() => window.open('http://localhost:3000/health', '_blank')}>
                  Check Health
                </button>
                <button onClick={() => {
                  if (robots.length > 0) {
                    robots.forEach((robot, index) => {
                      setTimeout(() => handleMoveRobot(robot.id), index * 1000);
                    });
                    showModal('Info', `Moving all ${robots.length} robots sequentially...`, 'info');
                  }
                }}>
                  Move All Robots
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
      
      <footer className="app-footer">
        <div className="footer-content">
          <p>
            <strong>Mini-Fleet Monitor v1.0.0</strong> | 
            Backend: <code>http://localhost:3000</code> | 
            Frontend: <code>http://localhost:8080</code> |
            WebSocket: <code>ws://localhost:3000/ws</code>
          </p>
          <p className="footer-note">
            Real-time robot tracking system with WebSocket updates, Redis caching, and JWT authentication
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;