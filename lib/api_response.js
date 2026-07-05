function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function methodNotAllowed(res) {
  res.setHeader('Allow', 'POST, OPTIONS');
  sendJson(res, 405, {
    ok: false,
    error: {
      code: 'METHOD_NOT_ALLOWED',
      message: 'Only POST is supported',
    },
  });
}

async function readJsonBody(req) {
  if (req.body !== undefined) {
    return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function options(res) {
  res.statusCode = 204;
  res.setHeader('Allow', 'POST, OPTIONS');
  res.end();
}

module.exports = {
  methodNotAllowed,
  options,
  readJsonBody,
  sendJson,
};
