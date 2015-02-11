'use strict';

var EventEmitter = require('eventemitter3')
  , AXO = require('axo');

/**
 * RequestS(tream).
 *
 * @constructor
 * @param {String} url The URL we want to request.
 * @param {String} method HTTP method to use.
 * @api public
 */
function Requests(url, options) {
  if (!(this instanceof Requests)) return new Requests(url, options);
  options = options || {};

  this.offset = 0;
  this.id = Requests.requested++;
  this.streaming = options.streaming || false;
  this.socket = Requests[Requests.mode](options);
  this.socket.open(url, options.method.toUppercase(), true);

  //
  // Register this as an active HTTP request.
  //
  Requests.active[this.id] = this;
  this.initialize();
}

Requests.prototype = new EventEmitter();
Requests.prototype.constructor = Requests;
Requests.prototype.emits = require('emits');

/**
 * Initialize and start requesting the supplied resource.
 *
 * @param {Object} options Passed in defaults.
 * @api private
 */
Requests.prototype.initialize = function initialize(options) {
  this.on('stream', function stream() {
    if (this.socket.multipart) return this.emit('data', this.socket.responseText);

    var chunk = this.socket.responseText.slice(this.offset);
    this.offset = this.socket.responseText.length;

    this.emit('data', chunk);
  });

  if (options.timeout) {
    this.socket.timeout = +options.time;
    this.socket.ontimeout = this.emits('timeout');
  }

  if ('cors' === options.mode.toLowerCase() && 'withCredentials' in this.socket) {
    this.socket.withCredentials = true;
  }

  this.socket.send(options.body || null);
};

/**
 * Safely set a request header.
 *
 * @param {String} key Name of the header.
 * @param {String} value Value of the header.
 * @returns {Requests}
 * @api public
 */
Requests.prototype.header = function header(key, value) {
  //
  // ActiveXObject will throw an `Type Mismatch` exception when setting the to
  // an null-value and to be consistent with all XHR implementations we're going
  // to cast the value to a string.
  //
  if (value !== undefined) {
    this.socket.setRequestHeader(key, value +'');
  }

  return this;
};

/**
 * Register a timeout handler.
 *
 * @param {Number} time Maximum duration a request can take.
 * @returns {Requests}
 * @api public
 */
Requests.prototype.timeout = function timeout(time) {
  this.socket.timeout = +time;
  this.socket.ontimeout = this.emits('timeout');
  return this;
};

/**
 * Create a new XMLHttpRequest.
 *
 * @returns {XMLHttpRequest}
 * @api private
 */
Requests.XHR = function create() {
  try { return new XMLHttpRequest(); }
  catch (e) {}
};

/**
 * Create a new ActiveXObject which can be used for XHR.
 *
 * @returns {ActiveXObject}
 * @api private
 */
Requests.AXO = function create() {
  var ids = ['MSXML2.XMLHTTP.6.0', 'MSXML2.XMLHTTP.3.0', 'Microsoft.XMLHTTP']
    , id;

  while (ids.length) {
    id = ids.shift();

    try { return new AXO(id); }
    catch (e) {}
  }
};

/**
 * Status codes that might need to be mapped to something more sane.
 *
 * @type {Object}
 * @private
 */
Requests.status = {
  //
  // If you make a request with a file:// protocol it returns status code 0 by
  // default so we're going to assume 200 instead.
  //
  0: 200,

  //
  // Older version IE incorrectly return status code 1233 for requests that
  // respond with a 204 header.
  //
  // @see http://stackoverflow.com/q/10046972
  //
  1233: 204
};

/**
 * Requests that are currently running.
 *
 * @type {Object}
 * @private
 */
Requests.active = {};

/**
 * Unique id and also an indication on how many XHR requests we've made using
 * this library.
 *
 * @type {Number}
 * @private
 */
Requests.requested = 0;

/**
 * The type of technology we are using to establish a working Ajax connection.
 * This can either be:
 *
 * - XHR: XMLHttpRequest
 * - AXO: ActiveXObject
 *
 * This is also used as internal optimization so we can easily get the correct
 * constructor as we've already feature detected it.
 *
 * @type {String}
 * @public
 */
Requests.mode = !!Requests.XHR() ? 'XHR' : (!!Requests.AXO() ? 'AXO' : '');

/**
 * Boolean indicating
 *
 * @type {Boolean}
 * @public
 */
Requests.supported = !!Requests.mode;

/**
 * The different type of `responseType` parsers that are supported in this XHR
 * implementation.
 *
 * @type {Object}
 * @public
 */
Requests.type = 'XHR' === Requests.mode ? (function detect() {
  var types = 'arraybuffer,blob,document,json,text,moz-blob,moz-chunked-text,moz-chunked-arraybuffer,ms-stream'.split(',')
    , supported = {}
    , type, xhr, prop;

  while (types.length) {
    type = types.pop();

    xhr = Requests.XHR();
    xhr.open('get', '/', true);
    prop = type.replace('-', '');

    //
    // We can only set the `responseType` after we've opened the connection or
    // FireFox will throw an error and according to the spec only async requests
    // can use this, which is fine as we force that by default.
    //
    try {
      xhr.responseType = type;
      supported[prop] = 'response' in xhr && xhr.responseType === type;
    } catch (e) {
      supported[prop] = false;
    }

    xhr = null;
  }

  return supported;
}()) : {};

/**
 * Do we support streaming response parsing.
 *
 * @type {Boolean}
 * @private
 */
Requests.streaming = 'XHR' === Requests.mode && (
     'multipart' in XMLHttpRequest.prototype
  || Requests.type.mozchunkedarraybuffer
  || Requests.type.mozchunkedtext
  || Requests.type.msstream
  || Requests.type.mozblob
);

//
// Expose the Requests library.
//
module.exports = Requests;
