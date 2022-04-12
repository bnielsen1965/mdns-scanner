# mdns-scanner

A NodeJS module used to scan for multi-cast DNS entries.

The mdns-scanner module provides a *scanner* and *services* class. The scanner
class listens for raw mDNS packets on IPv4 and/or IPv6 interfaces while providing
a query method to send mDNS queries out on the interfaces. The services class is
optionally used with a scanner instance to process the raw mDNS packets into
collated service details.


# Usage

The *scanner* and *services* classes cover two possible use cases. Low level
monitoring of mDNS packets on a network and higher level mDNS packet analysis
to collate a list of discovered network services.


## Low level monitoring

The *scanner* class is used to setup a packet listener on one or more network
interfaces where you need to listen for mDNS packets. The scanner will emit
*packet* events with the raw packet when any mDNS packet is received. Raw mDNS
packets can then be processed by an event handler in an application.


## High level service discovery

The *services* class is provided as a means of collating mDNS packets into a
coherent list of discovered network services. An instance of the services class
takes a scanner instance and listens for the mDNS packets which it then processes
into a stored list of discovered network services and details.


# Scanner class

The Scanner class is used to listen for multi-cast DNS (mDNS) packets and send
mDNS queries over the network to initiate discovery of available services. Create
and initialize a Scanner instance to start listening for mDNS packets and use the
query() method to send mDNS queries. The Scanner class will emit events to
indicate conditions, status, and received mDNS packets.

Example:
```javascript
// create scanner and set listeners
const { Scanner } = require('mdns-scanner');
let scanner = new Scanner({ debug: true });
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
    scanner.query('_services._dns-sd._udp.local', 'ANY');
  })
  .catch((error) => {
    console.log('CAUGHT ERROR', error.message);
    process.exit(1);
  });

```


## Scanner events

A scanner instance will emit events to communicate scanner condition, status, and
received packets.


### error

The error event is emitted when an error occurs during initialization or operation
of the Scanner class. The event payload is an error message.


### warn

A warn event is emitted when a failure occurs that will not stop the Scanner from
operating. The payload for the warn event is a message with a reason for the warning.


### debug

When debug is enabled the debug events will be emitted during initialization and
operation to provide greater detail for diagnostics.


### packet

The packet event is emitted whenever an mDNS packet is received by the Scanner.
The payload includes two arguments, the raw packet object and an rinfo object
with details about the receiving interface.

**NOTE:** The Services class can be used to consume the packet events from a
Scanner instance to produce service details.


## Scanner methods


### constructor(config)

The constructor accepts a configuration object with parameters used to setup the
Scanner instance.
```javascript
let scanner = new Scanner({
  reuseAddr: true,
  interfaces: null,
  ttl: 255,
  loopback: true,
  debug: false
});
```


#### reuseAddr

Reuse address when socket binds even if another socket is bound to the address.
Default: true


#### ttl

Number of IP hops allowed for multi-cast packets.
Default: 255


#### loopback

Sets whether local multi-cast packets will be received on the local interface.
Default: true


#### interfaces

The interfaces to use in the scanner. If not set then the Scanner will use all
usable interfaces. To specify interfaces use a string, or an array of strings,
with the interface address or name.


#### debug

Enable debug messages.


### on(event, handler)

Use the on(event, handler) method to attach listeners to the Scanner events.


### async init()

Before a Scanner can be used it must be initialized, the asynchronous init()
method will prepare the Scanner for operation. When the init() method resolves
it will return the ready status of the Scanner.

```javascript
// initialize scanner and send a query
scanner.init()
  .then(ready => {
    if (!ready) throw new Error('Scanner not ready after init.');
    scanner.query('_services._dns-sd._udp.local', 'ANY');
  })
  .catch((error) => {
    console.log('CAUGHT ERROR', error.message);
    process.exit(1);
  });
```


### query(questions, [qtype])

After initialization use the query(questions, [qtype]) method to send mDNS query
packets over the network.

The *questions* argument can be a single query question string with *qtype*
optionally specifying the question type. Or *questions* can be an array of formatted
query questions and types.


### destroy()

When finished with a Scanner the destroy() method is called to close all sockets


# Services class

The services class is used to collate mDNS responses into meaningful service
data. This includes automatically injecting additional query packets to discover
complete details about advertised services.

Example:
```javascript
const { Scanner, Services } = require('mdns-scanner');
let scanner = new Scanner({ debug: true });
let services = new Services(scanner);

// services event listeners
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
  .on('query', message => {
    console.log('QUERY EVENT', message.questions)
  })
  .on('discovered', message => {
    console.log('DISCOVERED EVENT', message);
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
    if(services.namedServices[name].service) console.log('Data:', services.namedServices[name].service.data);
  });
  scanner.destroy();
  process.exit(0);
}, 15000);

```


## Services events

The Services class forwards the error, warn, and debug events from the associated
Scanner class making it possible to use event listeners on only the Services class
in place of listeners on both classs. The Services class adds a discovered and
query event to note when a service is discovered and to inform when a query is
received.


### error

The error event is emitted when an error occurs within the associated Scanner
instance or within the Services instance. The event payload is an error message.


### warn

A warn event is emitted when a failure occurs that will not stop the Scanner or
Services instance from operating. The payload for the warn event is a message
with a reason for the warning.


### debug

When debug is enabled the debug events will be emitted during operation. If debug
is also enabled in the Scanner class then Scanner debug events will also be
emitted from the Services class as long as debug is enabled.


### discovered

A discovered event is emitted when new service details are discovered. The payload
from the event is an object with a *type* field that specifies the type of discovery
and a *data* field that contains data from the discovery.


#### discovery types

Discovery of a service may span multiple packets which results in different discovered
event types based on the detail that is discovered.


##### discovery type type

The *type* discovery type occurs when a new service type is discovered. At this
point there may not be any detail about where and how the service is detailed,
only the type of service is discovered at this point.

Example:
```json
{
  "type": "type",
  "data": "_smb._tcp.local"
}
```


##### discovery type service

The *service* type occurs when the details about where and how a service is hosted
is discovered.

Example:
```json
{
  "type": "service",
  "data": {
    "name": "QNAP4619",
    "rinfo": {
      "address": "192.168.8.55",
      "family": "IPv4",
      "port": 2825,
      "size": 142,
      "interface": "enp6s0"
    },
    "service": {
      "name": "QNAP4619._smb._tcp.local",
      "type": "SRV",
      "ttl": 10,
      "class": "IN",
      "flush": false,
      "data": {
        "priority": 0,
        "weight": 0,
        "port": 445,
        "target": "QNAP4619.local"
      }
    },
    "host": "QNAP4619.local",
    "addresses": [
      { "family": "ipv6", "address": "fe80::265e:beff:fe40:e055" },
      { "family": "ipv4", "address": "192.168.8.55" }
    ]
  }
}
```


## Services methods


### constructor(scanner, config)

The constructor for Services accepts a Scanner instance and a configuration object.

```javascript
let scanner = new Scanner();
let Services = new Services(scanner, { debug: true });
```


### on(event, handler)

Use the on(event, handler) method to attach listeners to the Scanner events.


### reset()

The reset() method is used to clear out the list of discovered services in
preparation for a new scan. This will clear out the *types* and *namedServices*
properties.


## Services properties

While an event handler can be used to collect details about the discovered services,
the Services instance will use public properties to keep track of the discovered
services.


### types

The types Services property is an array of service type strings. This array is
updated as services types are discovered.

Example:
```json
[
  "_http._tcp.local",
  "_nvstream_dbd._tcp.local",
  "_qdiscover._tcp.local",
  "_qmobile._tcp.local",
  "_smb._tcp.local",
  "_touch-able._tcp.local",
  "_workstation._tcp.local"
]
```

### namedServices

When the details about an available service are discovered they are added to the
namedServices object where each service entry is keyed by the full service name.

Example:
```json
{
  "FD299CF6FD29._touch-able._tcp.local": {
    "name": "FD299CF6FD29",
    "rinfo": {
      "address": "fe80::d6c0:e87c:69d2:ccf1%enp0s20f0u8u2",
      "family": "IPv6",
      "port": 5353,
      "size": 241,
      "interface": "enp0s20f0u8u2"
    },
    "txt": {
      "strings": [
        ""
      ],
      "keyValuePairs": {}
    },
    "service": {
      "name": "FD299CF6FD29._touch-able._tcp.local",
      "type": "SRV",
      "ttl": 10,
      "class": "IN",
      "flush": false,
      "data": {
        "priority": 0,
        "weight": 0,
        "port": 3689,
        "target": "fedora.local"
      }
    },
    "host": "fedora.local",
    "addresses": [
      { "family": "ipv6", "address": "fe80::d6c0:e87c:69d2:ccf1" }
    ]
  },
  "QNAP4619 [24:5e:be:40:e0:55]._workstation._tcp.local": {
    "name": "QNAP4619 [24:5e:be:40:e0:55]",
    "rinfo": {
      "address": "192.168.8.55",
      "family": "IPv4",
      "port": 64930,
      "size": 170,
      "interface": "enp6s0"
    },
    "service": {
      "name": "QNAP4619 [24:5e:be:40:e0:55]._workstation._tcp.local",
      "type": "SRV",
      "ttl": 10,
      "class": "IN",
      "flush": false,
      "data": {
        "priority": 0,
        "weight": 0,
        "port": 9,
        "target": "QNAP4619.local"
      }
    },
    "host": "QNAP4619.local",
    "addresses": [
      { "family": "ipv6", "address": "fe80::265e:beff:fe40:e055" },
      { "family": "ipv4", "address": "192.168.8.55" }
    ]
  },
}
```
