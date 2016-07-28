'use strict';

var FetchWrapper = require('./fetch-wrapper.js')
  , Requested = require('./requested')
  , listeners = require('loads')
  , send = require('xhr-send')
  , sameOrigin = require('same-origin')
  , hang = require('hang')
  , AXO = require('axo');

/**
 * Root reference for iframes.
 * Taken from
 * https://github.com/visionmedia/superagent/blob/83892f35fe15676a4567a0eb51eecd096939ad36/lib/client.js#L1
 */
var root;
if (typeof window !== 'undefined') { // Browser window
  root = window;
} else if (typeof self !== 'undefined') { // Web Worker
  root = self;
} else { // Other environments
  console.warn('Using browser-only version of requests in non-browser environment');
  root = this;
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
 * @param {Object} options Various request options.
 * @api public
 */
var Requests = module.exports = Requested.extend({
  constructor: function bobthebuilder(url, options) {
    if (!(this instanceof Requests)) return new Requests(url, options);

    Requested.apply(this, arguments);
  },

  /**
   * The offset of data that we've already previously read
   *
   * @type {Number}
   * @private
   */
  offset: 0,

  /**
   * The requests instance has been fully initialized.
   *
   * @param {String} url The URL we need to connect to.
   * @api private
   */
  initialize: function initialize(url) {
    this.socket = Requests[Requests.method](this);

    //
    // Open the socket BEFORE adding any properties to the instance as this might
    // trigger a thrown `InvalidStateError: An attempt was made to use an object
    // that is not, or is no longer, usable` error in FireFox:
    //
    // @see https://bugzilla.mozilla.org/show_bug.cgi?id=707484
    //
    this.socket.open(this.method.toUpperCase(), url, true);

    //
    // Register this as an active HTTP request.
    //
    Requests.active[this.id] = this;
  },

  /**
   * Initialize and start requesting the supplied resource.
   *
   * @param {String} url The URL we want to request.
   * @param {Object} options Various request options.
   * @api private
   */
  open: function open(url, options) {
    var what
      , requests = this
      , socket = requests.socket;

    var slice = (requests.hasOwnProperty('slice')) ? requests.slice : true;

    requests.on('stream', function stream(data) {
      if (!slice) {
        return requests.emit('data', data);
      }

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

    if (this.timeout) {
      // NOTE the "+" before this.timeout just ensures
      // socket.timeout is a number.
      socket.timeout = +this.timeout;
    }

    // Polyfilling XMLHttpRequest to accept fetch options
    // see https://fetch.spec.whatwg.org/#cors-protocol-and-credentials and
    // https://fetch.spec.whatwg.org/#concept-request-credentials-mode
    //
    // ...credentials mode, which is "omit", "same-origin", or "include".
    // Unless stated otherwise, it is "omit".
    //
    // When request's mode is "navigate", its credentials mode is assumed to
    // be "include" and fetch does not currently account for other values.
    // If HTML changes here, this standard will need corresponding changes.
    if ('withCredentials' in socket) {
      var credentials = this.credentials;
      if (credentials) {
        credentials = credentials.toLowerCase();
      } else if (this.mode) {
        var mode = this.mode.toLowerCase();
        if (mode === 'navigate') {
          credentials = 'include';
        }
      }

      if (credentials) {
        if (credentials === 'include') {
          socket.withCredentials = true;
        } else {
          var origin = root.location.origin || (root.location.protocol + '//' + root.location.host);
          if (credentials === 'same-origin' && sameOrigin(origin, url)) {
            socket.withCredentials = true;
          }
        }
      }
    }

    //
    // ActiveXObject will throw a `Type Mismatch` exception when setting the to
    // an null-value and to be consistent with all XHR implementations we're going
    // to cast the value to a string.
    //
    // While we don't technically support the XDomainRequest of IE, we do want to
    // double check that the setRequestHeader is available before adding headers.
    //
    // Chrome has a bug where it will actually append values to the header instead
    // of overriding it. So if you do a double setRequestHeader(Content-Type) with
    // text/plain and with text/plain again, it will end up as `text/plain,
    // text/plain` as header value. This is why use a headers object as it
    // already eliminates duplicate headers.
    //
    for (what in this.headers) {
      if (this.headers[what] !== undefined && socket.setRequestHeader) {
        socket.setRequestHeader(what, this.headers[what] + '');
      }
    }

    //
    // Set the correct responseType method.
    //
    // TODO how should fetch/ReadableByteStream be handled here?
    if (requests.streaming && (requests.method !== 'FETCH')) {
      if (!this.body || 'string' === typeof this.body) {
        if ('multipart' in socket) {
          socket.multipart = true;
          slice = false;
        } else if (Requests.type.mozchunkedtext) {
          socket.responseType = 'moz-chunked-text';
          slice = false;
        }
      } else {
        if (Requests.type.mozchunkedarraybuffer) {
          socket.responseType = 'moz-chunked-arraybuffer';
        } else if (Requests.type.msstream) {
          socket.responseType = 'ms-stream';
        }
      }
    }

    // Polyfill XMLHttpRequest to use the fetch headers API
    if (!socket.response || !socket.response.headers) {
      socket.response = socket.response || {};
      var responseHeaders = {};
      responseHeaders.get = socket.getResponseHeader;
      socket.response.headers = responseHeaders;
    }
    
    listeners(socket, requests, requests.streaming);

    requests.emit('before', socket);

    if (requests.method !== 'FETCH') {
      send(socket, this.body, hang(function send(err) {
        if (err) {
          requests.emit('error', err);
          requests.emit('end', err);
        }

        // NOTE the send event for fetch is in fetch-wrapper.js
        requests.emit('send');
      }));
    }
  },

  /**
   * Completely destroy the running XHR and release of the internal references.
   *
   * @returns {Boolean} Successful destruction
   * @api public
   */
  destroy: function destroy() {
    if (!this.socket) return false;

    this.emit('destroy');

    this.socket.abort();
    this.removeAllListeners();

    this.headers = {};
    this.socket = null;
    this.body = null;

    delete Requests.active[this.id];

    return true;
  }
});

/**
 * Create a new FetchWrapper.
 *
 * @returns {FetchWrapper}
 * @type {Object} requests
 * @api private
 */
Requests.FETCH = function create(requests) {
  // TODO we need to pass the requests object to FetchWrapper,
  // This seems kludgy because it's not parallel with Requests.XHR and Requests.AXO.
  requests.slice = false;
  return new FetchWrapper(requests); 
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
if (typeof root.ReadableByteStream === 'function') {
  Requests.method = 'FETCH';
} else {
  Requests.method = !!Requests.XHR() ? 'XHR' : (!!Requests.AXO() ? 'AXO' : '');
}

/**
 * Boolean indicating
 *
 * @type {Boolean}
 * @public
 */
Requests.supported = !!Requests.method;

/**
 * The different types of `responseType` parsers that are supported in this XHR
 * implementation.
 *
 * @type {Object}
 * @public
 */
Requests.type = ('XHR' === Requests.method) ? (function detect() {
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
Requests.streaming = (Requests.method === 'FETCH') ||
  (
    (Requests.method === 'XHR') && (
      'multipart' in XMLHttpRequest.prototype ||
      Requests.type.mozchunkedarraybuffer ||
      Requests.type.mozchunkedtext ||
      Requests.type.msstream ||
      Requests.type.mozblob
    )
  );

//
// IE has a bug which causes IE10 to freeze when close WebPage during an XHR
// request: https://support.microsoft.com/kb/2856746
//
// The solution is to completely clean up all active running requests.
//
// TODO global vs. root? do we need both?
if (global.attachEvent) global.attachEvent('onunload', function reap() {
  for (var id in Requests.active) {
    Requests.active[id].destroy();
  }
});

//
// Expose the Requests library.
//
module.exports = Requests;
