var util = require('util')
  , common = require('./common');


function Commit(options) {
  this.constructor.super_.call(this);
  if (options) {
    this.tree = options.tree;
    this.author = options.author;
    this.committer = options.committer;
    this.message = options.message;
    this.parents = options.parents;
  }
}
util.inherits(Commit, common.GitObject);

Commit.prototype.serialize = function(visitor) {
  var i, parent, serialized
    , contentArray = [];

  serialized = this.tree.serialize(visitor);
  contentArray.push('tree ' + serialized.getHash());

  if (this.parents)
    for (i = 0; i < this.parents.length; i++) {
      parent = this.parents[i];
      if (typeof parent === 'string') {
        contentArray.push('parent ' + parent);
      } else if (parent instanceof Commit) {
        serialized = parent.serialize(visitor);
        contentArray.push('parent ' + serialized.getHash());
      }
    }

  contentArray.push("author " + this.author.name + " <" +
                   (this.author.email || '') + "> " +
                   common.timestamp(this.author.date));
  if (!this.committer) this.committer = this.author;
  contentArray.push("committer " + this.committer.name + " <" +
                   (this.committer.email || '') + "> " +
                   common.timestamp(this.committer.date));
  contentArray.push('\n');
  contentArray.push(this.message);

  return this._serialize(new Buffer(contentArray.join('\n')), visitor);
};

Commit.prototype.resolveReferences = function(objectPool) {
  var i;

  this.tree = objectPool[this.tree] || this.tree;

  if (this.parents)
    for (i = 0;i < this.parents.length;i++)
      this.parents[i] = objectPool[this.parents[i]] || this.parents[i];
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
  match = /^author\s(.+)\s<(.*)>\s(.+)$/.exec(info.contents.slice(
    pos, common.findLinefeed(info.contents, pos)).toString('utf8'));
  if (match) {
    author = {
        name: match[1]
      , email: match[2]
      , date: common.parseDate(match[3])
    };
    pos += Buffer.byteLength(match[0]) + 1;
  }

  // committer
  match = /^committer\s(.+)\s<(.*)>\s(.+)$/.exec(info.contents.slice(
    pos, common.findLinefeed(info.contents, pos)).toString('utf8'));
  if (match) {
    committer = {
        name: match[1]
      , email: match[2]
      , date: common.parseDate(match[3])
    };
    pos += Buffer.byteLength(match[0]) + 1;
  }

  pos += 2;

  // message
  message = info.contents.slice(pos).toString('utf8');

  return [
      new Commit({
          tree: tree
        , author: author
        , committer: committer
        , message: message
        , parents: parents
      })
    , info.hash
  ];
};

module.exports = Commit;
