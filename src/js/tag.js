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

Tag.prototype.serialize = function(visitor) {
  var buffer
    , ts = common.timestamp(this.date)
    , contentArray = [];

  if (typeof this.object === 'string') {
    contentArray.push("object " + this.object);
    contentArray.push("type " + this.type);
    process.nextTick(end);
  } else {
    buffer = this.object.serialize(visitor);
    contentArray.push("object " + buffer.hash);
    contentArray.push("type " + buffer.type);
  }

  contentArray.push("tag " + this.name);
  contentArray.push("tagger " + this.tagger + " " + ts);
  contentArray.push('\n');
  contentArray.push(this.message);

  return this._serialize(new Buffer(contentArray.join('\n')), visitor);
};

Tag.prototype.typeCode = 4;

module.exports = Tag;
