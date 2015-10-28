
/**
 * Module dependencies.
 */
var debug = require('debug')('psocket.io:pclient');
var Client = require('socket.io/client');

/**
 * Module exports.
 */

module.exports = PClient;


/**
 * Client constructor.
 *
 * @param {Server} server instance
 * @param {Socket} connection
 * @api private
 */
function PClient(server, conn){
    Client.call(this, server,conn);
}


PClient.prototype= Object.create(Client.prototype);
PClient.prototype.constructor = PClient;
