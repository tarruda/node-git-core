var i, codes, types
  , crypto = require('crypto')
  , zlib = require('./zlib')
  , delta = require('./delta')
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
  types[codes[k].code] = {cls: codes[k].cls, name: k, code: codes[k].code};
});

// this implementation is based on the information at
// http://www.kernel.org/pub/software/scm/git/docs/technical/pack-format.txt
function Pack(objects) {
  this.objects = objects || [];
}

// TODO this class does not currently applies delta compression to 
// similar objects in the pack. Implement according to info found at:
// https://raw.github.com/git/git/master/Documentation/technical/pack-heuristics.txt
Pack.prototype.serialize = function() {
  var key, object, serialized, header, typeBits, data, encodedHeader
    , packContent, encodedHeaderBytes, deflated, checksum
    , hash = crypto.createHash('sha1')
    , contentArray = []
    , processedById = {}
    , processedBySha1 = {}
    , processedDeltas = {};

  // serialize all the objects
  for (var i = 0; i < this.objects.length; i++) {
    object = this.objects[i];
    if (object._id in processedById)
      continue;
    object.serialize(function(serialized) {
      var type = serialized.getType();

      if (type === 'delta')
      processedById[this._id] = serialized;
      if (!(serialized.getHash() in processedBySha1))
        // avoid occurences with different id but same sha1
        processedBySha1[serialized.getHash()] = serialized;
    });
  }

  // calculate the packfile header
  header = new Buffer(12);
  header.write(MAGIC);
  header.writeUInt32BE(2, 4);
  header.writeUInt32BE(Object.keys(processedBySha1).length, 8);
  contentArray.push(header);
  hash.update(header);

  // start packing objects
  for (key in processedBySha1) {
    serialized = processedBySha1[key];
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

Pack.deserialize = function(buffer, resolveBase) {
  var i, count, objPos, pos, type, entryHeader, inflatedEntry, inflatedData
    , ofsDeltaHeader, base, baseOffset, baseId, patchedData, pendingDelta
    , deserialized, k, size, keys, serialized
    , hash = crypto.createHash('sha1')
    , objectsById = {} // used after parsing objects to connect references
    , baseByOffset = {} // used for resolving deltas by offset
    , baseById = {} // used for resolving deltas by reference
    , pendingByOffset = {}
    , pendingById = {}
    , rv = new Pack(); 

  // helpers to to call when adding a deserialized object
  function addObject(data, type, objPos) {
    var pendingDeltas, pendingDelta, i
      , obj = {data: data, type: type}
      , deserialized = type.cls.deserialize(data)
      , objId = deserialized[1];
      
    objectsById[objId] = deserialized[0];
    baseById[objId] = obj;
    baseByOffset[objPos] = obj;
    rv.objects.push(deserialized[0]);

    // resolve/add pending deltas that were waiting for this object
    if (pendingDeltas = pendingByOffset[objPos]) {
      for (i = 0;i < pendingDeltas.length;i++) {
        pendingDelta = pendingDeltas[i];
        addDelta(pendingDelta.data, obj, pendingDelta.offset);
      }
      delete pendingByOffset[objPos];
    }

    if (pendingDeltas = pendingById[objId]) {
      for (i = 0;i < pendingDeltas.length;i++) {
        pendingDelta = pendingDeltas[i];
        addDelta(pendingDelta.data, obj, pendingDelta.offset);
      }
      delete pendingById[objId];
    }
  }

  // resolve/add an object in delta form
  function addDelta(deltaData, base, objPos) {
    var patchedData = delta.patch(base.data, deltaData);

    addObject(patchedData, base.type, objPos);
  }

  // verify magic number
  if (buffer.slice(0, 4).toString('utf8') !== MAGIC)
    throw new Error('Invalid pack magic number');

  // only accept version 2 packs
  if (buffer.readUInt32BE(4) !== 2)
    throw new Error('Invalid pack version');

  count = buffer.readUInt32BE(8);
  pos = 12;

  // unpack all objects
  for (i = 0;i < count;i++) {
    objPos = pos;
    type = (buffer[pos] & 0x70) >>> 4;
    type = types[type];
    if (!type)
      throw new Error('invalid pack entry type');
    entryHeader = decodePackEntryHeader(buffer, pos);
    size = entryHeader[0];
    pos = entryHeader[1];
    if (type.cls) {
      inflatedEntry = zlib.inflate(buffer.slice(pos), size);
      inflatedData = inflatedEntry[0];
      pos += inflatedEntry[1];
      addObject(inflatedData, type, objPos);
    } else {
      if (type.code === 6) {
        ofsDeltaHeader = decodeOfsDeltaHeader(buffer, pos);
        pos = ofsDeltaHeader[1];
        inflatedEntry = zlib.inflate(buffer.slice(pos), size);
        inflatedData = inflatedEntry[0];
        pos += inflatedEntry[1];
        baseOffset = objPos - ofsDeltaHeader[0];
        base = baseByOffset[baseOffset];
        if (!base) {
          // I think this can only happen on thin packs which are not
          // supported yet
          if (!pendingByOffset[baseOffset])
            pendingByOffset[baseOffset] = [];
          pendingByOffset[baseOffset].push(
            {data: inflatedData, offset: objPos});
          continue;
        }
        addDelta(inflatedData, base, objPos);
      } else {
        // get the base sha1
        baseId = buffer.slice(pos, pos + 20).toString('hex');
        pos += 20;
        inflatedEntry = zlib.inflate(buffer.slice(pos), size);
        inflatedData = inflatedEntry[0];
        pos += inflatedEntry[1];
        base = baseById[baseId];
        if (!base) {
          if (!pendingById[baseId])
            pendingById[baseId] = [];
          pendingById[baseId].push({data: inflatedData, offset: objPos});
          continue;
        }
        addDelta(inflatedData, base, objPos);
      }
    }
  }

  hash.update(buffer.slice(0, pos));
  // verify pack integrity
  if (hash.digest('hex') !== buffer.slice(pos, pos + 20).toString('hex'))
    throw new Error('Invalid pack checksum')

  // ask the caller for base objects for pending deltas(thin pack)
  keys = Object.keys(pendingById);
  while (keys.length) {
    if (typeof resolveBase !== 'function')
      throw new Error('Cannot deserialize thin pack without second argument');
    k = keys.shift();
    base = resolveBase(k);
    serialized = base.serialize();
    if (serialized.getHash() !== k)
      throw new Error('Invalid base object for delta decoding');
    type = types[codes[serialized.getType()]];
    i = rv.objects.length;
    // add it temporarily
    addObject(serialized.getPackData(), type, -1);
    // all objects that were depending on this should now have been added
    // so now we remove it from the pack
    rv.objects.splice(i, 1);
    // also, recreate the 'keys' array
    keys = Object.keys(pendingById);
  }

  if (Object.keys(pendingByOffset).length)
    // no pending deltas can exist at this point
    throw new Error('Some deltas could not be resolved');

  // connect the object graph
  for (k in objectsById) {
    objectsById[k].resolveReferences(objectsById);
  }

  return rv;
};

function encodePackEntrySize(size) {
  // this is an adaptation of LEB128: http://en.wikipedia.org/wiki/LEB128
  // with the difference that the first byte will contain type information
  // in the first 3 data bits(the first bit is a continuation flag)
  var rv = [size & 0xf];
  size >>>= 4;

  while (size > 0) {
    // Set the most significant bit for the last processed byte to signal
    // that more 'size bytes' follow
    rv[rv.length - 1] |= 0x80;
    rv.push(size & 0x7f);
    size >>>= 7;
  }

  return rv;
}

function decodePackEntryHeader(buffer, offset) {
  var byte = buffer[offset++]
    , rv = byte & 0xf
    , shift = 4;

  while (byte & 0x80) {
    byte = buffer[offset++];
    rv |= (byte & 0x7f) << shift;
    shift += 7;
  }

  return [rv, offset];
}

function decodeOfsDeltaHeader(buffer, offset) {
  var byte = buffer[offset++]
    , rv = byte & 0x7f;

  while (byte & 0x80) {
    byte = buffer[offset++];
    rv++;
    rv <<= 7;
    rv |= byte & 0x7f;
  }

  return [rv, offset];
}
module.exports = Pack;
