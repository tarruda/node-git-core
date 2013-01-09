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
  var serialized
    , ts = common.timestamp(this.date)
    , contentArray = [];

  if (typeof this.object === 'string') {
    contentArray.push("object " + this.object);
    contentArray.push("type " + this.type);
    process.nextTick(end);
  } else {
    serialized = this.object.serialize(visitor);
    contentArray.push("object " + serialized.getHash());
    contentArray.push("type " + serialized.getType());
  }

  contentArray.push("tag " + this.name);
  contentArray.push("tagger " + this.tagger + " " + ts);
  contentArray.push('\n');
  contentArray.push(this.message);

  return this._serialize(new Buffer(contentArray.join('\n')), visitor);
};

Tag.deserialize = function(contents) {
  var pos, object, type, tag, tagger, date, message, match
    , info = common.GitObject.getObjectInfo('tag', contents);

  // object
  match = /^object\s([0-9a-f]{40})$/.exec(
    info.contents.slice(0, 47).toString('utf8'));
  if (!match)
    throw new Error('tag missing object');
  object = match[1];
  pos = 48;

  // type
  match = /^type\s(commit|tree|blob)$/.exec(info.contents.slice(
    pos, common.findLinefeed(info.contents, pos)).toString('utf8'));
  if (!match)
    throw new Error('tag missing type');
  type = match[1];
  pos += match[0].length + 1;

  // tag name
  match = /^tag\s(.+)$/.exec(info.contents.slice(
    pos, common.findLinefeed(info.contents, pos)).toString('utf8'));
  if (!match)
    throw new Error('tag missing name');
  tag = match[1];
  pos += Buffer.byteLength(match[0]) + 1;

  // tagger
  match = /^tagger\s(.+\s<.*>)\s(.+)$/.exec(info.contents.slice(
    pos, common.findLinefeed(info.contents, pos)).toString('utf8'));
  if (!match)
    throw new Error('tag missing tagger');
  tagger = match[1];
  date = common.parseDate(match[2]);
  pos = Buffer.byteLength(match[0]) + 3;

  // message
  message = info.contents.slice(pos).toString('utf8');

  return [
      new Tag(object, tag, tagger, date, message, type)
    , info.hash
  ];
};

module.exports = Tag;
