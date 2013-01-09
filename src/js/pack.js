var crypto = require('crypto')
  , zlib = require('./zlib')
  , MAGIC = 'PACK';


// this implementation is based on the information at
// http://www.kernel.org/pub/software/scm/git/docs/technical/pack-format.txt
function Pack(objects) {
  this.objects = objects || [];
}

// FIXME this function does not currently applies delta compression to 
// similar objects in the pack, so it is mostly useful for sending
// a relatively small amount of git objects to a remote repository
Pack.prototype.serialize = function() {
  var key, object, serialized, header, typeBits, data, encodedHeader
    , packContent, encodedHeaderBytes, deflated, checksum
    , hash = crypto.createHash('sha1')
    , contentArray = []
    , processed = {};

  // serialize all the objects
  for (var i = 0; i < this.objects.length; i++) {
    object = this.objects[i];
    if (object._id in processed)
      continue;
    object.serialize(function(serialized) {
      processed[this._id] = serialized;
    });
  }

  // calculate the packfile header
  header = new Buffer(12);
  header.write(MAGIC);
  header.writeUInt32BE(2, 4);
  header.writeUInt32BE(Object.keys(processed).length, 8);
  contentArray.push(header);
  hash.update(header);

  // start packing objects
  for (key in processed) {
    serialized = processed[key];
    // calculate the object header
    typeBits = serialized.getTypeCode() << 4;
    // the header is only used for loose objects. in packfiles they
    // should not be used
    data = serialized.getPackData();
    encodedHeaderBytes = encodePackEntrySize(data.length);
    encodedHeaderBytes[0] = encodedHeaderBytes[0] | typeBits;
    encodedHeader = new Buffer(encodedHeaderBytes);
    deflated = zlib.deflate(data);
    contentArray.push(encodedHeader);
    contentArray.push(deflated);
    hash.update(encodedHeader);
    hash.update(deflated);
  }

  // append the trailing checksum
  contentArray.push(new Buffer(hash.digest('hex'), 'hex'));

  return Buffer.concat(contentArray);
}

function encodePackEntrySize(size) {
  // this is an adaptation of LEB128: http://en.wikipedia.org/wiki/LEB128
  // with the difference that the first byte will contain type information
  // in the first 3 data bits(the first bit is still a continuation flag)
  var lastByte = size & 0xf
    , bytes = [lastByte]
    , current = size >>> 4;

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
  var bits = 4
    , byte = buffer[offset] & 0xf
    , rv = byte;

  while (buffer[offset++] & 0x80) {
    byte = buffer[offset] & 0x7f;
    rv += byte << bits;
    bits += 7;
  }

  return [rv, pos];
}

module.exports = Pack;
