
const Util = require('util');
const EventEmitter = require('events');
const DNSPacket = require('dns-packet');
const Constants = require('./constants');
const Interfaces = require('./interfaces');
const Sockets = require('./sockets');

const Defaults = {
  reuseAddr: true,
  interfaces: null,
  ttl: 255,
  loopback: true,
  debug: false
};

class MDNSScanner extends EventEmitter {
  constructor (config) {
    super();
    this.Config = Object.assign({}, Defaults, config);
    this.ready = false;
    this.receiveSockets = [];
    this.sendSockets = [];
  }

  // initialize the scanner
  async init () {
    try {
      this.interfaces = Interfaces.getInterfaces(this.Config.interfaces);
    }
    catch (error) {
      this.emitError(error);
      throw error;
    }
    this.emitDebug(`Scanner interfaces: ${Util.inspect(this.interfaces)}`);
    await this.createReceiveSockets();
    await this.createSendSockets();
    if (this.receiveSockets.length && this.sendSockets.length) this.ready = true;
    return this.ready;
  }

  // create sockets that will receive mDNS packets
  async createReceiveSockets () {
    let ipv4 = this.interfaces.filter(i => i.family === Constants.IPv4);
    let ipv6 = this.interfaces.filter(i => i.family === Constants.IPv6);
    this.emitDebug(`Create receive sockets for${ipv4 ? ' ' + Constants.IPv4 : ''}${ ipv4 && ipv6 ? ' and': ''}${ipv6 ? ' ' + Constants.IPv6 : ''}`)
    if (ipv4.length) {
      let ipv4Socket = await Sockets.createMulticastSocket({
        multicastAddress: Constants.MDNS_IPV4,
        multicastPort: Constants.MDNS_PORT,
        interfaces: ipv4,
        onMessage: this.onMessage.bind(this),
        socketError: this.socketError.bind(this)
      });
      if (ipv4Socket.success) this.receiveSockets.push(ipv4Socket);
      else this.emitError(ipv4Socket.error.message);
    }
    if (ipv6.length) {
      let ipv6Socket = await Sockets.createMulticastSocket({
        multicastAddress: Constants.MDNS_IPV6,
        multicastPort: Constants.MDNS_PORT,
        interfaces: ipv6,
        onMessage: this.onMessage.bind(this),
        socketError: this.socketError.bind(this)
      });
      if (ipv6Socket.success) this.receiveSockets.push(ipv6Socket);
      else this.emitError(ipv6Socket.error.message);
    }
    return this.receiveSockets;
  }

  // create sockets used to send out mDNS packets
  async createSendSockets () {
    this.emitDebug(`Create send sockets on ${this.interfaces.length} interfaces/addresses.`);
    for (let i = 0; i < this.interfaces.length; i++) {
      let sendSocket = await Sockets.createSendSocket(this.interfaces[i], this.onMessage.bind(this), this.socketError.bind(this));
      if (sendSocket.success) this.sendSockets.push(sendSocket);
      else this.emitError(sendSocket.error.message);
    }
  }

  // handle receive socket message
  onMessage (message, rinfo) {
    let packet;
    try {
      packet = DNSPacket.decode(message);
    }
    catch (error) {
      return this.emitWarn(error);
    }
    this.emit('packet', packet, rinfo);
  }

  // handle socket errors
  socketError (error) {
    if (error.code === 'EACCES' || error.code === 'EADDRINUSE' || error.code === 'EADDRNOTAVAIL') {
      this.emitError(error);
    } else {
      this.emitWarn(error);
    }
  }

  // send an mDNS query, questions can be an array of formatted questions or a single question name string, qtype is optionally used with name string
  query (questions, qtype) {
    if (typeof questions === 'string') questions = [{ name: questions, type: qtype || 'ANY' }];
    if (!Array.isArray(questions)) throw new Error('Query questions must be an array of mDNS query questions.');
    let query = { type: 'query', questions };
    this.emitDebug(`Send mDNS query: ${Util.inspect(query)}`);
    this.send(query);
  }

  // send mDNS packet
  send (value, rinfo) {
    if (this.destroyed) return;
    let packet = DNSPacket.encode(value);
    for (let i = 0; i < this.sendSockets.length; i++) {
      this.sendSockets[i].send(
        packet, 0, packet.length, Constants.MDNS_PORT,
        (this.sendSockets[i].iface.family === Constants.IPv4 ? Constants.MDNS_IPV4 : Constants.MDNS_IPV6 + '%' + this.sendSockets[i].iface.name),
      );
      this.emitDebug(`Send packet on ${this.sendSockets[i].iface.address}`);
    }
  }

  // destroy this scanner
  destroy () {
    this.ready = false;
    this.sendSockets.forEach(s => s.socket.close());
    this.sendSockets = [];
    this.receiveSockets.forEach(s => s.socket.close());
    this.receiveSockets = [];
  }

  ////////////////////////
  // emit event methods //
  ////////////////////////

  emitError (error) {
    this.emit('error', error);
  }

  emitWarn (message) {
    this.emit('warn', message);
  }

  emitDebug (message) {
    if (this.Config.debug) this.emit('debug', message);
  }
}

module.exports = MDNSScanner;
