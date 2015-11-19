
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
    this.connected = {};
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
    var socket = new Socket(this,client);
    socket.onconnect=function(){
        debug('socket connected - writing packet');
        this.join(this.id);
        this.packet({ type: parser.CONNECT });
        //this.nsp.connected[this.id] = this;
    };
    socket.onclose=function(reason){
        if (!this.connected) return this;
        debug('closing socket - reason %s', reason);
        this.leaveAll();
        this.nsp.remove(this);
        this.client.remove(this);
        this.connected = false;
        this.disconnected = true;
        //delete this.nsp.connected[this.id];
        this.emit('disconnect', reason);
    };
    var self = this;
    this.run(socket, function(err){
        process.nextTick(function(){
            if ('open' == client.conn.readyState) {
                if (err) return socket.error(err.data || err.message);


                // it's paramount that the internal `onconnect` logic
                // fires before user-set events to prevent state order
                // violations (such as a disconnection before the connection
                // logic is complete)
                socket.onconnect();

                // track socket
                socket.on('puuid',function(data){
                    var uuid = data.data;
                    socket.uuid= uuid;
                    var psocket;
                    if(self.connected.hasOwnProperty(uuid)){
                        psocket = self.connected[uuid];
                        psocket.add(socket);
                    }else{
                        psocket = new PSocket(this,socket);
                        self.sockets.push(psocket);
                        self.connected[uuid]=psocket;
                        // fire user-set events
                        self.emit('connect', psocket);
                        self.emit('connection', psocket);
                    }
                    if (fn) fn();
                });
                socket.emit('puuid');
            } else {
                debug('next called after client was closed - ignoring socket');
            }
        });
    });
    return socket;
};

/**
 * Removes a client. Called by each `Socket`.
 *
 * @api private
 */

PNamespace.prototype.remove = function(socket){
    // Should ignore
};

/**
 * Removes a client. Called by each `Socket`.
 *
 * @api private
 */

PNamespace.prototype.removePSocket = function(psocket){
    if(this.connected.hasOwnProperty(psocket.uuid)){
        delete this.connected[psocket.uuid];
    }
    var i = this.sockets.indexOf(psocket);
    if (~i) {
        this.sockets.splice(i, 1);
    } else {
        debug('ignoring remove for %s', psocket.uuid);
    }
};




/**
 * Emits to all clients.
 *
 * @return {Namespace} self
 * @api public
 */

PNamespace.prototype.emit = function(ev){
    if (~exports.events.indexOf(ev)) {
        emit.apply(this, arguments);
    } else {
        // set up packet object
        var args = Array.prototype.slice.call(arguments);

        if ('function' == typeof args[args.length - 1]) {
            throw new Error('Callbacks are not supported when broadcasting');
        }
        this.adapter.broadcast(args, {
            rooms: this.rooms,
            flags: this.flags
        });

        delete this.rooms;
        delete this.flags;
    }
    return this;
};

/**
 * Sends a `message` event to all clients.
 *
 * @return {Namespace} self
 * @api public
 */

PNamespace.prototype.send =
PNamespace.prototype.write = function(){
        var args = Array.prototype.slice.call(arguments);
        args.unshift('message');
        this.emit.apply(this, args);
        return this;
    };