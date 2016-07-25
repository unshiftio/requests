// From https://github.com/jonnyreeves/chunked-request/blob/4dd6b7568e79a920f6cab3cd4d91d1e8d30b0798/src/impl/fetch.js

var EventEmitter = require('eventemitter3');

class FetchWrapper extends EventEmitter {
  constructor(requests) {
    super();
    var fetchWrapper = this;
    fetchWrapper.requests = requests;

    // TODO why doesn't this work?
    //const {headers, mode, body, credentials} = requests;
    var headers = requests.headers;
    var mode = requests.mode;
    var body = requests.body;
    var credentials = requests.credentials;

    const decoder = new TextDecoder();
    fetchWrapper.decoder = decoder;

    fetchWrapper.fetchOptions = {headers, mode, body, credentials};
  }
  
  onError(err) {
    var fetchWrapper = this;
    fetchWrapper.requests.emit('error', err);
  }

  pump(reader, res) {
    var fetchWrapper = this;
    return reader.read()
      .then(result => {
        if (result.done) {
          fetchWrapper.requests.emit('end');
          // NOTE: when result.done = true, result.value will always be null
          return;
        }
        fetchWrapper.requests.emit('stream', fetchWrapper.decoder.decode(result.value));
        return fetchWrapper.pump(reader, res);
      });
  }

  // TODO is streaming the third arg?
  open(method, url, streaming) {
    var fetchWrapper = this;
    fetch(url, fetchWrapper.fetchOptions)
      .then(res => fetchWrapper.pump(res.body.getReader(), res))
      .catch(fetchWrapper.onError);
  }
}

module.exports = FetchWrapper;
