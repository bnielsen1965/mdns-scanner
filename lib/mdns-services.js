'use strict';

const EventEmitter = require('events');

const Defaults = {

};

class MDNSServices extends EventEmitter {
  constructor (scanner, config) {
    super();
    this.scanner = scanner;
    this.Config = Object.assign({}, Defaults, config);
    this.types = [];
    this.namedServices = {};
    this.forwardEvents(scanner);
    this.listenMDNSEvents(scanner);
  }

  forwardEvents (scanner) {
    scanner
      .on('error', error => {
        this.emit('error', error);
      })
      .on('warning', message => {
        this.emit('warning', message)
      })
      .on('debug', message => {
        this.emit('debug', message);
      });
  }

  listenMDNSEvents (scanner) {
    let _this = this;
    scanner
      .on('packet', (packet, rinfo) => _this.onPacket(packet, rinfo))
  }

  onPacket (packet, rinfo) {
//    console.log('MSG', packet, rinfo);
    switch (packet.type) {
      case 'query':
        this.emit('query', packet, rinfo);
        break;

      case 'response':
        if (packet.answers) {
          this.processAnswers(packet.answers, rinfo);
        }
        break;
    }
  }

  processAnswers (answers, rinfo) {
    let services = [];
    let fullName = '';
    let hostName = '';
    let hostAddresses = {};
    answers.forEach((answer) => {
      switch (answer.type) {
        case 'PTR':
          let serviceType = this.serviceTypeFromPTR(answer);
          fullName = answer.data.toString();
          if (serviceType !== fullName) {
            this.namedServices[fullName] = this.namedServices[fullName] || {};
            this.namedServices[fullName].name = fullName.replace('.' + serviceType, '');
            this.namedServices[fullName].rinfo = rinfo
          }
          break;

        case 'TXT':
          if (answer.data.length > 1) {
            fullName = answer.name.toString();
            this.namedServices[fullName] = this.namedServices[fullName] || {};
            this.namedServices[fullName].txt = this.answerDataToKeyValues(answer.data);
          }
          break;

        case 'SRV':
          fullName = answer.name.toString();
          this.namedServices[fullName] = this.namedServices[fullName] || {};
          this.namedServices[fullName].service = answer;
          this.namedServices[fullName].host = answer.data.target.toString();
          break;

        case 'A':
          hostName = answer.name.toString();
          hostAddresses[hostName] = hostAddresses[hostName] || {};
          hostAddresses[hostName].ipv4 = answer.data.toString();
          break;

        case 'AAAA':
          hostName = answer.name.toString();
          hostAddresses[hostName] = hostAddresses[hostName] || {};
          hostAddresses[hostName].ipv6 = answer.data.toString();
          break;

        default:
          this.emit('warning', 'Unknown answer type ' + answer.type);
          break;
      }
    });
  }

  serviceTypeFromPTR (answer) {
    let match = /(?:^|^.+?(?:\.))(_.*)$/mg.exec(answer.data.toString()); // get service type without hostname
    let serviceType = match ? match[1] : answer.data.toString();
    if (!this.types.includes(serviceType)) {
      this.types.push(serviceType);
      this.emit('discovered', { type: 'type', data: serviceType });
      this.emit('debug', 'Scanning ' + serviceType);
      this.scanner.query(serviceType, 'ANY');
    }
    return serviceType;
  }

  // extract the key=value pairs from a TXT data buffer
  answerDataToKeyValues (data) {
    let strings = [];
    let kvPairs = {};
    let kvPointer = 0;
    let kvLen = data[kvPointer];
    while (kvLen) {
      let pair = data.slice(kvPointer + 1, kvPointer + 1 + kvLen);
      strings.push(pair.toString());
      let kvMatch = /^([^=]+)=([^=]*)$/.exec(pair.toString());
      if (kvMatch) {
        kvPairs[kvMatch[1]] = kvMatch[2];
      }
      kvPointer = kvPointer + 1 + kvLen;
      kvLen = data[kvPointer];
    }
    return { strings: strings, keyValuePairs: kvPairs };
  }

}

module.exports = MDNSServices;
