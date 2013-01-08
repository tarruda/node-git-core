fs = require 'fs'
path = require 'path'
temp = require 'temp'
zlib = require 'zlib'
wrench = require 'wrench'
{spawn} = require 'child_process'
{expect} = require 'chai'
{Blob, Tree, Commit, Tag} = require '../src/js'


createGitRepo = (done) ->
  temp.mkdir 'test-repo', (err, path) =>
    @path = path
    git = spawn 'git', ['init', path]
    git.on 'exit', ->
      done()

deleteGitRepo = -> wrench.rmdirSyncRecursive(@path, true)

suite 'git repository manipulation', ->

  setup createGitRepo

  teardown deleteGitRepo

  test 'write git graph to repository and check integrity', (done) ->
    d1 = new Date 1000000000
    d2 = new Date 2000000000
    d3 = new Date 3000000000
    b1 = new Blob 'test content\n'
    b2 = new Blob 'new test content\n'
    b3 = new Blob 'subdir test content\n'
    t1 = new Tree {
      'file-under-tree': b3
    }
    t2 = new Tree {
      'some-file': b1
      'some-file.txt': b2
      'sub-directory.d': t1
    }
    t3 = new Tree {
      'another-file.txt': b1
    }
    author = 'Thiago de Arruda <>'
    c1 = new Commit t1, author, null, d1, "Artificial commit 1"
    c2 = new Commit t2, author, null, d2, "Artificial commit 2", [c1]
    c3 = new Commit t3, author, null, d3, "Artificial commit 3", [c2]
    writeGitGraph @path, c3, 'master', =>
      tag = new Tag c2, 'v0.0.1', author, d2, 'Tag second commit'
      writeGitGraph @path, tag, tag.name, =>
        buf = []
        git = spawn 'git', ['fsck'], cwd: @path
        git.stdout.setEncoding('utf8')
        push = (chunk) -> buf.push(chunk)
        end = =>
          expect(buf.join '' ).to.equal ''
          done()
        git.stderr.on('data', push)
        git.stderr.on('end', end)

writeGitGraph = (repo, root, refName, cb) ->
  objs = []
  write = ->
    if objs.length
      writeGitObject(repo, objs.shift(), write)
    else
      cb()
  root.serialize ((obj) -> objs.push(obj)), (head) ->
    if refName
      if head.type == 'tag'
        refType = 'tags'
      else
        refType = 'heads'
      refPath = path.join(repo, '.git', 'refs', refType, refName)
      ref = fs.createWriteStream(refPath, mode: 0o644)
      ref.end(head.hash + '\n', 'utf8')
      ref.on('close', write)
    else
      write()
      
writeGitObject = (repo, obj, cb) ->
  hash = obj.hash
  objDir = path.join(repo, '.git', 'objects', hash.slice(0, 2))
  fs.mkdir objDir, ->
    objPath = path.join(objDir, hash.slice(2))
    objFile = fs.createWriteStream(objPath, mode: 0o444)
    deflate = zlib.createDeflate()
    deflate.pipe(objFile)
    objFile.on 'open', ->
      deflate.end(obj.data)
      if typeof cb == 'function' then objFile.on('close', cb)
    objFile.on 'error', (err) ->
      if typeof cb == 'function' then cb()

readGitObject = (repo, hash, cb) ->
  objDir = path.join(repo, '.git', 'objects', hash.slice(0, 2))
  objPath = path.join(objDir, hash.slice(2))
  objFile = fs.createReadStream(objPath)
  buf = []
  objFile.on 'data', (d) ->
    buf.push(d)
  objFile.on 'end', ->
    cb(Buffer.concat(buf))


