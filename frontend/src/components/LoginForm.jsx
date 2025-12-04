import React, { useState } from 'react';
import { Form, Button, Alert, Spinner } from 'react-bootstrap';

const LoginForm = ({ onSubmit, loading, error }) => {
  const [email, setEmail] = useState('admin@test.com');
  const [password, setPassword] = useState('test123');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ email, password });
  };

  return (
    <Form onSubmit={handleSubmit}>
      {error && (
        <Alert variant="danger" className="mb-3">
          {error}
        </Alert>
      )}
      
      <Form.Group className="mb-3">
        <Form.Label>Email address</Form.Label>
        <Form.Control
          type="email"
          placeholder="Enter email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
        />
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Label>Password</Form.Label>
        <Form.Control
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={loading}
        />
      </Form.Group>

      <Button 
        variant="primary" 
        type="submit" 
        className="w-100"
        disabled={loading}
      >
        {loading ? (
          <>
            <Spinner
              as="span"
              animation="border"
              size="sm"
              role="status"
              aria-hidden="true"
              className="me-2"
            />
            Logging in...
          </>
        ) : 'Login'}
      </Button>
      
      <div className="text-center mt-3 text-muted small">
        <p>Default credentials:</p>
        <p className="mb-0">Email: admin@test.com</p>
        <p className="mb-0">Password: test123</p>
      </div>
    </Form>
  );
};

export default LoginForm;