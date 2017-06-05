'use strict';

module.exports = (function () {
  if ('XMLHttpRequest' in global) {
    return require('./browser');
  }

  var XMLHttpRequest = global.XMLHttpRequest = require('node-http-xhr');
  var Requests = require('./browser');
  delete global.XMLHttpRequest;

  /**
   * Create a new XMLHttpRequest.
   *
   * @returns {XMLHttpRequest} XHR.
   * @api private
   */
  Requests.XHR = function create() {
    return new XMLHttpRequest();
  };

  return Requests;
}());

