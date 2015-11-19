
/**
 * Module dependencies.
 */
var PNamespace = require('./pnamespace');
var Server = require('socket.io');
var Client = require('socket.io/client');
var PAdapter = require('padapter');
var debug = require('debug')('psocket.io:pserver');
/**
 * Module exports.
 */

module.exports = PServer;


/**
* Server constructor.
*
* @param {http.Server|Number|Object} http server, port or options
* @param {Object} options
* @api public
*/

function PServer(srv, opts){
    if (!(this instanceof PServer)) return new PServer(srv, opts);
    if ('object' == typeof srv && !srv.listen) {
        opts = srv;
        srv = null;
    }
    opts = opts || {};
    opts.adapter = (opts.adapter|| PAdapter);
    this.maxStreamCntPerSocket = opts.maxStreamCntPerSocket || 20;
    this.sequentialRecv = opts.sequentialRecv || true;
    Server.call(this, srv,opts);
};

PServer.prototype= Object.create(Server.prototype);
PServer.prototype.constructor = PServer;

/**
 * Called with each incoming transport connection.
 *
 * @param {engine.Socket} socket
 * @return {Server} self
 * @api public
 */

PServer.prototype.onconnection = function(conn){
    debug('incoming connection with id %s', conn.id);
    var client = new Client(this, conn);
    client.connect('/');
    return this;
};

/**
* Looks up a namespace.
*
* @param {String} nsp name
* @param {Function} optional, nsp `connection` ev handler
* @api public
*/

PServer.prototype.of = function(name, fn){
    //return this.server.of(name,fn);
    if (String(name)[0] !== '/') name = '/' + name;

    if (!this.nsps[name]) {
        debug('initializing namespace %s', name);
        var nsp = new PNamespace(this, name);
        this.nsps[name] = nsp;
    }
    if (fn) this.nsps[name].on('connect', fn);
    return this.nsps[name];
}


/**
 * BC with `io.listen`
 */
PServer.listen = PServer;
