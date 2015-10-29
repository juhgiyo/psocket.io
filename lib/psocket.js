
/**
 * Module dependencies.
 */

var Emitter = require('events').EventEmitter;
var debug = require('debug')('psocket.io:psocket');
var Queue = require('queue');

/**
 * Module exports.
 */

module.exports = exports = PSocket;


/**
 * Blacklisted events.
 *
 * @api public
 */

exports.events = [
    'error',
    'connect',
    'disconnect',
    'newListener',
    'removeListener'
];


/**
 * Flags.
 *
 * @api private
 */

var flags = [
    'json',
    'volatile',
    'broadcast'
];

/**
 * `EventEmitter#emit` reference.
 */

var emit = Emitter.prototype.emit;


/**
 * Interface to a `Client` for a given `Namespace`.
 *
 * @param {Namespace} nsp
 * @param {Client} client
 * @api public
 */

function PSocket(nsp, socket){
    this.nsp = nsp;
    this.server = nsp.server;
    this.adapter = this.nsp.adapter;

    this.rooms = [];

    this.connected = true;
    this.disconnected = false;

    this.uuid = socket.uuid;

    this.maxStreamCntPerSocket = this.server.maxStreamCntPerSocket;
    this.sequentialRecv = this.server.sequentialRecv || true;

    this.setup();


    this.sockets=[];
    this.add(socket);

}

PSocket.prototype.setup=function(){
    this.packetId=0;
    this.curReceivedPacketId=-1;
    this.packetQueue= new Queue();
    this.pendingPacketQueue=new Queue();
    this.errorPacketQueue=new Queue();
    this.pendingClientQueue= new Queue();
    this.recvQueue = new PriorityQueue(function(a,b){
        return a.packetId - b.packetId;
    });
}

/**
 * Inherits from `EventEmitter`.
 */

PSocket.prototype.__proto__ = Emitter.prototype;

PSocket.prototype.add = function(socket){
    if(this.sockets.length > this.maxStreamCntPerSocket)
    {
        socket.close();
    }else{
        socket.on('disconnect',function(reason){
            self.ondisconnect(socket, reason);
        }).on('error',function(ppacket){
            self.onerror(socket, ppacket);
        }).on('ppacket',function(data){
            self.onreceive(socket,data);
        });
        this.sockets.push(socket);
        this.pendingClientQueue.enqueue(socket);
        this.sendPpacket();
    }
};

PSocket.prototype.getNextPacketId=function(){
    var retId = this.packetId;
    if(this.packetId===Number.MAX_VALUE){
        this.packetId=-1;
    }
    this.packetId++;
    return retId;
};

/**
 * Emits to this client.
 *
 * @return {Socket} self
 * @api public
 */

PSocket.prototype.emit = function(ev){
    // TODO: implement this
    if (~exports.events.indexOf(ev)) {
        emit.apply(this, arguments);
    } else {
        var args = Array.prototype.slice.call(arguments);

        // access last argument to see if it's an ACK callback
        if ('function' == typeof args[args.length - 1]) {
            if (this._rooms || (this.flags && this.flags.broadcast)) {
                throw new Error('Callbacks are not supported when broadcasting');
            }
        }

        if (this._rooms || (this.flags && this.flags.broadcast)) {
            this.adapter.broadcast(packet, {
                except: [this.id],
                rooms: this._rooms,
                flags: this.flags
            });
        } else {
            // dispatch packet
            var ppacket = {packetId:this.getNextPacketId(),data:args};
            this.packetQueue.enqueue(ppacket);
            this.sendPpacket();
        }

        // reset flags
        delete this._rooms;
        delete this.flags;
    }
    return this;
};


PSocket.prototype.sendPpacket=function(){
    while(!this.pendingClientQueue.isEmpty() && (!this.packetQueue.isEmpty() || !this.errorPacketQueue.isEmpty())){
        var socket = this.pendingClientQueue.dequeue();
        var sendPpacket;
        if(!this.errorPacketQueue.isEmpty())
        {
            sendPpacket= this.errorPacketQueue.dequeue();
        } else if (!this.packetQueue.isEmpty()){
            sendPpacket=this.packetQueue.dequeue();
        }
        this.pendingPacketQueue.enqueue(sendPpacket);
        var sendcb = sendPpacket.cb;
        socket.emit.apply(socket, ['ppacket', sendPpacket,this.onack(socket,sendcb)]);
    }
}

PSocket.prototype.onack=function(socket, cb) {
    var self = this;
    return function(data){
        self.pendingClientQueue.enqueue(socket);
        self.pendingPacketQueue.remove(data);
        if(cb)
            cb.apply(self,data.data);
    }
};

/**
 * Targets a room when broadcasting.
 *
 * @param {String} name
 * @return {Socket} self
 * @api public
 */

PSocket.prototype.to =
PSocket.prototype.in = function(name){
    this._rooms = this._rooms || [];
    if (!~this._rooms.indexOf(name)) this._rooms.push(name);
    return this;
};

/**
 * Sends a `message` event.
 *
 * @return {Socket} self
 * @api public
 */

PSocket.prototype.send =
PSocket.prototype.write = function(){
    var args = Array.prototype.slice.call(arguments);
    args.unshift('message');
    this.emit.apply(this, args);
    return this;
};


/**
 * Writes a packet.
 *
 * @param {Object} packet object
 * @api private
 */

Socket.prototype.packet = function(packet, preEncoded){
    // TODO: implement this
    packet.nsp = this.nsp.name;
    var volatile = this.flags && this.flags.volatile;
    this.client.packet(packet, preEncoded, volatile);
};

/**
 * Joins a room.
 *
 * @param {String} room
 * @param {Function} optional, callback
 * @return {Socket} self
 * @api private
 */

PSocket.prototype.join = function(room, fn){
    debug('joining room %s', room);
    var self = this;
    if (~this.rooms.indexOf(room)) return this;
    this.adapter.add(this.uuid, room, function(err){
        if (err) return fn && fn(err);
        debug('joined room %s', room);
        self.rooms.push(room);
        fn && fn(null);
    });
    return this;
};

/**
 * Leaves a room.
 *
 * @param {String} room
 * @param {Function} optional, callback
 * @return {Socket} self
 * @api private
 */

PSocket.prototype.leave = function(room, fn){
    debug('leave room %s', room);
    var self = this;
    this.adapter.del(this.uuid, room, function(err){
        if (err) return fn && fn(err);
        debug('left room %s', room);
        var idx = self.rooms.indexOf(room);
        if (idx >= 0) {
            self.rooms.splice(idx, 1);
        }
        fn && fn(null);
    });
    return this;
};

/**
 * Leave all rooms.
 *
 * @api private
 */

PSocket.prototype.leaveAll = function(){
    this.adapter.delAll(this.uuid);
    this.rooms = [];
};


/**
 * Disconnects this client.
 *
 * @param {Boolean} if `true`, closes the underlying connection
 * @return {Socket} self
 * @api public
 */

PSocket.prototype.disconnect = function(close){
    if (this.connected) {
        var socket;
        while(socket= this.sockets.shift()){
            socket.disconnect(close);
        }
    }
    return this;
};

/**
 * Called upon closing. Called by `Client`.
 *
 * @param {String} reason
 * @param {Error} optional error object
 * @api private
 */
PSocket.prototype.onclose = function(reason){
    if (!this.connected) return this;
    debug('closing socket - reason %s', reason);
    this.disconnect();
};

PSocket.prototype.ondisconnect=function(socket, reason){
    var idx = this.sockets.indexOf(socket);
    if(idx > -1){
        this.sockets.splice(idx,1);
        this.pendingClientQueue.remove(socket);
        if(this.sockets.length==0){
            this.nsp.removePSocket(this);
            this.connected = true;
            this.disconnected = false;
            this.emit('disconnect', reason);
        }
    }
};

PSocket.prototype.onreceive=function(socket, data){
    if (self.sequentialRecv) {
        this.recvQueue.enq(data);
        while(!this.recvQueue.isEmpty() && this.curReceivedPacketId +1 == this.recvQueue.peek().packetId){
            var curPacket = this.recvQueue.deq();
            this.curReceivedPacketId = curPacket.packetId;
            if(this.curReceivedPacketId===Number.MAX_VALUE)
                this.curReceivedPacketId=-1;
            emit.apply(this, curPacket.data);
        }
    } else {
        emit.apply(this, data.data);
    }
};

PSocket.prototype.onerror=function(socket, ppacket){
    this.pendingClientQueue.enqueue(socket);
    this.errorPacketQueue.enqueue(ppacket);
    this.sendPpacket();
    this.emit('error',ppacket.data);
};

