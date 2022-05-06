
const EventEmitter = require('events');
const Constants = require('./constants');

const Defaults = {
  debug: false
};

class MDNSServices extends EventEmitter {
  constructor (scanner, config) {
    super();
    this.scanner = scanner;
    this.Config = Object.assign({}, Defaults, config);
    this.forwardEvents(this.scanner);
    this.reset();
  }

  // reset services
  reset () {
    this.removeMDNSListener(this.scanner);
    this.types = [];
    this.namedServices = {};
    this.listenMDNSEvents(this.scanner);
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
    scanner.on('packet', this.onPacket.bind(this));
  }

  // remove packet listener
  removeMDNSListener (scanner) {
    scanner.removeListener('packet', this.onPacket);
  }

  // on scanner packet handler
  onPacket (packet, rinfo) {
    this.emitDebug(`Received packet type ${packet.type} from ${rinfo.address}.`);
    switch (packet.type) {
      case 'query':
        this.emit('query', packet, rinfo);
        break;

      case 'response':
        this.emitDebug(`Received response packet from ${rinfo.address} with ${packet.answers ? packet.answers.length : 0} answers.`);
        if (packet.answers) this.processAnswers(packet.answers, rinfo);
        if (packet.additionals) this.processAnswers(packet.additionals, rinfo)                ;

        break;
    }
  }

  // process answers in a response type packet
  processAnswers (answers, rinfo) {
    this.emitDebug('Processing answers...');
    // process service answers
    let serviceNames = this.processSRVAnswers(answers);
    this.processTXTAnswers(answers);
    this.processAAnswers(answers);
    this.processAAAAAnswers(answers);
    this.processPTRAnswers(answers, rinfo);
    serviceNames.forEach(name => {
      this.emit('discovered', { type: 'service', data: this.namedServices[name] });
    });
  }

  processSRVAnswers (answers) {
    let serviceNames = [];
    answers.forEach(answer => {
      if (answer.type != 'SRV') return;
      this.emitDebug(`Processing SRV answer.`);
      let fullName = answer.name.toString();
      if (! serviceNames.includes(fullName)) serviceNames.push(fullName);
      this.namedServices[fullName] = this.namedServices[fullName] || {};
      this.namedServices[fullName].service = answer;
      this.namedServices[fullName].host = answer.data.target.toString();
      this.namedServices[fullName].port = answer.data.port;
    });
    return serviceNames;
  }

  processTXTAnswers (answers) {
    answers.forEach(answer => {
      if (answer.type != 'TXT') return;
      this.emitDebug(`Processing TXT answer.`);
      if (answer.data.length > 1) {
        let fullName = answer.name.toString();
        this.namedServices[fullName] = this.namedServices[fullName] || {};
        this.namedServices[fullName].txt = this.answerDataToKeyValues(answer.data);
      }
    });
  }

  processAAnswers (answers) {
    answers.forEach(answer => {
      if (answer.type != 'A') return;
      this.emitDebug(`Processing A answer.`);
      let hostName = answer.name.toString();
      let address = answer.data.toString();
      for (const serviceName in this.namedServices) {
        if (this.namedServices[serviceName].host != hostName) continue;
        this.namedServices[serviceName].addresses = this.namedServices[serviceName].addresses || [];
        let exists = this.namedServices[serviceName].addresses.reduce((e, a) => {
          return e || a.address == address;
        }, false);
        if (!exists) this.namedServices[serviceName].addresses.push({ family: Constants.IPv4, address });
      }
    });
  }

  processAAAAAnswers (answers) {
    answers.forEach(answer => {
      if (answer.type != 'AAAA') return;
      this.emitDebug(`Processing AAAA answer.`);
      let hostName = answer.name.toString();
      let address = answer.data.toString();
      for (const serviceName in this.namedServices) {
        if (this.namedServices[serviceName].host != hostName) continue;
        this.namedServices[serviceName].addresses = this.namedServices[serviceName].addresses || [];
        let exists = this.namedServices[serviceName].addresses.reduce((e, a) => {
          return e || a.address == address;
        }, false);
        if (!exists) this.namedServices[serviceName].addresses.push({ family: Constants.IPv6, address });
      }
    });
  }

  processPTRAnswers (answers, rinfo) {
    answers.forEach(answer => {
      if (answer.type != 'PTR') return;
      this.emitDebug(`Processing PTR answer.`);
      let serviceType = this.serviceTypeFromPTR(answer);
      let fullName = answer.data.toString();
      // build host service definition if fullName is a host service
      if (serviceType !== fullName) {
        this.namedServices[fullName] = this.namedServices[fullName] || {};
        this.namedServices[fullName].name = fullName.replace('.' + serviceType, '');
        this.namedServices[fullName].rinfo = rinfo
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
