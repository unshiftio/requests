```js
var request = require('requests');

request('/foo', { streaming: true })
.header('X-Requested-With', 'XMLHttpRequest')
.once('error', function () { })
.on('data', function () {})
.write();
```
