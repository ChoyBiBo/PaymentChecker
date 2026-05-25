// Demo account protection — blocks destructive actions for demo accounts
// Applied per-route on any endpoint that modifies real data

const DEMO_ADMIN_USERNAME = 'demo_admin';
const DEMO_APP_USERNAMES = new Set(['demo_homeowner', 'demo_guard']);
const DEMO_ERROR = 'This action is disabled in demo mode.';

/** Blocks write actions for the demo_admin web session */
function blockDemoAdmin(req, res, next) {
  if (req.session?.username === DEMO_ADMIN_USERNAME) {
    return res.status(403).json({ error: DEMO_ERROR });
  }
  next();
}

/** Blocks write actions for demo app users (homeowner / guard) */
function blockDemoAppUser(req, res, next) {
  if (DEMO_APP_USERNAMES.has(req.appUser?.username)) {
    return res.status(403).json({ error: DEMO_ERROR });
  }
  next();
}

module.exports = { blockDemoAdmin, blockDemoAppUser };
