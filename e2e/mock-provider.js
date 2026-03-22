/**
 * Mock EIP-1193 provider injected via page.addInitScript() before any page JS runs.
 *
 * Handles eth_requestAccounts / eth_accounts / eth_chainId locally and forwards
 * every other method (including eth_sendTransaction) to the Anvil HTTP RPC.
 * Anvil accounts are unlocked, so eth_sendTransaction works without external signing.
 *
 * Placeholders replaced by fixtures.ts at test time:
 *   __ACCOUNT__      – checksummed test account address
 *   __CHAIN_ID_HEX__ – chain ID as 0x-prefixed hex string (e.g. "0x1")
 *   __RPC_URL__      – Anvil HTTP RPC URL (e.g. "http://127.0.0.1:8545")
 */
(function () {
  var ACCOUNT = '__ACCOUNT__';
  var CHAIN_ID_HEX = '__CHAIN_ID_HEX__';
  var RPC_URL = '__RPC_URL__';

  function rpc(method, params) {
    return fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: method,
        params: params || [],
      }),
    }).then(function (res) {
      return res.json();
    }).then(function (json) {
      if (json.error) {
        var err = new Error(json.error.message);
        err.code = json.error.code;
        throw err;
      }
      return json.result;
    });
  }

  var _listeners = {};

  var mockProvider = {
    isMetaMask: false,
    isMockProvider: true,
    chainId: CHAIN_ID_HEX,
    selectedAddress: ACCOUNT,

    request: function (args) {
      var method = args.method;
      var params = args.params || [];

      if (method === 'eth_requestAccounts' || method === 'eth_accounts') {
        return Promise.resolve([ACCOUNT]);
      }
      if (method === 'eth_chainId') {
        return Promise.resolve(CHAIN_ID_HEX);
      }
      if (method === 'net_version') {
        return Promise.resolve(String(parseInt(CHAIN_ID_HEX, 16)));
      }
      return rpc(method, params);
    },

    on: function (event, handler) {
      if (!_listeners[event]) _listeners[event] = [];
      _listeners[event].push(handler);
    },

    removeListener: function (event, handler) {
      if (!_listeners[event]) return;
      _listeners[event] = _listeners[event].filter(function (h) {
        return h !== handler;
      });
    },
  };

  // Override any pre-existing provider (e.g. MetaMask in a headed browser).
  Object.defineProperty(window, 'ethereum', {
    value: mockProvider,
    writable: true,
    configurable: true,
  });
})();
