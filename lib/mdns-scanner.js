'use strict';

const Util = require('util');
const EventEmitter = require('events');
const DGram = require('dgram');
const DNSPacket = require('dns-packet');
const OS = require('os');
const IP = require('ip');

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
//    console.log('MSG', msg)
//    console.log('RINGO', rinfo)
    try {
      message = DNSPacket.decode(message);
    }
    catch (error) {
      this.emit('warning', error);
      return;
    }

    this.emit('packet', message, rinfo);
    switch (message.type) {
      case 'query':
        this.emit('query', message, rinfo);
        break;

      case 'response':
        this.emit('response', message, rinfo);
        break;
    }
  }

  async createReceiveSockets () {
    let socket = await this.createReceiveSocket(MDNS_IPV4);
    // TODO IPV6, ANY
  }

  socketError (error) {
    if (error.code === 'EACCES' || error.code === 'EADDRINUSE' || error.code === 'EADDRNOTAVAIL') {
      this.emit('error', error);
    } else {
      this.emit('warning', error);
    }
  }

  createReceiveSocket (address) {
    return new Promise((resolve, reject) => {
      let _this = this;
      let socket = DGram.createSocket({
        type: (IP.isV4Format(address) ? 'udp4' : 'udp6'),
        reuseAddr: this.Config.reuseAddr
      })
        .on('error', (err) => {
          if (socket.bindStatus.listening) {
            _this.socketError(err);
          } else {
            socket.close();
            resolve(false);
          }
        })
        .on('listening', () => {
          socket.bindStatus.listening = true;
          socket.setMulticastTTL(_this.Config.ttl);
          socket.setMulticastLoopback(_this.Config.loopback);
          let membershipCount = _this.addReceiverMemberships(socket, address);
          if (!membershipCount) {
            this.emit('warn', 'No memberships added to ' + address);
            socket.bindStatus.listening = false;
            socket.close();
            resolve(false);
            return;
          }
          resolve(socket);
        })
        .on('message', (msg, rinfo) => {
        // include interface name so we know where the message came in
//          rinfo.interface = iface.name;
          _this.onMessage(msg, rinfo);
        });
      socket.bindStatus = {
        listening: false
      };
      socket.bind(MDNS_PORT, address);
    });
  }

  addReceiverMemberships (socket, address) {
    let _this = this;
    let membershipCount = 0;
    let family = (IP.isV4Format(address) ? IPv4 : IPv6);
    this.interfaces.forEach((iface) => {
      if (iface.family !== family) {
        return;
      }
      try {
        socket.addMembership(address, iface.address + (iface.family === IPv4 ? '' : '%' + iface.name));
        membershipCount += 1;
        _this.debug('ADDED MEMBERSHIP: ' + iface.address + ' on ' + address);
      }
      catch (error) {
        _this.emit('warning', 'Failed addMembership on ' + address + ' for ' + iface.address);
      }
    });
    return membershipCount;
  }

  async createSendSockets () {
    for (let i = 0; i < this.interfaces.length; i++) {
      let socket = await this.createSendSocket(this.interfaces[i]);
      socket.iface = this.interfaces[i];
      this.sendSockets.push(socket);
    }
  }

  async createSendSocket (iface) {
    return new Promise((resolve, reject) => {
      let _this = this;
      this.debug('CREATE SEND SOCKET: ' + iface.address)
      let socket = DGram.createSocket({
        type: (iface.family === IPv4 ? 'udp4' : 'udp6'),
        reuseAddr: this.Config.reuseAddr
      })
        .once('error', (err) => {
          reject(new Error(err.message));
        })
        .on('error', _this.socketError)
        .on('listening', () => {
          resolve(socket);
        })
        .on('message', (msg, rinfo) => {
        // include interface name so we know where the message came in
          rinfo.interface = iface.name;
          _this.onMessage(msg, rinfo);
        })
        .bind(0, iface.address + (iface.family === 'IPv4' ? '' : '%' + iface.name));
    });
  }

  getInterfaces () {
    let interfaces = (this.Config.interfaces ? this.getInterfacesFromStrings(this.Config.interfaces) : this.getAllInterfaces());
    this.debug('GET INTERFACES: ' + Util.inspect(interfaces));
    return interfaces;
  }

  getAllInterfaces () {
    let interfaces = [];
    let names = [];
    let osInterfaces = OS.networkInterfaces();
    this.debug('OS INTERFACES: ' + Util.inspect(osInterfaces));
    for (let [name, iface] of Object.entries(osInterfaces)) {
      if (names.includes(name)) {
        continue;
      }
      names.push(name);
      iface.forEach((assignment) => {
        if (
          assignment.internal ||
          (assignment.family !== IPv4 && assignment.family !== IPv6) ||
          /^(2002|2001):/ig.exec(assignment.address)
        ) {
          // unsupported family, internal interface, or special IPv6 prefix
          return;
        }
        interfaces.push({ name: name, address: assignment.address, family: assignment.family });
      });
    }
    return interfaces;
  }

  getInterfacesFromStrings (interfaceStrings) {
    return this.getAllInterfaces().filter((iface) => {
      return interfaceStrings.reduce((result, interfaceString) => {
        return result || (((IP.isV4Format(interfaceString) || IP.isV6Format(interfaceString)) && IP.isEqual(iface.address, interfaceString)) || iface.name === interfaceString ? true : false);
      }, false);
    });
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
        (this.sendSockets[i].iface.family === 'IPv4' ? MDNS_IPV4 : MDNS_IPV6 + '%' + this.sendSockets[i].iface.name),
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
