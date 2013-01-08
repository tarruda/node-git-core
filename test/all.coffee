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
    author = 'Thiago de Arruda <user@domain.com>'
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
  count = 0
  writeCb = ->
    count--
    cb() if !count
  headBuffer = root.toBuffer (buffer) ->
    count++
    writeGitBuffer(repo, buffer, writeCb)
  if refName
    if headBuffer.type == 'tag'
      refType = 'tags'
    else
      refType = 'heads'
    refPath = path.join(repo, '.git', 'refs', refType, refName)
    fs.writeFileSync(refPath, headBuffer.hash, 'utf8')
      
writeGitBuffer = (repo, buffer, cb) ->
  hash = buffer.hash
  dir = path.join(repo, '.git', 'objects', hash.slice(0, 2))
  fs.mkdir dir, ->
    bufferPath = path.join(dir, hash.slice(2))
    bufferFile = fs.createWriteStream(bufferPath, mode: 0o444)
    deflate = zlib.createDeflate()
    deflate.pipe(bufferFile)
    bufferFile.on 'open', ->
      deflate.end(buffer.data)
      if typeof cb == 'function' then bufferFile.on('close', cb)
    bufferFile.on 'error', (err) ->
      if typeof cb == 'function' then cb()
