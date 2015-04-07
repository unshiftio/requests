'use strict';

var EventEmitter = require('eventemitter3')
  , listeners = require('loads')
  , send = require('xhr-send')
  , hang = require('hang')
  , AXO = require('axo');

/**
 * Optionally get a configuration value somewhere.
 *
 * @param {Object} options Optional configuration that needs default properties.
 * @api private
 */
function optional(options) {
  for (var key in Requests.defaults) {
    options[key] = key in options ? options[key] : Requests.defaults[key];
  }

  return options;
}

/**
 * RequestS(tream).
 *
 * Options:
 *
 * - streaming: Should the request be streaming.
 * - method: Which HTTP method should be used.
 * - headers: Additional request headers.
 * - mode: Enable CORS mode.
 * - body: The payload for the request.
 *
 * @constructor
 * @param {String} url The URL we want to request.
 * @param {Object} options Various of request options.
 * @api public
 */
function Requests(url, options) {
  if (!(this instanceof Requests)) return new Requests(url, options);
  options = optional(options || {});

  this.offset = 0;
  this.id = Requests.requested++;
  this.streaming = options.streaming;
  this.socket = Requests[Requests.method](options);
  this.socket.open(options.method.toUpperCase(), url, true);

  //
  // We want to implement a stream like interface on top of this module so it
  // can be used to read streaming data in node as well as through browserify.
  //
  this.readable = true;
  this.writable = false;

  //
  // Register this as an active HTTP request.
  //
  Requests.active[this.id] = this;
  if (!options.manual) this.open(options);
}

Requests.prototype = new EventEmitter();
Requests.prototype.constructor = Requests;

/**
 * Initialize and start requesting the supplied resource.
 *
 * @param {Object} options Passed in defaults.
 * @api private
 */
Requests.prototype.open = function open(options) {
  var what
    , requests = this
    , socket = requests.socket;

  requests.on('stream', function stream(data) {
    if (socket.multipart) return requests.emit('data', data);

    //
    // Please note that we need to use a method here that works on both string
    // as well as ArrayBuffer's as we have no certainty that we're receiving
    // text.
    //
    var chunk = data.slice(requests.offset);
    requests.offset = data.length;

    requests.emit('data', chunk);
  });

  requests.on('end', function cleanup() {
    delete Requests.active[requests.id];
  });

  if (options.timeout) {
    socket.timeout = +options.time;
  }

  if ('cors' === options.mode.toLowerCase() && 'withCredentials' in socket) {
    socket.withCredentials = true;
  }

  //
  // We want to prevent pre-flight requests by default for CORS requests so we
  // need to force the content-type to text/plain.
  //
  requests.header('Content-Type', 'text/plain');
  for (what in options.headers) {
    requests.header(what, options.headers[what]);
  }

  //
  // Set the correct responseType method.
  //
  if (requests.streaming) {
    if ('string' === typeof options.body) {
      if ('multipart' in socket) {
        socket.multipart = true;
      } else if (Requests.type.mozchunkedtext) {
        socket.responseType = 'moz-chunked-text';
      } else if (Requests.type.msstream) {
        socket.responseType = 'ms-stream';
      }
    } else {
      if (Requests.type.mozchunkedarraybuffer) {
        socket.responseType = 'moz-chunked-arraybuffer';
      }
    }
  }

  listeners(socket, requests, requests.streaming);
  requests.emit('before', socket);

  send(socket, options.body, hang(function send(err) {
    if (err) {
      requests.emit('error', err);
      requests.emit('end', err);
    }

    requests.emit('send');
  }));
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
  // While we don't technically support the XDomainRequest of IE, we do want to
  // double check that the setRequestHeader is available before adding headers.
  //
  if (value !== undefined && this.socket.setRequestHeader) {
    this.socket.setRequestHeader(key, value +'');
  }

  return this;
};

/**
 * Completely destroy the running XHR and release of the internal references.
 *
 * @returns {Boolean} Successful destruction
 * @api public
 */
Requests.prototype.destroy = function destroy() {
  if (!this.socket) return false;

  this.emit('destroy');

  this.socket.abort();
  this.removeAllListeners();

  this.socket = null;
  delete Requests.active[this.id];

  return true;
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
Requests.method = !!Requests.XHR() ? 'XHR' : (!!Requests.AXO() ? 'AXO' : '');

/**
 * Boolean indicating
 *
 * @type {Boolean}
 * @public
 */
Requests.supported = !!Requests.method;

/**
 * The defaults for the Requests. These values will be used if no options object
 * or matching key is provided. It can be override globally if needed but this
 * is not advised as it can have some potential side affects for other libraries
 * that use this module.
 *
 * @type {Object}
 * @public
 */
Requests.defaults = {
  streaming: false,
  manual: false,
  method: 'GET',
  mode: 'cors',
  headers: {},
};

/**
 * The different type of `responseType` parsers that are supported in this XHR
 * implementation.
 *
 * @type {Object}
 * @public
 */
Requests.type = 'XHR' === Requests.method ? (function detect() {
  var types = 'arraybuffer,blob,document,json,text,moz-blob,moz-chunked-text,moz-chunked-arraybuffer,ms-stream'.split(',')
    , supported = {}
    , type, xhr, prop;

  while (types.length) {
    type = types.pop();

    xhr = Requests.XHR();
    xhr.open('get', '/', true);
    prop = type.replace(/-/g, '');

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
Requests.streaming = 'XHR' === Requests.method && (
     'multipart' in XMLHttpRequest.prototype
  || Requests.type.mozchunkedarraybuffer
  || Requests.type.mozchunkedtext
  || Requests.type.msstream
  || Requests.type.mozblob
);

//
// IE has a bug which causes IE10 to freeze when close WebPage during an XHR
// request: https://support.microsoft.com/kb/2856746
//
// The solution is to completely clean up all active running requests.
//
if (global.attachEvent) global.attachEvent('onunload', function reap() {
  for (var id in Requests.active) {
    Requests.active[id].destroy();
  }
});

//
// Expose the Requests library.
//
module.exports = Requests;
