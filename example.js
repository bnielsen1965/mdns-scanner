
const MDNSScanner = require('./lib/mdns-scanner');

let scanner = new MDNSScanner({
  noInit: true,
  debug: true,
//  interfaces: ['enp6s0']//, '192.168.18.130']
});

scanner
  .on('error', error => {
    console.log('ERROR', error.message);
  })
  .on('warning', message => {
    console.log('WARNING', message)
  })
  .on('debug', message => {
    console.log('DEBUG', message);
  })
  .on('query', message => {
    console.log('QUERY', message)
  })
  .on('response', message => {
    console.log('RESPONSE', message)
  });

scanner.init()
  .then(() => {
    scanner.query('_services._dns-sd._udp.local', 'PTR');// { questions: [{ name: name, type: 'PTR' }] });
  })
  .catch((error) => {
    console.log('ERROR', error);
    process.exit(1);
  });



setTimeout(function () { process.exit(0); }, 15000);
