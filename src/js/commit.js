var util = require('util')
  , common = require('./common');


function Commit(tree, author, committer, date, message, parents) {
  this.constructor.super_.call(this);
  this.tree = tree;
  this.author = author;
  this.committer = committer;
  this.date = date;
  this.message = message;
  this.parents = parents || [];
}
util.inherits(Commit, common.GitObject);

Commit.prototype.serialize = function(visitor) {
  var i, parent, serialized
    , ts = common.timestamp(this.date)
    , contentArray = [];

  serialized = this.tree.serialize(visitor);
  contentArray.push('tree ' + serialized.getHash());

  for (i = 0; i < this.parents.length; i++) {
    parent = this.parents[i];
    if (typeof parent === 'string') {
      contentArray.push('parent ' + parent);
    } else if (parent instanceof Commit) {
      serialized = parent.serialize(visitor);
      contentArray.push('parent ' + serialized.getHash());
    }
  }

  contentArray.push("author " + this.author + " " + ts);
  if (!this.committer) this.committer = this.author;
  contentArray.push("committer " + this.committer + " " + ts);
  contentArray.push('\n');
  contentArray.push(this.message);

  return this._serialize(new Buffer(contentArray.join('\n')), visitor);
};

Commit.deserialize = function(contents) {
  var pos, tree, author, committer, date, message, match
    , parents = []
    , info = common.GitObject.getObjectInfo('commit', contents);

  // tree
  match = /^tree\s([0-9a-f]{40})$/.exec(info.contents.slice(0, 45));
  if (!match)
    throw new Error('commit missing tree');
  tree = match[1];
  pos = 46; // linefeed

  // parents
  while (match = /^parent\s([0-9a-f]{40})$/.exec(
    info.contents.slice(pos, pos + 47).toString('utf8'))) {
    parents.push(match[1]);
    pos += 48;
  }

  // author
  match = /^author\s(.+\s<.*>)\s(.+)$/.exec(info.contents.slice(
    pos, common.findLinefeed(info.contents, pos)).toString('utf8'));
  if (!match)
    throw new Error('commit missing author');
  author = match[1];
  date = common.parseDate(match[2]);
  pos += Buffer.byteLength(match[0]) + 1;

  // committer
  // FIXME ignoring commit date
  match = /^committer\s(.+\s<.*>)\s(?:.+)$/.exec(info.contents.slice(
    pos, common.findLinefeed(info.contents, pos)).toString('utf8'));
  if (!match)
    throw new Error('commit missing committer');
  committer = match[1];
  pos += Buffer.byteLength(match[0]) + 3;

  // message
  message = info.contents.slice(pos).toString('utf8');

  return [
      new Commit(tree, author, committer, date, message, parents)
    , info.hash
  ];
};

module.exports = Commit;
