const { methodNotAllowed, options } = require('../lib/api_response');
const { handleChatRequest } = require('../lib/dify_chat_proxy');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return options(res);
  if (req.method !== 'POST') return methodNotAllowed(res);
  return handleChatRequest(req, res);
};
