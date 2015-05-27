'use strict';

var Mocha = require('mocha')
  , mochify = require('mochify')
  , wd = process.argv[2] === '--wd';

/**
 * Poor mans kill switch. Kills all active hooks.
 *
 * @api private
 */
function kill() {
  require('async-each')(kill.hooks, function each(fn, next) {
    fn(next);
  }, function done(err) {
    if (err) return process.exit(1);

    process.exit(0);
  });
}

/**
 * All the hooks that need destruction.
 *
 * @type {Array}
 * @private
 */
kill.hooks = [];

//
// This is the magical test runner that setup's all the things and runs various
// of test suites until something starts failing.
//
(function runner(steps) {
  if (!steps.length) return kill(), runner;

  var step = steps.shift();

  step(function unregister(fn) {
    kill.hooks.push(fn);
  }, function register(err) {
    if (err) throw err;

    runner(steps);
  });

  return runner;
})([
  //
  // Start-up a small static file server so we can download files and fixtures
  // inside our PhantomJS test.
  //
  require('./static'),

  //
  // Run the PhantomJS tests now that we have a small static server setup.
  //
  function phantomjs(kill, next) {
    mochify('./test/*.browser.js', {
      reporter: 'spec',
      cover: !wd,
      ui: 'bdd',
      wd: wd
    })
    .bundle(next);
  }
]);
