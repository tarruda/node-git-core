var util = require('util')
  , common = require('./common')
  , Commit = require('./commit')
  , Tree = require('./tree')
  , Blob = require('./blob');


function Tag(options) {
  this.constructor.super_.call(this);
  if (options) {
    this.object = options.object;
    this.name = options.name;
    this.tagger = options.tagger;
    this.date = options.date;
    this.message = options.message;
    this.type = options.type;
  }
}
util.inherits(Tag, common.GitObject);

Tag.prototype.serialize = function(visitor) {
  var serialized
    , contentArray = [];

  if (typeof this.object === 'string') {
    contentArray.push("object " + this.object);
    contentArray.push("type " + this.type);
  } else {
    serialized = this.object.serialize(visitor);
    contentArray.push("object " + serialized.getHash());
    contentArray.push("type " + serialized.getType());
  }

  contentArray.push("tag " + this.name);
  contentArray.push("tagger " + this.tagger.name + " <" +
                   (this.tagger.email || '') + "> " +
                   common.timestamp(this.date) + '\n');
  contentArray.push(this.message);

  return this._serialize(new Buffer(contentArray.join('\n')), visitor);
};

Tag.prototype.resolveReferences = function(objectPool) {
  this.object = objectPool[this.object] || this.object;
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
  if (match) {
    type = match[1];
    pos += match[0].length + 1;
  }

  // tag name
  match = /^tag\s(.+)$/.exec(info.contents.slice(
    pos, common.findLinefeed(info.contents, pos)).toString('utf8'));
  if (match) {
    tag = match[1];
    pos += Buffer.byteLength(match[0]) + 1;
  }

  // tagger
  match = /^tagger\s(.+)\s<(.*)>\s(.+)$/.exec(info.contents.slice(
    pos, common.findLinefeed(info.contents, pos)).toString('utf8'));
  if (match) {
    tagger = {
        name: match[1]
      , email: match[2]
    };
    date = common.parseDate(match[3]);
    pos += Buffer.byteLength(match[0]) + 1;
  }

  pos += 1;

  // message
  message = info.contents.slice(pos).toString('utf8');

  return [
      new Tag({
          object: object
        , type: type
        , name: tag
        , tagger: tagger
        , date: date
        , message: message
      })
    , info.hash
  ];
};

module.exports = Tag;
