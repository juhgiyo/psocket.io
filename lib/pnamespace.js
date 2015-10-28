
/**
 * Module dependencies.
 */
var PSocket = require('./psocket');
var Emitter = require('events').EventEmitter;
var Namespace = require('socket.io/namespace');
var debug = require('debug')('psocket.io:pnamespace');

/**
 * Module exports.
 */

module.exports = exports = PNamespace;

/**
 * Blacklisted events.
 */

exports.events = [
    'connect',    // for symmetry with client
    'connection',
    'newListener'
];

/**
 * Flags.
 */

exports.flags = ['json'];

/**
 * `EventEmitter#emit` reference.
 */

var emit = Emitter.prototype.emit;

/**
 * Namespace constructor.
 *
 * @param {Server} server instance
 * @param {Socket} name
 * @api private
 */

function PNamespace(server, name){
    Namespace.call(this, server, name);
}


PNamespace.prototype= Object.create(Namespace.prototype);
PNamespace.prototype.constructor = PNamespace;

/**
 * Adds a new client.
 *
 * @return {Socket}
 * @api private
 */

PNamespace.prototype.add = function(client, fn){
    debug('adding socket to nsp %s', this.name);
    var socket = new PSocket(this, client);
    var self = this;
    this.run(socket, function(err){
        process.nextTick(function(){
            if ('open' == client.conn.readyState) {
                if (err) return socket.error(err.data || err.message);

                // track socket
                self.sockets.push(socket);

                // it's paramount that the internal `onconnect` logic
                // fires before user-set events to prevent state order
                // violations (such as a disconnection before the connection
                // logic is complete)
                socket.onconnect();
                if (fn) fn();

                // fire user-set events
                self.emit('connect', socket);
                self.emit('connection', socket);
            } else {
                debug('next called after client was closed - ignoring socket');
            }
        });
    });
    return socket;
};
