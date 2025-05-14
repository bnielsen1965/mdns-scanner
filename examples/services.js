
// example of scanner that sends a query and listens for raw mDNS packets

const { Scanner, Services } = require('../index.js');

// create instance of scanner with init disabled
let scanner = new Scanner({
  debug: true,
//  interfaces: '192.168.8.190'
//  interfaces: ['fe80::a025:dc5b:22b7:2247']
//  interfaces: ['enp6s0']//, '192.168.18.130']
});

let services = new Services(scanner, { debug: true });

// services event listners
services
  .on('error', error => {
    console.log('ERROR EVENT', error.message);
  })
  .on('warn', message => {
    console.log('WARN EVENT', message)
  })
  .on('debug', message => {
    console.log('DEBUG EVENT', message);
  })
  .on('query', (message, rinfo) => {
    console.log('QUERY EVENT', `from: ${rinfo.address},`, 'questions:', message.questions)
  })
  .on('discovered', message => {
    console.log('DISCOVERED EVENT', JSON.stringify(message, null, 2));
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
  let types = services.types.slice();
  types.sort();
  console.log('Discovered types:', types);
  Object.keys(services.namedServices).forEach(name => {
    console.log(`Service: ${name} from ${services.namedServices[name].rinfo.address}.`);
    if(services.namedServices[name].service) console.log('Data:', services.namedServices[name]);
  });
  scanner.destroy();
  process.exit(0);
}, 15000);
