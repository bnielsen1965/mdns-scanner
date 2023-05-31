
// example of scanner that sends a query and listens for raw mDNS packets

const { Scanner } = require('../index.js');

// create instance of scanner with init disabled
let scanner = new Scanner({
  debug: true,
  reuseAddr: true,
  srcPort: 5353
//  interfaces: '192.168.8.238'
//  interfaces: ['fe80::a025:dc5b:22b7:2247']
//  interfaces: ['enp6s0']//, '192.168.18.130']
});


// scanner event listners
scanner
  .on('error', error => {
    console.log('ERROR EVENT', error.message);
  })
  .on('warn', message => {
    console.log('WARN EVENT', message)
  })
  .on('debug', message => {
    console.log('DEBUG EVENT', message);
  })
  .on('packet', (packet, rinfo) => {
    console.log(
      'RECVD PACKET',
      `from ${rinfo.address}`,
      `type: ${packet.type}, questions: ${packet.questions ? packet.questions.length : 'none'}, answers: ${packet.answers ? packet.answers.length : 'none'}`,
      `[${packet.answers ? packet.answers.map(a => a.data).join(', ') : ''}]`
    );
  });


// initialize scanner and send a query
scanner.init()
  .then(ready => {
    if (!ready) throw new Error('Scanner not ready after init.');
    // send a query
    scanner.query('_services._dns-sd._udp.local', 'ANY');
  })
  .catch((error) => {
    console.log('CAUGHT ERROR', error.message);
    process.exit(1);
  });


// end scan after delay
setTimeout(() => {
  scanner.destroy();
  process.exit(0);
}, 15000);
