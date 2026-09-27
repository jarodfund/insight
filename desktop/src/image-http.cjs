const { Agent } = require("undici");

const IMAGE_TIMEOUT_MS = 960_000;
// Both the provider POST and the loopback tool bridge can spend 16 minutes
// waiting for headers. A signal alone does not override fetch's header timeout.
const imageDispatcher = new Agent({ headersTimeout: IMAGE_TIMEOUT_MS + 30_000, bodyTimeout: IMAGE_TIMEOUT_MS + 30_000 });

module.exports = { IMAGE_TIMEOUT_MS, imageDispatcher };
