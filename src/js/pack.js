var crypto = require('crypto')
  , zlib = require('./zlib');


// this implementation is based on the information at
// http://www.kernel.org/pub/software/scm/git/docs/technical/pack-format.txt
function Pack(objects) {
  this.objects = objects || [];
}

// FIXME this function does not currently applies delta compression
Pack.prototype.toBuffer = function() {
  var key, object, buffer, header, typeBits, data, encodedHeader, packContent
    , hash, encodedHeaderBytes, deflated, checksum
    , contentArray = []
    , processed = {};

  // serialize all the objects
  for (var i = 0; i < this.objects.length; i++) {
    object = this.objects[i];
    if (object._id in processed)
      continue;
    object.toBuffer(function(buffer) {
      processed[this._id] = buffer;
    });
  }

  // calculate the packfile header
  header = new Buffer(12);
  header.write("PACK");
  header.writeUInt32BE(2, 4);
  header.writeUInt32BE(Object.keys(this.objects).length, 8);
  contentArray.push(header);

  // start packing objects
  for (key in processed) {
    buffer = processed[key];
    // calculate the object header
    typeBits = obj.typeCode << 4;
    data = removeObjectHeader(obj.data);
    encodedHeaderBytes = encodePackEntrySize(data.length);
    encodedHeaderBytes[0] = encodedHeaderBytes[0] | typeBits;
    encodedHeader = new Buffer(encodedHeaderBytes);
    contentArray.push(encodedHeader);
    deflated = zlib.deflate(data);
  }

  // prepare the buffer to be returned and calculate trailing checksum
  packContent = Buffer.concat([contentArray]);
  hash = crypto.createHash('sha1');
  hash.update(packContent);
  checksum = new Buffer(hash.digest('hex'), 'hex');
  return Buffer.concat([packContent, checksum]);
}

function removeObjectHeader(buffer) {
  var i;

  while (buffer[i] != 0)
    i++;

  return buffer.slice(i + 1);
}


function encodePackEntrySize(size) {
  // The first byte will only contain the first 4 bits
  // since 3 bits will be reserved for holding type information
  // and that will be added outside this function
  var current = size >>> 4
    , lastByte = size & 0xf
    , bytes = [lastByte];

  while (current > 0) {
    // Set the most significant bit for the last processed byte to signal
    // that more 'size bytes' follow
    bytes[bytes.length - 1] = lastByte | 0x80;
    lastByte = current & 0x7f;
    bytes.push(lastByte);
    current = current >>> 7;
  }

  return bytes;
}

function decodePackEntrySize(buffer, offset) {
  var bits = 4;
    , byte = buffer[offset] & 0xf;
    , rv = byte;

  while (buffer[offset++] & 0x80) {
    byte = buffer[offset] & 0x7f;
    rv += byte << bits;
    bits += 7;
  }

  return [rv, pos];
}
