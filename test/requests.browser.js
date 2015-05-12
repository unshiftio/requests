describe('requests', function () {
  'use strict';

  //
  // Include the Base class that we inherit from to ensure that it's also
  // included in the test run as it should run on both browsers and node.js
  //
  require('./requested');

  var requests = require('../browser')
    , assume = require('assume')
    , req;

  beforeEach(function () {
    req = requests('http://localhost:8080', { manual: true });
  });

  afterEach(function () {
    req.destroy();
  });

  it('is exported as function', function () {
    assume(requests).is.a('function');
  });

  it('increments the internal `.id` for each instance', function () {
    var id = req.id;

    assume(id).equals(requests.requested);

    req.destroy();
    req = requests('http://localhost:8080', { manual: true });

    assume(req.id).is.above(id);
    assume(requests.requested).is.above(id);
  });

  it('sets the stream\'s booleans', function () {
    assume(req.readable).is.true();
    assume(req.writable).is.false();
  });

  it('stores active requests', function () {
    assume(requests.active[req.id]).equals(req);
  });

  describe('#destroy', function () {
    it('removes the .active instance', function () {
      assume(requests.active[req.id]).equals(req);
      req.destroy();
      assume(requests.active[req.id]).is.undefined();
    });
  });
});
