var util = require('util')
  , common = require('./common')
  , Commit = require('./commit')
  , Tree = require('./tree')
  , Blob = require('./blob');


function Tag(object, name, tagger, date, message, type) {
  this.constructor.super_.call(this);
  this.object = object;
  this.name = name;
  this.tagger = tagger;
  this.date = date;
  this.message = message;
  this.type = type;
}
util.inherits(Tag, common.GitObject);

Tag.prototype.serialize = function(visitor, cb){
  var ts = common.timestamp(this.date)
    , contentArray = []
    , _this = this;

  if (typeof this.object === 'string' &&
      (!(common.SHA1.test(this.object) &&
        (this.type === 'commit' || this.type === 'tree' || this.type === 'blob')))) {
    throw new Error('Tagged object must have a type');
  } else if (!(this.object instanceof Commit ||
               this.object instanceof Tree ||
               this.object instanceof Blob)) {
    throw new Error('Tagged object must be instance of Commit, Tree or Blob');
  }

  if (typeof this.name !== 'string' || !this.name.trim()) {
    throw new Error('Invalid tag name');
  }

  if (typeof this.tagger !== 'string' || !this.tagger.trim()) {
    throw new Error('Invalid tag tagger');
  }

  if (typeof this.message !== 'string' || !this.message.trim()) {
    throw new Error('Invalid tag message');
  }

  function serializeObject() {
    if (typeof _this.object === 'string') {
      contentArray.push("object " + _this.object);
      contentArray.push("type " + _this.type);
      process.nextTick(end);
    } else {
      _this.object.serialize(visitor, function(object) {
        contentArray.push("object " + object.hash);
        contentArray.push("type " + object.type);
        process.nextTick(end);
      });
    }
  }

  function end() {
    contentArray.push("tag " + _this.name);
    contentArray.push("tagger " + _this.tagger + " " + ts);
    contentArray.push('\n');
    contentArray.push(_this.message);
    _this._writeBuffer(new Buffer(contentArray.join('\n')), visitor, cb);
  };

  process.nextTick(serializeObject);
};

Tag.prototype.typeCode = 4;

module.exports = Tag;
