
Requests is a small library that implements fully and true streaming XHR for
browsers that support these methods. It uses a variety of proprietary `responseType`
properties to force a streaming connection. For browsers that don't support
this we will simply fallback to a regular but **async** XHR 1/2 request or
ActiveXObject in even older deprecated browsers.

- Internet Explorer >= 10: `ms-stream`
- FireFox >= 9: `moz-chunked`
- FireFox < 20: `multipart`

```js
var request = require('requests');

request('/foo', { streaming: true })
.header('X-Requested-With', 'XMLHttpRequest')
.once('error', function () { })
.on('data', function () {})
.write();
```
