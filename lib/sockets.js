
const DGram = require('dgram');
const IP = require('ip');
const Constants = require('./constants');

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
      // create multicast socket to listen for packets
      let socket = DGram.createSocket({
        type: (IP.isV4Format(settings.multicastAddress) ? 'udp4' : 'udp6'),
        reuseAddr: settings.reuseAddr
      });
      // add event listeners to socket
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
          resolve(Object.assign({ success: true }, result, { socket }));
        })
        .on('message', (msg, rinfo) => {
          settings.onMessage(msg, rinfo);
        });
      // note that socket is not yet listening
      socket.bindStatus = { listening: false };
      socket.bind({ port: settings.multicastPort, exclusive: false });
    });
  }

  // add interfaces to multicast membership group on socket
  static addMulticastMemberships (socket, settings) {
    let memberships = [];
    let failedMemberships = [];
    let family = (IP.isV4Format(settings.multicastAddress) ? [Constants.IPv4, Constants.IPv4_INT] : [Constants.IPv6, Constants.IPv6_INT]);
    settings.interfaces.forEach((iface) => {
      if (!family.includes(iface.family)) return; // unsupported family
      try {
        socket.addMembership(settings.multicastAddress, Sockets.interfaceAddress(iface));
        memberships.push(iface);
      }
      catch (error) {
        failedMemberships.push(iface);
      }
    });
    return { memberships, failedMemberships };
  }

  // create a socket to be used when sending mDNS packets
  static async createSendSocket (iface, settings, onMessage, socketError) {
    return new Promise((resolve, reject) => {
      let socket = DGram.createSocket({ 
        type: ([Constants.IPv4, Constants.IPv4_INT].includes(iface.family) ? 'udp4' : 'udp6'),
        reuseAddr: settings.reuseAddr ? true : false
      });
      socket
        .once('error', (error) => {
          socket.close();
          resolve({ success: false, error: new Error(error.message) });
        })
        .on('error', socketError)
        .on('listening', () => {
          resolve({ success: true, iface, socket, send: socket.send.bind(socket) });
        })
        .on('message', (msg, rinfo) => {
          // include interface name so we know where the message came in
          rinfo.interface = iface.name;
          onMessage(msg, rinfo);
        })
        .bind(settings.srcPort || 0, Sockets.interfaceAddress(iface));
    });
  }

  // format an interface address for mDNS socket
  static interfaceAddress (iface) {
    // return interface address with IPv6 scope if needed
    return `${iface.address}${([Constants.IPv4, Constants.IPv4_INT].includes(iface.family) ? '' : '%' + iface.name)}`;
  }

}

module.exports = Sockets;
