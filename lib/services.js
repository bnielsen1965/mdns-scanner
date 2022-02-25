
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

  // forward events received from scanner
  forwardEvents (scanner) {
    scanner
      .on('error', error => {
        this.emitError(error);
      })
      .on('warn', message => {
        this.emitWarn(message)
      })
      .on('debug', message => {
        this.emitDebug(message);
      });
  }

  // handle packets from scanner
  listenMDNSEvents (scanner) {
    let _this = this;
    scanner.on('packet', (packet, rinfo) => _this.onPacket(packet, rinfo))
  }

  // on scanner packet handler
  onPacket (packet, rinfo) {
    this.emitDebug(`Received packet type ${packet.type} from ${rinfo.address}.`);
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

  // process answers in a response type packet
  processAnswers (answers, rinfo) {
    let services = [];
    let fullName = '';
    let hostName = '';
    let hostAddresses = {};
    answers.forEach((answer) => {
      switch (answer.type) {
        // pointer answer
        case 'PTR':
          let serviceType = this.serviceTypeFromPTR(answer);
          fullName = answer.data.toString();
          // build host service definition if fullName is a host service
          if (serviceType !== fullName) {
            this.namedServices[fullName] = this.namedServices[fullName] || {};
            this.namedServices[fullName].name = fullName.replace('.' + serviceType, '');
            this.namedServices[fullName].rinfo = rinfo
          }
          break;

        // key/value pair record
        case 'TXT':
          if (answer.data.length > 1) {
            fullName = answer.name.toString();
            this.namedServices[fullName] = this.namedServices[fullName] || {};
            this.namedServices[fullName].txt = this.answerDataToKeyValues(answer.data);
          }
          break;

        // service record
        case 'SRV':
          fullName = answer.name.toString();
          this.namedServices[fullName] = this.namedServices[fullName] || {};
          this.namedServices[fullName].service = answer;
          this.namedServices[fullName].host = answer.data.target.toString();
          break;

        // ipv4 address record
        case 'A':
          hostName = answer.name.toString();
          hostAddresses[hostName] = hostAddresses[hostName] || {};
          hostAddresses[hostName].ipv4 = answer.data.toString();
          break;

        // ipv6 address record
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

  // extract service type from answer data
  serviceTypeFromPTR (answer) {
    let match = /(?:^|^.+?(?:\.))(_.*)$/mg.exec(answer.data.toString()); // get service type without hostname
    let serviceType = match ? match[1] : answer.data.toString();
    if (!this.types.includes(serviceType)) {
      this.types.push(serviceType);
      this.emit('discovered', { type: 'type', data: serviceType });
      this.emitDebug(`Scanning service type ${serviceType}.`);
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

module.exports = MDNSServices;
