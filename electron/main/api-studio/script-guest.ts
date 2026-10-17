/**
 * Source of the `pm` API that runs *inside* the QuickJS sandbox.
 *
 * Everything here is evaluated in the guest realm, so scripts only ever touch guest objects:
 * there are no host functions to climb out through. Data comes in as one JSON string and the
 * returned `finish` function hands the results back as one JSON string.
 *
 * The source is plain ES2019 kept as a string (rather than a bundled function) so the build
 * can't rewrite it. No backticks or template placeholders inside — it lives in String.raw.
 */
export const GUEST_PRELUDE = String.raw`(function (inputJson) {
  'use strict';
  var input = JSON.parse(inputJson);
  var stringify = JSON.stringify;
  var parseJson = JSON.parse;
  var MAX_LOGS = 500;
  var MAX_LOG_CHARS = 10000;
  var results = [];
  var logs = [];

  function hasOwn(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }

  function typeOf(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    if (v instanceof RegExp) return 'regexp';
    if (v instanceof Date) return 'date';
    return typeof v;
  }

  function inspect(v) {
    if (typeof v === 'string') return "'" + v + "'";
    if (v === undefined) return 'undefined';
    if (typeof v === 'function') return '[Function' + (v.name ? ' ' + v.name : '') + ']';
    if (typeof v === 'number' || typeof v === 'boolean' || v === null) return String(v);
    if (v instanceof RegExp) return String(v);
    try {
      var s = stringify(v);
      if (s === undefined) return String(v);
      return s.length > 200 ? s.slice(0, 200) + '…' : s;
    } catch (e) {
      return String(v);
    }
  }

  function toText(v) {
    if (typeof v === 'string') return v;
    if (v instanceof Error) return v.name + ': ' + v.message;
    if (v === undefined || typeof v === 'function' || typeof v === 'symbol') return String(v);
    try {
      var s = stringify(v);
      return s === undefined ? String(v) : s;
    } catch (e) {
      return String(v);
    }
  }

  function errorMessage(e) {
    if (e && typeof e === 'object' && typeof e.message === 'string') return e.message;
    return String(e);
  }

  // ---- console -------------------------------------------------------------------------
  function logger(level) {
    return function () {
      if (logs.length >= MAX_LOGS) return;
      var parts = [];
      for (var i = 0; i < arguments.length; i++) parts[parts.length] = toText(arguments[i]);
      var message = parts.join(' ');
      if (message.length > MAX_LOG_CHARS) message = message.slice(0, MAX_LOG_CHARS) + '…';
      logs[logs.length] = { level: level, message: message };
    };
  }
  var console = {
    log: logger('log'),
    info: logger('info'),
    warn: logger('warn'),
    error: logger('error'),
    debug: logger('log')
  };

  // ---- variable scopes -----------------------------------------------------------------
  function storedValue(v) {
    if (typeof v === 'string') return v;
    if (v !== null && typeof v === 'object') {
      try { return stringify(v); } catch (e) { return String(v); }
    }
    return String(v);
  }

  function replaceIn(template, lookup) {
    return String(template).replace(/\{\{\s*([^{}]+?)\s*\}\}/g, function (m, name) {
      var v = lookup(name);
      return v === undefined ? m : v;
    });
  }

  function makeScope(initial) {
    var data = Object.create(null);
    if (initial && typeof initial === 'object') {
      for (var k in initial) if (hasOwn(initial, k)) data[k] = String(initial[k]);
    }
    var scope = {
      get: function (key) { key = String(key); return key in data ? data[key] : undefined; },
      set: function (key, value) { data[String(key)] = storedValue(value); },
      unset: function (key) { delete data[String(key)]; },
      has: function (key) { return String(key) in data; },
      clear: function () { for (var k in data) delete data[k]; },
      toObject: function () {
        var out = {};
        for (var k in data) out[k] = data[k];
        return out;
      },
      replaceIn: function (template) { return replaceIn(template, scope.get); }
    };
    scope.toJSON = scope.toObject;
    return scope;
  }

  var environment = makeScope(input.variables);
  var collectionVariables = makeScope(input.collectionVariables);
  var globals = makeScope(input.globals);

  function resolveVariable(key) {
    key = String(key);
    if (environment.has(key)) return environment.get(key);
    if (collectionVariables.has(key)) return collectionVariables.get(key);
    if (globals.has(key)) return globals.get(key);
    return undefined;
  }

  // Writes go to the environment so they reach the next request (same as before the sandbox).
  var variables = {
    get: resolveVariable,
    set: function (key, value) { environment.set(key, value); },
    unset: function (key) { environment.unset(key); },
    has: function (key) { return resolveVariable(key) !== undefined; },
    toObject: function () {
      var out = {};
      var layers = [globals.toObject(), collectionVariables.toObject(), environment.toObject()];
      for (var i = 0; i < layers.length; i++) for (var k in layers[i]) out[k] = layers[i][k];
      return out;
    },
    replaceIn: function (template) { return replaceIn(template, resolveVariable); }
  };

  // ---- assertions (chai-style subset) --------------------------------------------------
  function AssertionError(message) {
    this.message = message;
    this.stack = '';
  }
  AssertionError.prototype = Object.create(Error.prototype);
  AssertionError.prototype.name = 'AssertionError';
  AssertionError.prototype.constructor = AssertionError;

  function deepEqual(a, b, depth) {
    if (depth > 100) return false;
    if (a === b) return a !== 0 || 1 / a === 1 / b;
    if (typeof a === 'number' && typeof b === 'number') return a !== a && b !== b;
    if (typeOf(a) !== typeOf(b)) return false;
    if (a instanceof Date) return a.getTime() === b.getTime();
    if (a instanceof RegExp) return String(a) === String(b);
    if (!a || !b || typeof a !== 'object') return false;
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (var i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i], depth + 1)) return false;
      return true;
    }
    var ka = Object.keys(a);
    var kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (var j = 0; j < ka.length; j++) {
      if (!hasOwn(b, ka[j]) || !deepEqual(a[ka[j]], b[ka[j]], depth + 1)) return false;
    }
    return true;
  }

  function sizeOf(v) {
    if (typeof v === 'string' || Array.isArray(v)) return v.length;
    if (v instanceof Map || v instanceof Set) return v.size;
    if (v !== null && typeof v === 'object') return Object.keys(v).length;
    return undefined;
  }

  function contains(haystack, needle, deep) {
    if (typeof haystack === 'string') return haystack.indexOf(String(needle)) !== -1;
    if (Array.isArray(haystack)) {
      for (var i = 0; i < haystack.length; i++) {
        if (deep ? deepEqual(haystack[i], needle, 0) : haystack[i] === needle) return true;
      }
      return false;
    }
    if (haystack instanceof Set) return haystack.has(needle);
    if (haystack !== null && typeof haystack === 'object' && needle !== null && typeof needle === 'object') {
      for (var k in needle) {
        if (!hasOwn(needle, k)) continue;
        if (!(k in haystack)) return false;
        if (deep ? !deepEqual(haystack[k], needle[k], 0) : haystack[k] !== needle[k]) return false;
      }
      return true;
    }
    return false;
  }

  function sameMembers(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    var used = [];
    for (var i = 0; i < b.length; i++) {
      var found = false;
      for (var j = 0; j < a.length; j++) {
        if (!used[j] && deepEqual(a[j], b[i], 0)) { used[j] = true; found = true; break; }
      }
      if (!found) return false;
    }
    return true;
  }

  // A getter-style assertion (chai's "to.be.ok") that also works when called ("to.be.ok()").
  function callable(assertion) {
    var fn = function () { return assertion; };
    Object.setPrototypeOf(fn, assertion);
    return fn;
  }

  function expect(actual, customMessage) {
    var flags = { obj: actual, negate: false, deep: false, any: false };
    var a = {};

    function check(passed, message, negatedMessage) {
      if (flags.negate ? passed : !passed) {
        var text = flags.negate ? negatedMessage : message;
        throw new AssertionError(customMessage ? customMessage + ': ' + text : text);
      }
      return a;
    }
    function subject() { return inspect(flags.obj); }

    function chain(name) {
      Object.defineProperty(a, name, { get: function () { return a; } });
    }
    function flag(name, apply) {
      Object.defineProperty(a, name, { get: function () { apply(); return a; } });
    }
    function getterAssertion(names, run) {
      for (var i = 0; i < names.length; i++) {
        Object.defineProperty(a, names[i], { get: function () { run(); return callable(a); } });
      }
    }
    function method(names, fn) {
      for (var i = 0; i < names.length; i++) a[names[i]] = fn;
    }

    var words = ['to', 'be', 'been', 'is', 'that', 'which', 'and', 'has', 'have', 'with', 'at', 'of', 'same', 'but', 'does', 'still', 'also'];
    for (var w = 0; w < words.length; w++) chain(words[w]);
    flag('not', function () { flags.negate = !flags.negate; });
    flag('deep', function () { flags.deep = true; });
    flag('any', function () { flags.any = true; });
    flag('all', function () { flags.any = false; });

    getterAssertion(['ok'], function () {
      check(!!flags.obj, 'expected ' + subject() + ' to be truthy', 'expected ' + subject() + ' to be falsy');
    });
    getterAssertion(['true'], function () {
      check(flags.obj === true, 'expected ' + subject() + ' to be true', 'expected ' + subject() + ' to not be true');
    });
    getterAssertion(['false'], function () {
      check(flags.obj === false, 'expected ' + subject() + ' to be false', 'expected ' + subject() + ' to not be false');
    });
    getterAssertion(['null'], function () {
      check(flags.obj === null, 'expected ' + subject() + ' to be null', 'expected ' + subject() + ' to not be null');
    });
    getterAssertion(['undefined'], function () {
      check(flags.obj === undefined, 'expected ' + subject() + ' to be undefined', 'expected ' + subject() + ' to not be undefined');
    });
    getterAssertion(['NaN'], function () {
      check(flags.obj !== flags.obj, 'expected ' + subject() + ' to be NaN', 'expected ' + subject() + ' to not be NaN');
    });
    getterAssertion(['exist'], function () {
      check(flags.obj !== null && flags.obj !== undefined, 'expected ' + subject() + ' to exist', 'expected ' + subject() + ' to not exist');
    });
    getterAssertion(['empty'], function () {
      check(sizeOf(flags.obj) === 0, 'expected ' + subject() + ' to be empty', 'expected ' + subject() + ' not to be empty');
    });

    method(['equal', 'equals', 'eq'], function (expected) {
      var passed = flags.deep ? deepEqual(flags.obj, expected, 0) : flags.obj === expected;
      return check(passed, 'expected ' + subject() + ' to equal ' + inspect(expected), 'expected ' + subject() + ' to not equal ' + inspect(expected));
    });
    method(['eql', 'eqls'], function (expected) {
      return check(deepEqual(flags.obj, expected, 0), 'expected ' + subject() + ' to deeply equal ' + inspect(expected), 'expected ' + subject() + ' to not deeply equal ' + inspect(expected));
    });
    method(['include', 'includes', 'contain', 'contains'], function (needle) {
      return check(contains(flags.obj, needle, flags.deep), 'expected ' + subject() + ' to include ' + inspect(needle), 'expected ' + subject() + ' to not include ' + inspect(needle));
    });
    method(['string'], function (needle) {
      var passed = typeof flags.obj === 'string' && flags.obj.indexOf(needle) !== -1;
      return check(passed, 'expected ' + subject() + ' to contain ' + inspect(needle), 'expected ' + subject() + ' to not contain ' + inspect(needle));
    });
    method(['property'], function (name, value) {
      var obj = flags.obj;
      var has = obj !== null && obj !== undefined && name in Object(obj);
      if (arguments.length > 1) {
        var actualValue = has ? obj[name] : undefined;
        var same = has && (flags.deep ? deepEqual(actualValue, value, 0) : actualValue === value);
        check(same,
          'expected ' + subject() + ' to have property ' + inspect(name) + ' of ' + inspect(value) + (has ? ', but got ' + inspect(actualValue) : ''),
          'expected ' + subject() + ' to not have property ' + inspect(name) + ' of ' + inspect(value));
      } else {
        check(has, 'expected ' + subject() + ' to have property ' + inspect(name), 'expected ' + subject() + ' to not have property ' + inspect(name));
      }
      if (!flags.negate && has) flags.obj = obj[name];
      return a;
    });
    method(['ownProperty', 'haveOwnProperty'], function (name) {
      var has = flags.obj !== null && flags.obj !== undefined && hasOwn(flags.obj, name);
      check(has, 'expected ' + subject() + ' to have own property ' + inspect(name), 'expected ' + subject() + ' to not have own property ' + inspect(name));
      if (!flags.negate && has) flags.obj = flags.obj[name];
      return a;
    });
    method(['a', 'an'], function (type) {
      var expected = String(type).toLowerCase();
      var article = /^[aeiou]/.test(expected) ? 'an ' : 'a ';
      return check(typeOf(flags.obj) === expected, 'expected ' + subject() + ' to be ' + article + expected, 'expected ' + subject() + ' not to be ' + article + expected);
    });
    method(['above', 'gt', 'greaterThan'], function (n) {
      return check(flags.obj > n, 'expected ' + subject() + ' to be above ' + inspect(n), 'expected ' + subject() + ' to be at most ' + inspect(n));
    });
    method(['least', 'gte'], function (n) {
      return check(flags.obj >= n, 'expected ' + subject() + ' to be at least ' + inspect(n), 'expected ' + subject() + ' to be below ' + inspect(n));
    });
    method(['below', 'lt', 'lessThan'], function (n) {
      return check(flags.obj < n, 'expected ' + subject() + ' to be below ' + inspect(n), 'expected ' + subject() + ' to be at least ' + inspect(n));
    });
    method(['most', 'lte'], function (n) {
      return check(flags.obj <= n, 'expected ' + subject() + ' to be at most ' + inspect(n), 'expected ' + subject() + ' to be above ' + inspect(n));
    });
    method(['within'], function (low, high) {
      return check(flags.obj >= low && flags.obj <= high, 'expected ' + subject() + ' to be within ' + low + '..' + high, 'expected ' + subject() + ' to not be within ' + low + '..' + high);
    });
    method(['lengthOf', 'length'], function (n) {
      var size = sizeOf(flags.obj);
      return check(size === n, 'expected ' + subject() + ' to have a length of ' + n + ' but got ' + size, 'expected ' + subject() + ' to not have a length of ' + n);
    });
    method(['match', 'matches'], function (re) {
      return check(re instanceof RegExp && re.test(String(flags.obj)), 'expected ' + subject() + ' to match ' + String(re), 'expected ' + subject() + ' not to match ' + String(re));
    });
    method(['oneOf'], function (list) {
      return check(contains(list, flags.obj, flags.deep), 'expected ' + subject() + ' to be one of ' + inspect(list), 'expected ' + subject() + ' to not be one of ' + inspect(list));
    });
    method(['members'], function (list) {
      return check(sameMembers(flags.obj, list), 'expected ' + subject() + ' to have the same members as ' + inspect(list), 'expected ' + subject() + ' to not have the same members as ' + inspect(list));
    });
    method(['keys', 'key'], function () {
      var wanted = arguments.length === 1 && Array.isArray(arguments[0]) ? arguments[0] : Array.prototype.slice.call(arguments);
      var obj = flags.obj !== null && typeof flags.obj === 'object' ? flags.obj : {};
      var actualKeys = Object.keys(obj);
      var passed;
      if (flags.any) {
        passed = false;
        for (var i = 0; i < wanted.length; i++) if (hasOwn(obj, wanted[i])) passed = true;
      } else {
        passed = wanted.length === actualKeys.length;
        for (var j = 0; j < wanted.length; j++) if (!hasOwn(obj, wanted[j])) passed = false;
      }
      return check(passed, 'expected ' + subject() + ' to have keys ' + inspect(wanted), 'expected ' + subject() + ' to not have keys ' + inspect(wanted));
    });
    method(['instanceOf', 'instanceof'], function (ctor) {
      var passed = typeof ctor === 'function' && flags.obj instanceof ctor;
      return check(passed, 'expected ' + subject() + ' to be an instance of ' + (ctor && ctor.name), 'expected ' + subject() + ' to not be an instance of ' + (ctor && ctor.name));
    });
    method(['satisfy', 'satisfies'], function (fn) {
      return check(!!fn(flags.obj), 'expected ' + subject() + ' to satisfy the given function', 'expected ' + subject() + ' to not satisfy the given function');
    });
    method(['throw', 'throws', 'Throw'], function (expected) {
      var thrown = false;
      var err;
      try { flags.obj(); } catch (e) { thrown = true; err = e; }
      var passed = thrown;
      if (thrown && expected !== undefined) {
        var message = errorMessage(err);
        if (expected instanceof RegExp) passed = expected.test(message);
        else if (typeof expected === 'string') passed = message.indexOf(expected) !== -1;
        else if (typeof expected === 'function') passed = err instanceof expected;
      }
      return check(passed, 'expected function to throw' + (expected !== undefined ? ' ' + inspect(expected) : ''), 'expected function to not throw');
    });

    return a;
  }
  expect.fail = function (message) { throw new AssertionError(message || 'expect.fail()'); };

  // ---- tests ---------------------------------------------------------------------------
  function record(name, error) {
    var entry = { name: name, passed: error === undefined };
    if (error !== undefined) entry.error = errorMessage(error);
    results[results.length] = entry;
  }

  function test(name, fn) {
    name = String(name);
    if (typeof fn !== 'function') { record(name); return; }
    try {
      var outcome = fn();
      if (outcome && typeof outcome.then === 'function') {
        outcome.then(function () { record(name); }, function (e) { record(name, e); });
      } else {
        record(name);
      }
    } catch (e) {
      record(name, e);
    }
  }
  test.skip = function () {};

  // ---- response / request --------------------------------------------------------------
  function headerBag(source) {
    var bag = {};
    if (source && typeof source === 'object') {
      for (var k in source) if (hasOwn(source, k)) bag[k] = String(source[k]);
    }
    function find(name) {
      var wanted = String(name).toLowerCase();
      for (var k in bag) if (hasOwn(bag, k) && k.toLowerCase() === wanted) return bag[k];
      return undefined;
    }
    // Not enumerable, so "for (name in pm.response.headers)" still lists only header names.
    Object.defineProperty(bag, 'get', { value: find });
    Object.defineProperty(bag, 'has', { value: function (name) { return find(name) !== undefined; } });
    Object.defineProperty(bag, 'toObject', {
      value: function () {
        var out = {};
        for (var k in bag) if (hasOwn(bag, k)) out[k] = bag[k];
        return out;
      }
    });
    return bag;
  }

  var pm = {
    info: { eventName: input.event, requestName: input.requestName || '' },
    environment: environment,
    variables: variables,
    collectionVariables: collectionVariables,
    globals: globals,
    expect: expect,
    test: test
  };

  if (input.request) {
    pm.request = {
      method: input.request.method,
      url: input.request.url,
      headers: headerBag(input.request.headers)
    };
  }

  var tests = {};

  if (input.response) {
    var raw = input.response;
    var body = typeof raw.body === 'string' ? raw.body : '';
    var status = raw.status;
    var response = {
      code: status,
      // Numeric like "code" — earlier scripts in this app compare pm.response.status to numbers.
      status: status,
      reason: function () { return raw.statusText || ''; },
      ok: raw.ok,
      headers: headerBag(raw.headers),
      responseTime: raw.responseTime,
      responseSize: raw.responseSize,
      text: function () { return body; },
      json: function () { return parseJson(body); }
    };

    var responseAssertion = function () {
      var negate = false;
      var r = {};
      function check(passed, message, negatedMessage) {
        if (negate ? passed : !passed) throw new AssertionError(negate ? negatedMessage : message);
        return r;
      }
      var chainWords = ['to', 'be', 'have', 'and', 'with'];
      for (var i = 0; i < chainWords.length; i++) {
        Object.defineProperty(r, chainWords[i], { get: function () { return r; } });
      }
      Object.defineProperty(r, 'not', { get: function () { negate = !negate; return r; } });
      function statusGetter(name, test, label) {
        Object.defineProperty(r, name, {
          get: function () {
            check(test(status), 'expected response to be ' + label + ' but got ' + status, 'expected response to not be ' + label + ' but got ' + status);
            return callable(r);
          }
        });
      }
      statusGetter('ok', function (s) { return s >= 200 && s < 300; }, 'ok (2xx)');
      statusGetter('success', function (s) { return s >= 200 && s < 300; }, 'successful (2xx)');
      statusGetter('info', function (s) { return s >= 100 && s < 200; }, 'informational (1xx)');
      statusGetter('redirection', function (s) { return s >= 300 && s < 400; }, 'a redirection (3xx)');
      statusGetter('clientError', function (s) { return s >= 400 && s < 500; }, 'a client error (4xx)');
      statusGetter('serverError', function (s) { return s >= 500 && s < 600; }, 'a server error (5xx)');
      statusGetter('error', function (s) { return s >= 400 && s < 600; }, 'an error (4xx/5xx)');
      statusGetter('badRequest', function (s) { return s === 400; }, 'bad request (400)');
      statusGetter('unauthorized', function (s) { return s === 401; }, 'unauthorized (401)');
      statusGetter('unauthorised', function (s) { return s === 401; }, 'unauthorized (401)');
      statusGetter('forbidden', function (s) { return s === 403; }, 'forbidden (403)');
      statusGetter('notFound', function (s) { return s === 404; }, 'not found (404)');
      statusGetter('rateLimited', function (s) { return s === 429; }, 'rate limited (429)');
      r.status = function (expected) {
        if (typeof expected === 'string') {
          var reason = raw.statusText || '';
          return check(reason === expected, "expected response to have status reason '" + expected + "' but got '" + reason + "'", "expected response to not have status reason '" + expected + "'");
        }
        return check(status === expected, 'expected response to have status code ' + expected + ' but got ' + status, 'expected response to not have status code ' + expected);
      };
      r.header = function (name, value) {
        var actual = response.headers.get(name);
        if (arguments.length > 1) {
          return check(actual === String(value), "expected response header '" + name + "' to be '" + value + "' but got " + inspect(actual), "expected response header '" + name + "' to not be '" + value + "'");
        }
        return check(actual !== undefined, "expected response to have header '" + name + "'", "expected response to not have header '" + name + "'");
      };
      r.body = function (expected) {
        if (arguments.length === 0) return check(body.length > 0, 'expected response to have a body', 'expected response to not have a body');
        if (expected instanceof RegExp) return check(expected.test(body), 'expected response body to match ' + String(expected), 'expected response body to not match ' + String(expected));
        return check(body === String(expected), 'expected response body to equal ' + inspect(expected), 'expected response body to not equal ' + inspect(expected));
      };
      r.jsonBody = function (path, value) {
        var parsed;
        try { parsed = parseJson(body); } catch (e) { return check(false, 'expected response body to be valid JSON', 'expected response body to not be valid JSON'); }
        if (arguments.length === 0) return check(true, '', 'expected response body to not be valid JSON');
        var cursor = parsed;
        var segments = String(path).split('.');
        var found = true;
        for (var s = 0; s < segments.length; s++) {
          if (cursor !== null && typeof cursor === 'object' && hasOwn(cursor, segments[s])) cursor = cursor[segments[s]];
          else { found = false; break; }
        }
        if (arguments.length === 1) return check(found, "expected response JSON to have '" + path + "'", "expected response JSON to not have '" + path + "'");
        return check(found && deepEqual(cursor, value, 0), "expected response JSON '" + path + "' to equal " + inspect(value) + (found ? ' but got ' + inspect(cursor) : ''), "expected response JSON '" + path + "' to not equal " + inspect(value));
      };
      return r;
    };
    Object.defineProperty(response, 'to', { get: function () { return responseAssertion().to; } });
    pm.response = response;
  }

  var g = globalThis;
  g.pm = pm;
  g.console = console;
  if (input.response) {
    // Legacy Postman globals that older collections still use.
    g.tests = tests;
    g.responseBody = input.response.body;
    g.responseCode = { code: input.response.status, name: input.response.statusText || '', detail: '' };
    g.responseTime = input.response.responseTime;
    g.responseHeaders = pm.response.headers.toObject();
  }

  return function finish() {
    var out = results.slice();
    for (var name in tests) {
      if (hasOwn(tests, name)) out[out.length] = { name: name, passed: !!tests[name] };
    }
    return stringify({
      results: out,
      logs: logs,
      variables: environment.toObject(),
      collectionVariables: collectionVariables.toObject(),
      globals: globals.toObject()
    });
  };
})`
