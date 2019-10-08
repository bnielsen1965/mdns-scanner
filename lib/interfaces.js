'use strict';

const OS = require('os');
const IP = require('ip');

const IPv4 = 'IPv4';
const IPv6 = 'IPv6';

class Interfaces {

  static getAllInterfaces () {
    let interfaces = [];
    let names = [];
    let osInterfaces = OS.networkInterfaces();
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

  static getInterfacesFromStrings (interfaceStrings) {
    return this.getAllInterfaces().filter((iface) => {
      return interfaceStrings.reduce((result, interfaceString) => {
        return result || (((IP.isV4Format(interfaceString) || IP.isV6Format(interfaceString)) && IP.isEqual(iface.address, interfaceString)) || iface.name === interfaceString ? true : false);
      }, false);
    });
  }
}

module.exports = Interfaces;
