// From https://github.com/jonnyreeves/chunked-request/blob/4dd6b7568e79a920f6cab3cd4d91d1e8d30b0798/src/impl/fetch.js

//var Requested = require('./requested');
function FetchWrapper(requests) {
  var fetchWrapper = this;
  fetchWrapper.requests = requests;

  var headers = requests.headers;
  var mode = requests.mode;
  var body = requests.body;
  var credentials = requests.credentials;

  var decoder = new TextDecoder();
  fetchWrapper.decoder = decoder;

  fetchWrapper.fetchOptions = {
    headers: headers,
    mode: mode,
    body: body,
    credentials: credentials
  };  
}

FetchWrapper.prototype.onError = function(err) {
  var fetchWrapper = this;
  console.error(err.message);
  console.error(err.stack);
  //fetchWrapper.requests.emit('error', err);
}

FetchWrapper.prototype.pump = function(reader, res) {
  var fetchWrapper = this;
  return reader.read()
    .then(function(result) {
      if (result.done) {
        fetchWrapper.requests.emit('end');
        // NOTE: when result.done = true, result.value will always be null
        return;
      }
      fetchWrapper.requests.emit('stream', fetchWrapper.decoder.decode(result.value));
      return fetchWrapper.pump(reader, res);
    }, function(err) {
      fetchWrapper.requests.emit('error', err);
    });
}

// TODO is the third arg supposed to be "streaming"?
FetchWrapper.prototype.open = function(method, url, streaming) {
  var fetchWrapper = this;
  fetch(url, fetchWrapper.fetchOptions)
    .then(function(res) {
      fetchWrapper.response = res;
      fetchWrapper.requests.emit('send', fetchWrapper);
      return fetchWrapper.pump(res.body.getReader(), res)
    })
    .catch(fetchWrapper.onError);
}

module.exports = FetchWrapper;
