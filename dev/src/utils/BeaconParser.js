// src/utils/BeaconParser.js
import { Buffer } from 'buffer';

class BeaconParser {
  // Main parsing method - tries multiple beacon formats
  static parseDevice(device) {
    if (!device) return null;

    // Use class references for static methods to preserve context
    const parsers = [
      BeaconParser.parseIBeacon,
      BeaconParser.parseEddystone,
      BeaconParser.parseAltBeacon,
      BeaconParser.parseCustomBeacon
    ];

    for (const parser of parsers) {
      try {
        const result = parser(device);
        if (result) {
          return {
            ...result,
            deviceId: device.id,
            deviceName: device.name,
            rssi: device.rssi,
            timestamp: Date.now()
          };
        }
      } catch (error) {
        console.warn(`Parser ${parser.name} failed:`, error);
      }
    }

    return null;
  }

  // Parse iBeacon format
  static parseIBeacon(device) {
    const manufacturerData = device.manufacturerData;
    if (!manufacturerData) return null;

    // iBeacon manufacturer data structure:
    // Bytes 0-1: Manufacturer ID (0x004C for Apple)
    // Bytes 2-3: Beacon type (0x0215 for iBeacon)
    // Bytes 4-19: UUID (16 bytes)
    // Bytes 20-21: Major (2 bytes)
    // Bytes 22-23: Minor (2 bytes)
    // Byte 24: TX Power (1 byte)

    try {
      const buffer = Buffer.from(manufacturerData, 'base64');
      
      if (buffer.length < 25) return null;

      // Check for Apple manufacturer ID (0x004C)
      const manufacturerId = buffer.readUInt16LE(0);
      if (manufacturerId !== 0x004C) return null;

      // Check for iBeacon type (0x0215)
      const beaconType = buffer.readUInt16BE(2);
      if (beaconType !== 0x0215) return null;

      // Extract UUID (16 bytes starting at index 4)
      const uuidBytes = buffer.slice(4, 20);
      const uuid = BeaconParser.formatUUID(uuidBytes);

      // Extract Major (2 bytes)
      const major = buffer.readUInt16BE(20);

      // Extract Minor (2 bytes)
      const minor = buffer.readUInt16BE(22);

      // Extract TX Power (1 byte, signed)
      const txPower = buffer.readInt8(24);

      return {
        type: 'iBeacon',
        uuid: uuid.toUpperCase(),
        major,
        minor,
        txPower,
        distance: BeaconParser.calculateDistance(device.rssi, txPower),
        proximity: BeaconParser.calculateProximity(device.rssi, txPower)
      };
    } catch (error) {
      console.warn('Failed to parse iBeacon:', error);
      return null;
    }
  }

  // Parse Eddystone format
  static parseEddystone(device) {
    const serviceData = device.serviceData;
    if (!serviceData || !serviceData['0000FEAA-0000-1000-8000-00805F9B34FB']) {
      return null;
    }

    try {
      const data = serviceData['0000FEAA-0000-1000-8000-00805F9B34FB'];
      const buffer = Buffer.from(data, 'base64');
      
      if (buffer.length < 2) return null;

      const frameType = buffer[0];
      
      switch (frameType) {
        case 0x00: // Eddystone-UID
          return BeaconParser.parseEddystoneUID(buffer, device);
        case 0x10: // Eddystone-URL
          return BeaconParser.parseEddystoneURL(buffer, device);
        case 0x20: // Eddystone-TLM
          return BeaconParser.parseEddystoneTLM(buffer);
        default:
          return null;
      }
    } catch (error) {
      console.warn('Failed to parse Eddystone:', error);
      return null;
    }
  }

  // Parse Eddystone-UID
  static parseEddystoneUID(buffer, device) {
    if (buffer.length < 20) return null;

    const txPower = buffer.readInt8(1);
    const namespaceId = buffer.slice(2, 12).toString('hex').toUpperCase();
    const instanceId = buffer.slice(12, 18).toString('hex').toUpperCase();

    return {
      type: 'Eddystone-UID',
      namespaceId,
      instanceId,
      txPower,
      distance: BeaconParser.calculateDistance(device.rssi, txPower),
      proximity: BeaconParser.calculateProximity(device.rssi, txPower)
    };
  }

  // Parse Eddystone-URL
  static parseEddystoneURL(buffer, device) {
    if (buffer.length < 4) return null;

    const txPower = buffer.readInt8(1);
    const urlScheme = buffer[2];
    const encodedUrl = buffer.slice(3);

    const url = BeaconParser.decodeEddystoneURL(urlScheme, encodedUrl);

    return {
      type: 'Eddystone-URL',
      url,
      txPower,
      distance: BeaconParser.calculateDistance(device.rssi, txPower),
      proximity: BeaconParser.calculateProximity(device.rssi, txPower)
    };
  }

  // Parse Eddystone-TLM
  static parseEddystoneTLM(buffer) {
    if (buffer.length < 14) return null;

    try {
      const version = buffer[1];
      const batteryVoltage = buffer.readUInt16BE(2) / 1000; // Convert to volts
      const temperature = buffer.readInt16BE(4) / 256; // Convert to Celsius
      const advertisementCount = buffer.readUInt32BE(6);
      const uptime = buffer.readUInt32BE(10);

      return {
        type: 'Eddystone-TLM',
        version,
        batteryVoltage,
        temperature,
        advertisementCount,
        uptime
      };
    } catch (error) {
      console.warn('Failed to parse Eddystone-TLM:', error);
      return null;
    }
  }

  // Parse AltBeacon format
  static parseAltBeacon(device) {
    const manufacturerData = device.manufacturerData;
    if (!manufacturerData) return null;

    try {
      const buffer = Buffer.from(manufacturerData, 'base64');
      
      if (buffer.length < 28) return null;

      // Check for AltBeacon identifier (0xBEAC)
      const identifier = buffer.readUInt16BE(2);
      if (identifier !== 0xBEAC) return null;

      // Extract beacon data
      const beaconId = buffer.slice(4, 24).toString('hex').toUpperCase();
      const refRssi = buffer.readInt8(24);
      const mfgReserved = buffer[25];

      return {
        type: 'AltBeacon',
        beaconId,
        refRssi,
        mfgReserved,
        distance: BeaconParser.calculateDistance(device.rssi, refRssi),
        proximity: BeaconParser.calculateProximity(device.rssi, refRssi)
      };
    } catch (error) {
      console.warn('Failed to parse AltBeacon:', error);
      return null;
    }
  }

  // Parse custom beacon formats
  static parseCustomBeacon(device) {
    // Add custom parsing logic for specific beacon types
    // This is where you can add support for proprietary beacon formats
    
    const manufacturerData = device.manufacturerData;
    if (!manufacturerData) return null;

    try {
      const buffer = Buffer.from(manufacturerData, 'base64');
      
      // Example: Parse Estimote beacon
      if (buffer.length >= 25) {
        const manufacturerId = buffer.readUInt16LE(0);
        
        // Estimote manufacturer ID (0x015D)
        if (manufacturerId === 0x015D) {
          return BeaconParser.parseEstimoteBeacon(buffer, device);
        }
        
        // Kontakt.io manufacturer ID (0x0059)
        if (manufacturerId === 0x0059) {
          return BeaconParser.parseKontaktBeacon(buffer, device);
        }
        
        // Radius Networks manufacturer ID (0x0118)
        if (manufacturerId === 0x0118) {
          return BeaconParser.parseRadiusBeacon(buffer, device);
        }
        
        // Generic manufacturer data parsing for unknown beacons
        if (buffer.length >= 4) {
          return BeaconParser.parseGenericManufacturerData(buffer, device, manufacturerId);
        }
      }

      return null;
    } catch (error) {
      console.warn('Failed to parse custom beacon:', error);
      return null;
    }
  }

  // Parse Estimote beacon
  static parseEstimoteBeacon(buffer, device) {
    if (buffer.length < 25) return null;

    try {
      // Estimote specific parsing logic
      const uuid = BeaconParser.formatUUID(buffer.slice(4, 20));
      const major = buffer.readUInt16BE(20);
      const minor = buffer.readUInt16BE(22);
      const txPower = buffer.readInt8(24);

      return {
        type: 'Estimote',
        uuid: uuid.toUpperCase(),
        major,
        minor,
        txPower,
        distance: BeaconParser.calculateDistance(device.rssi, txPower),
        proximity: BeaconParser.calculateProximity(device.rssi, txPower)
      };
    } catch (error) {
      return null;
    }
  }

  // Parse Kontakt.io beacon
  static parseKontaktBeacon(buffer, device) {
    if (buffer.length < 25) return null;

    try {
      // Kontakt.io specific parsing logic
      const uuid = BeaconParser.formatUUID(buffer.slice(4, 20));
      const major = buffer.readUInt16BE(20);
      const minor = buffer.readUInt16BE(22);
      const txPower = buffer.readInt8(24);

      return {
        type: 'Kontakt',
        uuid: uuid.toUpperCase(),
        major,
        minor,
        txPower,
        distance: BeaconParser.calculateDistance(device.rssi, txPower),
        proximity: BeaconParser.calculateProximity(device.rssi, txPower)
      };
    } catch (error) {
      return null;
    }
  }

  // Parse Radius Networks beacon
  static parseRadiusBeacon(buffer, device) {
    if (buffer.length < 25) return null;

    try {
      // Radius Networks specific parsing logic
      const uuid = BeaconParser.formatUUID(buffer.slice(4, 20));
      const major = buffer.readUInt16BE(20);
      const minor = buffer.readUInt16BE(22);
      const txPower = buffer.readInt8(24);

      return {
        type: 'Radius',
        uuid: uuid.toUpperCase(),
        major,
        minor,
        txPower,
        distance: BeaconParser.calculateDistance(device.rssi, txPower),
        proximity: BeaconParser.calculateProximity(device.rssi, txPower)
      };
    } catch (error) {
      return null;
    }
  }

  // Parse generic manufacturer data for unknown beacon types
  static parseGenericManufacturerData(buffer, device, manufacturerId) {
    try {
      // Create a generic beacon identifier from manufacturer data
      const dataHash = buffer.toString('hex').substring(0, 16);
      const rssi = device.rssi;
      
      // Estimate TX power based on RSSI (rough approximation)
      const estimatedTxPower = rssi + 50; // Rough estimate
      
      return {
        type: 'Generic',
        manufacturerId: `0x${manufacturerId.toString(16).padStart(4, '0')}`,
        dataHash,
        rssi,
        estimatedTxPower,
        distance: BeaconParser.calculateDistance(rssi, estimatedTxPower),
        proximity: BeaconParser.calculateProximity(rssi, estimatedTxPower),
        rawData: buffer.toString('hex')
      };
    } catch (error) {
      return null;
    }
  }

  // Format UUID from bytes to standard format
  static formatUUID(bytes) {
    const hex = bytes.toString('hex');
    return [
      hex.substring(0, 8),
      hex.substring(8, 12),
      hex.substring(12, 16),
      hex.substring(16, 20),
      hex.substring(20, 32)
    ].join('-');
  }

  // Decode Eddystone URL
  static decodeEddystoneURL(urlScheme, encodedUrl) {
    const schemes = [
      'http://www.',
      'https://www.',
      'http://',
      'https://'
    ];

    const expansions = [
      '.com/', '.org/', '.edu/', '.net/', '.info/', '.biz/', '.gov/',
      '.com', '.org', '.edu', '.net', '.info', '.biz', '.gov'
    ];

    let url = schemes[urlScheme] || '';
    
    for (let i = 0; i < encodedUrl.length; i++) {
      const byte = encodedUrl[i];
      if (byte < expansions.length) {
        url += expansions[byte];
      } else {
        url += String.fromCharCode(byte);
      }
    }

    return url;
  }

  // Calculate distance from RSSI and TX Power
  static calculateDistance(rssi, txPower) {
    if (rssi === 0) return -1;

    const ratio = (txPower - rssi) / 20.0;
    if (ratio < 1.0) {
      return Math.pow(ratio, 10);
    } else {
      const accuracy = (0.89976) * Math.pow(ratio, 7.7095) + 0.111;
      return accuracy;
    }
  }

  // Calculate proximity based on RSSI
  static calculateProximity(rssi, txPower) {
    const distance = BeaconParser.calculateDistance(rssi, txPower);
    
    if (distance < 0) return 'unknown';
    if (distance < 0.5) return 'immediate';
    if (distance < 4.0) return 'near';
    return 'far';
  }

  // Validate beacon data
  static validateBeaconData(beaconData) {
    if (!beaconData || !beaconData.type) return false;

    switch (beaconData.type) {
      case 'iBeacon':
        return beaconData.uuid && 
               typeof beaconData.major === 'number' && 
               typeof beaconData.minor === 'number';
      case 'Eddystone-UID':
        return beaconData.namespaceId && beaconData.instanceId;
      case 'Eddystone-URL':
        return beaconData.url;
      case 'AltBeacon':
        return beaconData.beaconId;
      case 'Estimote':
        return beaconData.uuid && 
               typeof beaconData.major === 'number' && 
               typeof beaconData.minor === 'number';
      case 'Kontakt':
        return beaconData.uuid && 
               typeof beaconData.major === 'number' && 
               typeof beaconData.minor === 'number';
      case 'Radius':
        return beaconData.uuid && 
               typeof beaconData.major === 'number' && 
               typeof beaconData.minor === 'number';
      case 'Generic':
        return beaconData.manufacturerId && beaconData.dataHash;
      default:
        return true; // Allow custom beacon types
    }
  }

  // Get beacon identifier string
  static getBeaconIdentifier(beaconData) {
    if (!beaconData) return null;

    switch (beaconData.type) {
      case 'iBeacon':
        return `${beaconData.uuid}-${beaconData.major}-${beaconData.minor}`;
      case 'Eddystone-UID':
        return `${beaconData.namespaceId}-${beaconData.instanceId}`;
      case 'Eddystone-URL':
        return beaconData.url;
      case 'AltBeacon':
        return beaconData.beaconId;
      case 'Estimote':
        return `${beaconData.uuid}-${beaconData.major}-${beaconData.minor}`;
      case 'Kontakt':
        return `${beaconData.uuid}-${beaconData.major}-${beaconData.minor}`;
      case 'Radius':
        return `${beaconData.uuid}-${beaconData.major}-${beaconData.minor}`;
      case 'Generic':
        return `${beaconData.manufacturerId}-${beaconData.dataHash}`;
      default:
        return beaconData.deviceId || 'unknown';
    }
  }

  // Filter beacons by type
  static filterBeaconsByType(beacons, type) {
    return beacons.filter(beacon => beacon.type === type);
  }

  // Sort beacons by signal strength
  static sortBeaconsBySignalStrength(beacons) {
    return beacons.sort((a, b) => b.rssi - a.rssi);
  }

  // Sort beacons by distance
  static sortBeaconsByDistance(beacons) {
    return beacons.sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
  }

  // Get strongest beacon
  static getStrongestBeacon(beacons) {
    if (!beacons || beacons.length === 0) return null;
    return BeaconParser.sortBeaconsBySignalStrength(beacons)[0];
  }

  // Get closest beacon
  static getClosestBeacon(beacons) {
    if (!beacons || beacons.length === 0) return null;
    return BeaconParser.sortBeaconsByDistance(beacons)[0];
  }
}

export { BeaconParser };