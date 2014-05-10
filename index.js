
/**
 * Module dependencies.
 */

var debug = require('debug')('koa-session-mongodb');
var mongo = require('mongodb');
var observe = require('observed');

/**
 * Change tracking for Session documents
 */

var set = new WeakSet;
var map = new WeakMap;

/**
 * Initialize session middleware with `opts`:
 *
 * - `key` session cookie name ["sid"]
 * - `collection` mongodb collection object: db.collection(name)
 * - all other options are passed as cookie options
 *
 * @param {Object} [opts]
 * @api public
 */

module.exports = function(opts){
  if (!opts)
    throw new Error('missing options');

  // this app could be receiving requests before mongodb is connected
  // so just delegate creation of connection to userland
  if (null == opts.collection)
    throw new Error('missing mongodb collection');

  Session.col = opts.collection;
  opts.key = opts.key || 'sid';

  // defaults
  if (null == opts.overwrite) opts.overwrite = true;
  if (null == opts.httpOnly) opts.httpOnly = true;
  if (null == opts.signed) opts.signed = true;

  // friendly debugging of opts
  opts.collection = opts.collection.collectionName;
  debug('session options %j', opts);

  return function *(next){
    var sess, sid;

    this.sessionOptions = opts;
    this.sessionKey = opts.key;

    sid = this.cookies.get(opts.key, opts);

    if (sid) {
      sess = yield Session.get(sid);
    }

    this.__defineGetter__('session', function(){
      if (sess) return sess;

      // unset
      if (false === sess) return null;

      sess = new Session;
      sid = String(sess._id);
      return sess;
    });

    this.__defineSetter__('session', function(val){
      if (null == val) return sess = false;

      if ('object' == typeof val) {
        set.add(val);
        return sess = val;
      }

      throw new Error('this.session can only be set as null or an object.');
    });

    try {
      yield *next;
    } finally {
      yield *commit(this, sid, sess, opts);
    }
  }
};

/**
 * Commit the session changes or removal.
 *
 * @param {Context} ctx
 * @param {String} sid
 * @param {Object} sess
 * @param {Object} opts
 * @api private
 */

function *commit (ctx, sid, sess, opts) {
  debug('begin commit');

  // new and not accessed
  if (undefined === sess) return;

  // removed
  if (false === sess) {
    ctx.cookies.set(opts.key, '', opts);
    if (sid) yield Session.remove(sid);
    return;
  }

  // force immediate delivery of pending change notifications
  if (map.has(sess)) {
    map.get(sess).deliverChanges();
    map.delete(sess);
  }

  // save session only if changed
  if (!set.has(sess)) return;
  set.delete(sess);

  // odd but koa-session ignores empty session objects
  // so stay consistent w this behavior
  if (!Object.keys(sess).length) return;

  sess.isNew = false;
  sid = objectId(sid);

  debug('store id=%s %j', sid, sess);
  ctx.cookies.set(opts.key, sid, opts);
  yield Session.set(sid, sess);
}

/**
 * Observe changes to `sess`
 */

function watch(sess) {
  debug('watch %j', sess);

  if (null == sess) return;

  var o = observe(sess);
  o.once('change', onchange);

  // provide a way to look these objects up in relation
  // to one another later in commit phase
  map.set(sess, o);
};

/**
 * Change listener
 *
 * `this` is always set to the observer instance
 */

function onchange() {
  debug('change %j', this.subject);

  // record that a change occured
  set.add(this.subject);
};

/**
 * Session constructor
 *
 * used to create fresh sessions
 */

function Session() {
  debug('new Sesion');
  this._id = objectId();
  this.isNew = true;
  watch(this);
};

/**
 * Retrieve a session document from MongoDB
 *
 * @param {String|ObjectId} id
 * @return {Function} thunk
 */

Session.get = function get (id) {
  debug('get id=%s', id);
  return function getSession (cb) {
    Session.col.findOne({ _id: objectId(id) }, function(err, obj) {
      if (err) return cb(err);
      watch(obj);
      cb(null, obj);
    });
  }
}

/**
 * Store a session document in MongoDB
 *
 * @param {String|ObjectId} id
 * @param {Object} obj
 * @return {Function} thunk
 */

Session.set = function set (sid, obj) {
  debug('set id=%s %j', sid, obj);
  return function setSession (cb) {
    // disallow changing the session id
    obj._id = sid;
    Session.col.update({ _id: sid }, obj, { upsert: true }, cb);
  }
}

/**
 * Remove a session document from MongoDB
 *
 * @param {String|ObjectId} id
 * @return {Function} thunk
 */

Session.remove = function remove (id) {
  if (!id) throw new Error('missing id');

  debug('remove id=%s', id);
  return function removeSession (cb) {
    Session.col.remove({ _id: objectId(id) }, cb);
  }
}

/**
 * Casts the `id` to a mongodb ObjectId type
 *
 * @param {String} id
 * @return {ObjectId}
 */

function objectId(id) {
  return new mongo.ObjectID(id);
};
