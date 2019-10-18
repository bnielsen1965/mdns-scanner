'use strict';

const Util = require('util');
const EventEmitter = require('events');
const DNSPacket = require('dns-packet');
const Interfaces = require('./interfaces');
const Sockets = require('./sockets');

const MDNS_IPV4 = '224.0.0.251';
const MDNS_IPV6 = 'FF02::FB';
const MDNS_PORT = 5353;
const IPv4 = 'IPv4';
const IPv6 = 'IPv6';
const ANY_IPV4 = '0.0.0.0';
const ANY_IPV6 = '::';

const ErrorMessages = {
  NO_INTERFACES: 'No available interfaces.'
};

const Defaults = {
  reuseAddr: true,
  interfaces: null,
  ttl: 255,
  loopback: true,
  noInit: false,
  debug: false
};

class MDNSScanner extends EventEmitter {
  constructor (config) {
    super();
    this.Config = Object.assign({}, Defaults, config);
    this.destroyed = false;
    this.receiveSockets = [];
    this.sendSockets = [];
    if (!this.Config.noInit) {
      this.init();
    }
  }

  async init () {
    this.interfaces = this.getInterfaces();
    if (!this.interfaces || !this.interfaces.length) {
      this.emit('error', new Error(ErrorMessages.NO_INTERFACES));
      return;
    }
    await this.createReceiveSockets();
    await this.createSendSockets();
  }

  onMessage (message, rinfo) {
    try {
      message = DNSPacket.decode(message);
    }
    catch (error) {
      this.emit('warning', error);
      return;
    }
    this.emit('packet', message, rinfo);
  }

  async createReceiveSockets () {
    let socket = await Sockets.createMulticastSocket({
      multicastAddress: MDNS_IPV4,
      multicastPort: MDNS_PORT,
      interfaces: this.interfaces,
      onMessage: this.onMessage.bind(this),
      socketError: this.socketError.bind(this)
    });
    // TODO IPV6, ANY
  }

  socketError (error) {
    if (error.code === 'EACCES' || error.code === 'EADDRINUSE' || error.code === 'EADDRNOTAVAIL') {
      this.emit('error', error);
    } else {
      this.emit('warning', error);
    }
  }

  async createSendSockets () {
    for (let i = 0; i < this.interfaces.length; i++) {
//      let socket = await this.createSendSocket(this.interfaces[i]);
      let socket = await Sockets.createSendSocket(this.interfaces[i], this.onMessage.bind(this), this.socketError.bind(this));
      socket.iface = this.interfaces[i];
      this.sendSockets.push(socket);
    }
  }

  getInterfaces () {
    let interfaces = (this.Config.interfaces ? Interfaces.getInterfacesFromStrings(this.Config.interfaces) : Interfaces.getAllInterfaces());
    this.debug('GET INTERFACES: ' + Util.inspect(interfaces));
    return interfaces;
  }

  query (q, type, rinfo) {
    if (typeof q === 'string') {
      q = [{ name: q, type: type || 'ANY' }];
    }
    if (Array.isArray(q)) {
      q = { type: 'query', questions: q };
    }

    q.type = 'query';
    this.debug('SEND QUERY: ' + Util.inspect(q));
    this.send(q, rinfo);
  }

  send (value, rinfo) {
    if (this.destroyed) {
      return;
    }
    let message = DNSPacket.encode(value);
    for (let i = 0; i < this.sendSockets.length; i++) {
      this.sendSockets[i].send(
        message,
        0,
        message.length,
        MDNS_PORT,
        (this.sendSockets[i].iface.family === IPv4 ? MDNS_IPV4 : MDNS_IPV6 + '%' + this.sendSockets[i].iface.name),
      );
      this.debug('SEND ' + this.sendSockets[i].iface.address);
    }
  }

  destroy () {

  }

  debug (message) {
    if (this.Config.debug) {
      this.emit('debug', message);
    }
  }
}

module.exports = MDNSScanner;
