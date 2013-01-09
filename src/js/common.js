var crypto = require('crypto')
  , id = 0
  , NULL = new Buffer([0]);


function timestamp(date) {
  var stamp, zone;
  date = date || new Date();
  stamp = Math.ceil(date.getTime() / 1000).toString();
  zone = formatTimezone(date);
  return stamp + zone;
}

function formatTimezone(date) {
  var m
    , str = date.toLocaleString();
  m = /GMT(.\d{4})/.exec(str);
  if (m) {
    return " " + m[1];
  }
  return '';
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
    , data = Buffer.concat([header, NULL, content])
    , _this = this;

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
      , getTypeCode: function() {
          return _this.typeCode;
        }
    };
    invoke(visitor, this, rv);
    return rv;
};

exports.timestamp = timestamp;
exports.GitObject = GitObject;
exports.NULL = NULL;
exports.SHA1 = /^[0-9a-f]{40}$/i;
