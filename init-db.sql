-- Check if database exists, if not create it
SELECT 'CREATE DATABASE fleet_db'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'fleet_db')\gexec

-- Connect to database
\c fleet_db;

-- Create users table if it doesnt exist
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create robots table if it doesnt exist
CREATE TABLE IF NOT EXISTS robots (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'idle' CHECK (status IN ('idle', 'moving')),
    lat DECIMAL(9,6) NOT NULL,
    lon DECIMAL(9,6) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create robot_positions table for position history
CREATE TABLE IF NOT EXISTS robot_positions (
    id SERIAL PRIMARY KEY,
    robot_id INTEGER NOT NULL REFERENCES robots(id) ON DELETE CASCADE,
    lat DECIMAL(9,6) NOT NULL,
    lon DECIMAL(9,6) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_robot_positions_robot_id ON robot_positions(robot_id);
CREATE INDEX IF NOT EXISTS idx_robot_positions_created_at ON robot_positions(created_at DESC);

-- Insert test user (password: test123) if it doesnt exist
INSERT INTO users (email, password_hash) 
SELECT 'admin@test.com', '$2a$10$X7BZz7Jz7Jz7Jz7Jz7Jz7e7Jz7Jz7Jz7Jz7Jz7Jz7Jz7Jz7Jz7Jz7'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@test.com');

-- Insert sample robots if it doesnt exist
INSERT INTO robots (name, lat, lon) 
SELECT 'Robot Alpha', 52.520008, 13.404954
WHERE NOT EXISTS (SELECT 1 FROM robots WHERE name = 'Robot Alpha');

INSERT INTO robots (name, lat, lon) 
SELECT 'Robot Beta', 52.511, 13.389
WHERE NOT EXISTS (SELECT 1 FROM robots WHERE name = 'Robot Beta');

INSERT INTO robots (name, lat, lon) 
SELECT 'Robot Gamma', 52.525, 13.415
WHERE NOT EXISTS (SELECT 1 FROM robots WHERE name = 'Robot Gamma');

INSERT INTO robots (name, lat, lon) 
SELECT 'Robot Delta', 52.505, 13.395
WHERE NOT EXISTS (SELECT 1 FROM robots WHERE name = 'Robot Delta');