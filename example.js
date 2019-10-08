
const MDNSScanner = require('./lib/mdns-scanner');
const MDNSServices = require('./lib/mdns-services');

let serviceTypes = [];

let scanner = new MDNSScanner({
  noInit: true,
  debug: true,
//  interfaces: ['enp6s0']//, '192.168.18.130']
});

let services = new MDNSServices(scanner);

//scanner
services
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
//    console.log('RESPONSE', message)
//    processResponse(message);
  })
  .on('discovered', message => {
    console.log('DISCOVERED', message);
    /*
    switch (message.type) {
      case 'type':
        let types = services.serviceTypes.slice();
        types.sort();
//        console.log('STYPES', types);
        scanner.query(message.data, 'ANY');
        break;
    }
*/
  });


scanner.init()
  .then(() => {
    scanner.query('_services._dns-sd._udp.local', 'ANY');// 'PTR');// { questions: [{ name: name, type: 'PTR' }] });
  })
  .catch((error) => {
    console.log('ERROR', error);
    process.exit(1);
  });



setTimeout(function () {
  let types = services.types.slice();
  types.sort();
  console.log('STYPES', types);
  console.log(services.namedServices);
  process.exit(0);
}, 15000);

function processResponse (response) {
  if (!response.answers) {
    return;
  }
  response.answers.forEach((answer) => {
    switch (answer.type) {
      case 'PTR':
        processPTR(answer);
        break;

      default:
        console.log('UNKNOWN TYPE', answer.type);
        break;
    }
  });
}

function processPTR (answer) {
  let serviceType = answer.data.toString();
  if (!serviceTypes.includes(serviceType)) {
    serviceTypes.push(serviceType);
    serviceTypes.sort();
    console.log('STYPES', serviceTypes);
  }
}
