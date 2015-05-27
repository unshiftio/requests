'use strict';

var fs = require('fs')
  , url = require('url')
  , path = require('path')
  , http = require('http');

module.exports = function staticserver(kill, next) {
  var server = http.createServer(function serve(req, res) {
    var file = path.join(__dirname, url.parse(req.url).pathname);

    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || 'http://localhost');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (!fs.existsSync(file)) {
      res.statusCode = 404;
      return res.end('nope');
    }

    res.statusCode = 200;
    fs.createReadStream(file).pipe(res);
  });

  kill(function close(next) {
    server.close(next);
  });

  server.listen(8080, next);
};

//
// Static server loaded directly.
//
if (require.main === module) module.exports(function kill() {
}, function next(err) {
  if (err) throw err;

  console.log('static server listening on ', this.address());
});
