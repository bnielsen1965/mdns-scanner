'use strict';

const DGram = require('dgram');
const IP = require('ip');

const IPv4 = 'IPv4';
const IPv6 = 'IPv6';

const MulticastDefaults = {
  interfaces: [],
  reuseAddr: true,
  ttl: 255,
  loopback: true,
  onMessage: (message, rinfo) => { console.log('Message ' + message.toString()); },
  socketError: (error) => { console.log('Socket error ' + error.code + ' ' + error.toString()); }
};

class Sockets {

  static validateSettings (settings) {
    if (!settings.multicastAddress) {
      throw new Error('Socket settings require multicastAddress');
    }
    if (!settings.multicastPort) {
      throw new Error('Socket settings require multicastPort');
    }
  }

  // create a multicast socket and add interfaces to group membership
  static createMulticastSocket (settings) {
    return new Promise((resolve, reject) => {
      settings = Object.assign({}, MulticastDefaults, settings);
      Sockets.validateSettings(settings);
      let socket = DGram.createSocket({
        type: (IP.isV4Format(settings.multicastAddress) ? 'udp4' : 'udp6'),
        reuseAddr: settings.reuseAddr
      });
      socket
        .on('error', (error) => {
          if (socket.bindStatus.listening) {
            settings.socketError(error);
          } else {
            socket.close();
            resolve({ success: false , error: error });
          }
        })
        .on('listening', () => {
          socket.bindStatus.listening = true;
          socket.setMulticastTTL(settings.ttl);
          socket.setMulticastLoopback(settings.loopback);
          let result = Sockets.addMulticastMemberships(socket, settings);
          if (!result.memberships.length) {
            socket.bindStatus.listening = false;
            socket.close();
            resolve({ success: false, error: new Error('No interface memberships for multicast address ' + settings.multicastAddress) });
            return;
          }
          resolve(Object.assign({ success: true }, result, { socket: socket }));
        })
        .on('message', (msg, rinfo) => {
        // include interface name so we know where the message came in
//          rinfo.interface = iface.name;
          settings.onMessage(msg, rinfo);
        });
      socket.bindStatus = {
        listening: false
      };
      socket.bind({ port: settings.multicastPort, exclusive: false });
    });
  }

  // add interfaces to multicast membership group
  static addMulticastMemberships (socket, settings) {
    let memberships = [];
    let failedMemberships = [];
    let family = (IP.isV4Format(settings.multicastAddress) ? IPv4 : IPv6);
    settings.interfaces.forEach((iface) => {
      if (iface.family !== family) {
        return;
      }
      try {
        socket.addMembership(settings.multicastAddress, iface.address + (iface.family === IPv4 ? '' : '%' + iface.name));
        memberships.push(iface.address);
      }
      catch (error) {
        failedMemberships.push(iface.address);
      }
    });
    return { memberships, failedMemberships };
  }


  static async createSendSocket (iface, onMessage, socketError) {
    return new Promise((resolve, reject) => {
      let socket = DGram.createSocket({ type: (iface.family === IPv4 ? 'udp4' : 'udp6') });
      socket
        .once('error', (error) => {
          socket.close();
          reject(new Error(error.message));
        })
        .on('error', socketError)
        .on('listening', () => {
          resolve(socket);
        })
        .on('message', (msg, rinfo) => {
        // include interface name so we know where the message came in
          rinfo.interface = iface.name;
          onMessage(msg, rinfo);
        })
        .bind(0, iface.address + (iface.family === IPv4 ? '' : '%' + iface.name));
    });
  }

}

module.exports = Sockets;
