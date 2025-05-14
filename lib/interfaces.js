
const OS = require('os');
const IP = require('ip-address');
const Constants = require('./constants');
const SupportedFamilies = [Constants.IPv4, Constants.IPv4_INT, Constants.IPv6, Constants.IPv6_INT];

class Interfaces {
  // select appropriate method based on argument
  static getInterfaces (interfaceStrings) {
    return (!interfaceStrings ? Interfaces.getAllInterfaces() : Interfaces.getInterfacesFromStrings(interfaceStrings));
  }

  // get all usable interfaces from OS
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
        // check if interface is usable
        if (
          assignment.internal ||                                                            // cannot use internal
          !SupportedFamilies.includes(assignment.family) ||                                 // can only use IPv4 and IPv6 family
          /^(2002|2001):/ig.exec(assignment.address)                                        // cannot use IPv6 special prefix
        ) return;
        interfaces.push({ name: name, address: assignment.address, family: assignment.family });
      });
    }
    if (!interfaces.length) throw new Error('No usable network interfaces returned by OS.');
    return interfaces;
  }

  // get interfaces from configuration strings
  static getInterfacesFromStrings (interfaceStrings) {
    interfaceStrings = (Array.isArray(interfaceStrings) ? interfaceStrings : [interfaceStrings]);
    let interfaces = this.getAllInterfaces().filter((iface) => {
      return interfaceStrings.reduce((result, interfaceString) => {
        // return result || (((IP.isV4Format(interfaceString) || IP.isV6Format(interfaceString)) && IP.isEqual(iface.address, interfaceString)) || iface.name === interfaceString ? true : false);
        return result || (Interfaces.stringMatchesAddress(interfaceString, iface.address) || iface.name === interfaceString ? true : false);
      }, false);
    });
    if (!interfaces || !interfaces.length) throw new Error('No usable network interfaces returned by OS.');
    return interfaces;
  }

  // compare interface settings string to os interface address
  static stringMatchesAddress (ifaceString, address) {
    // try to create address objects
    let stringAddress, addressAddress;
    try {
      stringAddress = new IP.Address4(ifaceString);
      addressAddress = new IP.Address4(address);
    } catch (e) {
      try {
        stringAddress = new IP.Address6(ifaceString);
        addressAddress = new IP.Address6(address);
      } catch (e) {
        return false;
      }
    }
    // compare addresses
    return stringAddress.bigInt() === addressAddress.bigInt();
  }
}

module.exports = Interfaces;
