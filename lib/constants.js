
class Constants {
  static MDNS_IPV4 = '224.0.0.251';
  static MDNS_IPV6 = 'FF02::FB';
  static MDNS_PORT = 5353;
  static IPv4 = 'IPv4';
  static IPv4_INT = 4;  // beginning in node 18 family is integer
  static IPv6 = 'IPv6';
  static IPv6_INT = 6;  // beginning in node 18 family is integer
  static ANY_IPV4 = '0.0.0.0';
  static ANY_IPV6 = '::';

  static ErrorMessages = {
    NO_INTERFACES: 'No available interfaces.'
  };
}

module.exports = Constants;
