const { body } = require('express-validator');

const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

const validateRobot = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Robot name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Robot name must be between 2 and 100 characters'),
  body('lat')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  body('lon')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180')
];

module.exports = {
  validateLogin,
  validateRobot
};