const { methodNotAllowed, options, readJsonBody, sendJson } = require('../../lib/api_response');
const { requireBody } = require('../../lib/validation');
const { searchPlaces } = require('../../lib/place_search');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return options(res);
  if (req.method !== 'POST') return methodNotAllowed(res);

  try {
    const body = requireBody(await readJsonBody(req));
    const result = searchPlaces(body);
    if (!result.ok) return sendJson(res, 400, result);
    return sendJson(res, 200, result);
  } catch (error) {
    if (error instanceof SyntaxError || error.message === 'request body must be a JSON object') {
      return sendJson(res, 400, {
        ok: false,
        error: {
          code: 'INVALID_REQUEST',
          message: error.message,
        },
      });
    }
    return sendJson(res, 500, {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unexpected server error',
      },
    });
  }
};
