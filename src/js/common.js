var crypto = require('crypto')
  , delta = require('./delta')
  , id = 0
  , NULL = new Buffer([0]);


function timestamp(date) {
  var stamp, zone;
  date = date || new Date();
  stamp = Math.ceil(date.getTime() / 1000).toString();
  zone = formatTimezone(date);
  return stamp + ' ' + zone;
}

function formatTimezone(date) {
  var m, hOffset, mOffset
    , offset = date.getTimezoneOffset();

  hOffset = padLeft(Math.floor(offset / 60), 2, '0');
  mOffset = padLeft(offset % 60, 2, '0');

  if (offset > 0)
    return '-' + hOffset + mOffset;
  return '+' + hOffset + mOffset;
}

function padLeft(s, l, c) {
  s = s.toString();
  if (l < s.length) return s;
  else return Array(l - s.length + 1).join(c || ' ') + s;
}

// FIXME for now this function only supports git internal format
function parseDate(dateStr) {
  var epoch
    , match = /(\d+)\s(?:\+|-)(?:\d{4})/.exec(dateStr);

  if (!match)
    throw new Error('Failed to parse date');

  epoch = parseInt(match[1], 10);
  return new Date(epoch * 1000);
}

function findInBuffer(buffer, pos, b) {
  if (!pos)
    pos = 0;

  while (buffer[pos] !== b) pos++;

  return pos;
}

function findLinefeed(buffer, pos) {
  return findInBuffer(buffer, pos, 10);
}

function findNull(buffer, pos) {
  return findInBuffer(buffer, pos, 0);
}

function removeObjectHeader(objData) {
  var i = 0;

  while (objData[i] !== 0)
    i++;

  return objData.slice(i + 1);
}

function invoke(fn, context, arg) {
  if (typeof fn === 'function') fn.call(context, arg);
}

function GitObject() {
  // since when packing a git object graph we may end up visiting
  // the same object twice, this id is used to avoid duplicates
  this._id = ++id;
}

GitObject.prototype._serialize = function(content, visitor){
  var rv, hash, packData
    , type = this.constructor.name.toLowerCase()
    , header = new Buffer(type + " " + content.length)
    , data = Buffer.concat([header, NULL, content]);

    rv = {
        getHash: function() {
          if (!hash) {
            hash = crypto.createHash('sha1');
            hash.update(data);
            hash = hash.digest('hex')
          }

          return hash;
        }
      , getPackData: function() {
          if (!packData)
            packData = data.slice(header.length + 1);

          return packData
        }
      , getData: function() {
          return data;
        }
      , getType: function() {
          return type;
        }
    };
    invoke(visitor, this, rv);
    return rv;
};

GitObject.prototype.resolveReferences = function(objectPool) { };

GitObject.prototype.diff = function(other) {
  if (this.constructor !== other.constructor)
    throw new Error('Can only create deltas from objects of the same type');

  return new delta.Delta(other, this);
};

GitObject.getObjectInfo = function(type, contents) {
  var rv, header, hash, match
    , fullContents = contents;

  if (contents.slice(0, type.length).toString('utf8') !== type) {
    // append header so the hash can be calculated
    header = new Buffer(type + " " + contents.length);
    fullContents = Buffer.concat([header, NULL, contents]);
  } else {
    // remove header for return value
    contents = removeObjectHeader(contents);
    // assert that the header is valid
    header = fullContents.slice(0, fullContents.length -
                                (contents.length + 1));
    match = /^(\w+)\s(\d+)$/.exec(header.toString('utf8'));
    if (!match || match[1] !== type ||
        parseInt(match[2], 10) !== contents.length)
      throw new Error('invalid object header');
  }

  hash = crypto.createHash('sha1');
  hash.update(fullContents);

  return {hash: hash.digest('hex'), contents: contents};
};


exports.timestamp = timestamp;
exports.parseDate = parseDate;
exports.GitObject = GitObject;
exports.NULL = NULL;
exports.SHA1 = /^[0-9a-f]{40}$/i;
exports.findLinefeed = findLinefeed;
exports.findNull = findNull;
