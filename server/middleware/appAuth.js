const jwt = require('jsonwebtoken');

function requireAppAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized. Please log in.'
    });
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2) {
    return res.status(401).json({
      error: 'Invalid authorization format.'
    });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    req.appUser = decoded;

    next();
  } catch (e) {
    console.error('JWT Verify Error:', e);

    return res.status(401).json({
      error:
        e.name === 'TokenExpiredError'
          ? 'Session expired. Please log in again.'
          : 'Invalid token.'
    });
  }
}

function requireAppRole(...roles) {
  return (req, res, next) => {
    if (!req.appUser) {
      return res.status(401).json({
        error: 'Unauthorized.'
      });
    }

    if (!roles.includes(req.appUser.role)) {
      return res.status(403).json({
        error: 'Forbidden.'
      });
    }

    next();
  };
}

module.exports = {
  requireAppAuth,
  requireAppRole
};