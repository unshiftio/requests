describe('requests', function () {
  'use strict';

  var xhr = require('../browser')
    , assume = require('assume');

  it('is exported as function', function () {
    assume(xhr).is.a('function');
  });
});
