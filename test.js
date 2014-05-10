var koa = require('koa');
var request = require('supertest');
var koaSession = require('./');
var mongo = require('mongodb').MongoClient;
var assert = require('assert');

var uri = process.env.KOA_SESSION_MONGO_TEST_URI || 'mongodb://localhost/koa-session-mongo';

describe('Koa Session Mongo', function(){
  var cookie;
  var col;
  var db;

  function merge (a, b) {
    for (var key in b)
      a[key] = b[key];
  }

  function session (opts) {
    if (!opts) opts = {};
    merge(opts, { collection: col });
    return koaSession(opts);
  };

  before(function(done) {
    mongo.connect(uri, function(err, db_) {
      if (err) return done(err);
      db = db_;
      col = db.collection('session');
      done();
    });
  });

  after(function(done) {
    db.dropDatabase(function() {
      db.close(function() {
        done();
      });
    })
  });

  function App(options) {
    var app = koa();
    app.keys = ['a', 'b'];
    app.use(session(options));
    return app;
  }

  describe('when no collection is passed', function() {
    it('throws', function(done) {
      assert.throws(function() {
        koaSession({});
      }, /missing mongodb collection/);
      done();
    });
  });

  describe('when collection is passed', function() {
    it('does not throw', function(done) {
      assert.doesNotThrow(function() {
        koaSession({ collection: col });
      });
      done();
    });
  });

  describe('when options.signed = true', function(){
    describe('when app.keys are set', function(){
      it('should work', function(done){
        var app = koa();

        app.keys = ['a', 'b'];
        app.use(session());

        app.use(function *(){
          this.session.message = 'hi';
          this.body = this.session;
        });

        request(app.listen())
        .get('/')
        .expect(200, done);
      })
    })

    describe('when app.keys are not set', function(){
      it('should throw', function(done){
        var app = koa();

        app.use(session());

        app.use(function *(){
          this.session.message = 'hi';
          this.body = this.session;
        });

        request(app.listen())
        .get('/')
        .expect(500, done);
      })
    })
  })

  describe('when options.signed = false', function(){
    describe('when app.keys are not set', function(){
      it('should work', function(done){
        var app = koa();

        app.use(session({ signed: false }));

        app.use(function *(){
          this.session.message = 'hi';
          this.body = this.session;
        });

        request(app.listen())
        .get('/')
        .expect(200, done);
      })
    })
  })

  describe('when the session contains a ;', function(){
    it('should still work', function(done){
      var app = App();

      app.use(function *(){
        if (this.method === 'POST') {
          this.session.string = ';';
          this.status = 204;
        } else {
          this.body = this.session.string;
        }
      });

      var server = app.listen();

      request(server)
      .post('/')
      .expect(204, function(err, res){
        if (err) return done(err);
        var cookie = res.headers['set-cookie'];
        request(server)
        .get('/')
        .set('Cookie', cookie.join(';'))
        .expect(';', done);
      })
    })
  })

  describe('new session', function(){
    describe('when not accessed', function(){
      it('should not Set-Cookie', function(done) {
        var app = App();

        app.use(function *(){
          this.body = 'greetings';
        })

        request(app.listen())
        .get('/')
        .expect(200, function(err, res){
          if (err) return done(err);
          res.header.should.not.have.property('set-cookie');
          done();
        })
      })
    })

    describe('when accessed and not populated', function(done){
      it('should not Set-Cookie', function(done) {
        var app = App();

        app.use(function *(){
          this.session;
          this.body = 'greetings';
        });

        request(app.listen())
        .get('/')
        .expect(200, function(err, res){
          if (err) return done(err);
          res.header.should.not.have.property('set-cookie');
          done();
        })
      })
    })

    describe('when populated', function(done){
      it('should Set-Cookie', function(done){
        var app = App();

        app.use(function *(){
          this.session.message = 'hello';
          this.body = '';
        })

        request(app.listen())
        .get('/')
        .expect('Set-Cookie', /.*/)
        .expect(200, function(err, res){
          if (err) return done(err);
          cookie = res.header['set-cookie'].join(';');
          done();
        })
      })

      it('should not Set-Cookie', function(done){
        var app = App();

        app.use(function *(){
          this.body = this.session;
        })

        request(app.listen())
        .get('/')
        .expect(200, function(err, res){
          if (err) return done(err);
          res.header.should.not.have.property('set-cookie');
          done();
        })
      })
    })
  })

  describe('saved session', function(){
    describe('when not accessed', function(){
      it('should not Set-Cookie', function(done){
        var app = App();

        app.use(function *(){
          this.body = 'aklsdjflasdjf';
        })

        request(app.listen())
        .get('/')
        .set('Cookie', cookie)
        .expect(200, function(err, res){
          if (err) return done(err);
          res.header.should.not.have.property('set-cookie');
          done();
        })
      })
    })

    describe('when accessed but not changed', function(){
      it('should be the same session', function(done){
        var app = App();

        app.use(function *(){
          this.session.message.should.equal('hello');
          this.body = 'aklsdjflasdjf';
        })

        request(app.listen())
        .get('/')
        .set('Cookie', cookie)
        .expect(200, done);
      })

      it('should not Set-Cookie', function(done){
        var app = App();

        app.use(function *(){
          this.session.message.should.equal('hello');
          this.body = 'aklsdjflasdjf';
        })

        request(app.listen())
        .get('/')
        .set('Cookie', cookie)
        .expect(200, function(err, res){
          if (err) return done(err);
          res.header.should.not.have.property('set-cookie');
          done();
        })
      })
    })

    describe('when accessed and changed', function(){
      it('should Set-Cookie', function(done){
        var app = App();

        app.use(function *(){
          this.session.money = '$$$';
          this.body = 'aklsdjflasdjf';
        })

        request(app.listen())
        .get('/')
        .set('Cookie', cookie)
        .expect('Set-Cookie', /sid=[^;]+/)
        .expect(200, done);
      })
    })
  })

  describe('when session is', function(){
    describe('null', function(){
      it('should expire the session', function(done){
        var app = App();

        app.use(function *(){
          this.session = null;
          this.body = 'asdf';
        })

        request(app.listen())
        .get('/')
        .expect('Set-Cookie', /sid=;/)
        .expect(200, done);
      })
    })

    describe('an empty object', function(){
      it('should not Set-Cookie', function(done){
        var app = App();

        app.use(function *(){
          this.session = {};
          this.body = 'asdf';
        })

        request(app.listen())
        .get('/')
        .expect(200, function(err, res){
          if (err) return done(err);
          res.header.should.not.have.property('set-cookie');
          done();
        });
      })
    })

    describe('an object', function(){
      it('should create a session', function(done){
        var app = App();

        app.use(function *(){
          this.session = { message: 'hello' };
          this.body = 'asdf';
        })

        request(app.listen())
        .get('/')
        .expect('Set-Cookie', /sid=[^;]+/)
        .expect(200, done);
      })
    })

    describe('anything else', function(){
      it('should throw', function(done){
        var app = App();

        app.use(function *(){
          this.session = 'asdf'
        })

        request(app.listen())
        .get('/')
        .expect(500, done);
      })
    })
  })

  describe('when an error is thrown downstream and caught upstream', function(){
    it('should still save the session', function(done){
      var app = koa();

      app.keys = ['a', 'b'];

      app.use(function *(next){
        try {
          yield *next;
        } catch (err) {
          this.status = err.status;
          this.body = err.message;
        }
      });

      app.use(session());

      app.use(function *(next){
        this.session.name = 'funny';
        yield *next;
      });

      app.use(function *(next){
        this.throw(401);
      });

      request(app.listen())
      .get('/')
      .expect('Set-Cookie', /sid=[^;]+/)
      .expect(401, done);
    })
  })
})

