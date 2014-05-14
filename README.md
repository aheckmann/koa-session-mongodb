# koa-session-mongodb

MongoDB backed session middleware for Koa.js

### Unstable

This module currently suffers from a memory leak due to its reliance on the [observed](https://github.com/aheckmann/observed/issues/9) module. You probably want to wait for the next release.

## Installation

```js
$ npm install koa-session-mongodb
```

## Example

View counter example:

```js
var session = require('koa-session-mongodb');
var mongo = require('mongodb').MongoClient;
var koa = require('koa');

mongo.connect(uri, function(err, db){
  if (err) throw err;

  var app = koa();
  app.keys = ['some secret'];
  app.use(session({ collection: db.collection('session') }));

  app.use(function *(){
    var n = this.session.views || 0;
    this.session.views = ++n;
    this.body = n + ' views';
  })

  app.listen(3000);
  console.log('listening on port 3000');
})
```

## Semantics

This module provides "guest" sessions, meaning any visitor will have a session,
authenticated or not. If a session is _new_ a Set-Cookie will be produced regardless
of populating the session.

## API

### Options

The cookie name is controlled by the `key` option, which defaults
to "sid". All other options are passed to `ctx.cookies.get()` and
`ctx.cookies.set()` allowing you to control security, domain, path,
and signing among other settings.

### Session#isNew

Returns __true__ if the session is new.

### Destroying a session

To destroy a session simply set it to `null`:

```js
this.session = null;
```

## License

[MIT](https://github.com/aheckmann/koa-session-mongodb/blob/master/LICENSE)
