var i, codes, types
  , crypto = require('crypto')
  , zlib = require('./zlib')
  , Commit = require('./commit')
  , Tree = require('./tree')
  , Blob = require('./blob')
  , Tag = require('./tag')
  , MAGIC = 'PACK';


codes = {
    commit: {code: 1, cls: Commit}
  , tree: {code: 2, cls: Tree}
  , blob: {code: 3, cls: Blob}
  , tag: {code: 4, cls: Tag}
  , ofsdelta: {code: 6}
  , refdelta: {code: 7}
};
types = {};
Object.keys(codes).forEach(function(k) {
  types[codes[k].code] = codes[k].cls;
});

// this implementation is based on the information at
// http://www.kernel.org/pub/software/scm/git/docs/technical/pack-format.txt
function Pack(objects) {
  this.objects = objects || [];
}

// FIXME this class does not currently applies delta compression to 
// similar objects in the pack, so it is mostly useful for sending
// small amounts of git objects to a remote repository
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
    typeBits = codes[serialized.getType()].code << 4;
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

Pack.deserialize = function(buffer) {
  var i, count, pos, type, entryHeader, inflatedEntry, inflatedData
    , deserialized, k, cls, size
    , hash = crypto.createHash('sha1')
    , objectsById = {} // used after parsing objects to connect references
    , rv = new Pack(); 

  // verify magic number
  if (buffer.slice(0, 4).toString('utf8') !== MAGIC)
    throw new Error('Invalid pack magic number');
  hash.update(buffer.slice(0, 4));

  // only accept version 2 packs
  if (buffer.readUInt32BE(4) !== 2)
    throw new Error('Invalid pack version');
  hash.update(buffer.slice(4, 8));

  count = buffer.readUInt32BE(8);
  hash.update(buffer.slice(8, 12));
  pos = 12;

  // unpack all objects
  for (i = 0;i < count;i++) {
    type = (buffer[pos] & 0x70) >>> 4
    cls = types[type];
    if (!cls)
      throw new Error('invalid pack entry type');
    entryHeader = decodePackEntryHeader(buffer, pos);
    hash.update(buffer.slice(pos, entryHeader[1]));
    size = entryHeader[0];
    pos = entryHeader[1];
    inflatedEntry = zlib.inflate(buffer.slice(pos), size);
    hash.update(buffer.slice(pos, pos + inflatedEntry[1]));
    inflatedData = inflatedEntry[0];
    pos += inflatedEntry[1];
    deserialized = cls.deserialize(inflatedData);
    objectsById[deserialized[1]] = deserialized[0];
    rv.objects.push(deserialized[0]);
  }

  // verify pack integrity
  if (hash.digest('hex') !== buffer.slice(pos, pos + 20).toString('hex'))
    throw new Error('Invalid pack checksum')

  // connect the objects
  for (k in objectsById) {
    objectsById[k].resolveReferences(objectsById);
  }

  return rv;
};

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

function decodePackEntryHeader(buffer, offset) {
  var bits = 4
    , byte = buffer[offset] & 0xf
    , rv = byte;

  while (buffer[offset++] & 0x80) {
    byte = buffer[offset] & 0x7f;
    rv += byte << bits;
    bits += 7;
  }

  return [rv, offset];
}

module.exports = Pack;
