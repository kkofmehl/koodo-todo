const {
  getDeviceTokenFromRequest,
  clearDeviceCookie,
} = require('../deviceCookie');

function createRequireAuth(todoStore) {
  return function requireAuth(req, res, next) {
    const token = getDeviceTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const device = todoStore.findDevice(token);
    if (!device) {
      clearDeviceCookie(res);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    todoStore.touchDevice(token);
    req.deviceToken = token;
    req.device = device;
    next();
  };
}

module.exports = { createRequireAuth };
