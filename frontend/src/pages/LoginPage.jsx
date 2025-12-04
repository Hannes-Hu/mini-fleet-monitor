import React, { useState } from 'react';
import { Container, Card, Row, Col } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoginForm from '../components/LoginForm';
import { login } from '../services/auth';

const LoginPage = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login: authLogin } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (credentials) => {
    setLoading(true);
    setError('');

    try {
      const response = await login(credentials);
      authLogin(response.token);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container fluid className="vh-100 bg-light">
      <Row className="h-100 justify-content-center align-items-center">
        <Col md={6} lg={4}>
          <Card className="shadow">
            <Card.Body className="p-4">
              <div className="text-center mb-4">
                <h2>Mini-Fleet Monitor</h2>
                <p className="text-muted">Login to access the dashboard</p>
              </div>
              <LoginForm
                onSubmit={handleLogin}
                loading={loading}
                error={error}
              />
            </Card.Body>
            <Card.Footer className="text-center text-muted small py-3">
              Virtual Robot Fleet Management System
            </Card.Footer>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default LoginPage;